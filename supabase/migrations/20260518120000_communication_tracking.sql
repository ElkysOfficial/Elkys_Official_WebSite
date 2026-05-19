-- Rastreio de comunicacao: encurtador de link + pixel de abertura de e-mail
--
-- Objetivo: saber se/quando o destinatario abriu um e-mail (pixel 1x1) e
-- se clicou no link de acao (link encurtado com redirect 302 logado).
--
-- Tres tabelas:
--   communications  -> 1 registro por mensagem enviada (e-mail).
--   tracked_links   -> 1 link curto por destino rastreavel de uma communication.
--   tracking_events -> eventos brutos de abertura (open) e clique (click).
--
-- Acesso: INSERT/UPDATE acontece apenas via service role (edge functions
-- send-* e a function publica `track`). RLS permite SELECT somente para
-- papeis administrativos -- nenhum acesso para o papel anon/cliente.
--
-- LGPD: tracking_events guarda IP e user-agent (dado pessoal). A finalidade
-- e medir entrega/engajamento de comunicacoes operacionais. A politica de
-- retencao (expurgo periodico) fica como pendencia operacional -- ver
-- docs/PLAN-EMAIL-WHATSAPP-TRACKING.md secao 12.

-- ---------------------------------------------------------------------------
-- 4.1 communications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.communications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            TEXT NOT NULL,
  client_id       UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  recipient_email TEXT,
  recipient_phone TEXT,
  entity_type     TEXT,
  entity_id       UUID,
  email_status    TEXT NOT NULL DEFAULT 'pending'
                  CHECK (email_status IN ('pending', 'sent', 'failed', 'skipped')),
  -- whatsapp_status fica reservado para a fase futura de espelhamento no
  -- WhatsApp; por ora nunca e populado.
  whatsapp_status TEXT
                  CHECK (whatsapp_status IS NULL
                         OR whatsapp_status IN ('pending', 'sent', 'failed', 'skipped')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.communications IS
  'Uma linha por mensagem enviada pelo portal (cobranca, proposta, documento, etc.). Base do rastreio de abertura/clique.';
COMMENT ON COLUMN public.communications.kind IS
  'Nome logico do envio, igual ao da edge function send-* (ex.: invoice_due, proposal_sent).';
COMMENT ON COLUMN public.communications.entity_type IS
  'Tipo da entidade de origem (charge, proposal, document, project, ticket, client...).';

-- ---------------------------------------------------------------------------
-- 4.2 tracked_links
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tracked_links (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             TEXT NOT NULL UNIQUE,
  communication_id UUID NOT NULL REFERENCES public.communications(id) ON DELETE CASCADE,
  target_url       TEXT NOT NULL,
  channel          TEXT NOT NULL DEFAULT 'email'
                   CHECK (channel IN ('email', 'whatsapp')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tracked_links IS
  'Link curto (slug base62 ~7 chars) que faz redirect 302 para target_url logando o clique.';

-- ---------------------------------------------------------------------------
-- 4.3 tracking_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tracking_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  communication_id UUID NOT NULL REFERENCES public.communications(id) ON DELETE CASCADE,
  tracked_link_id  UUID REFERENCES public.tracked_links(id) ON DELETE CASCADE,
  event_type       TEXT NOT NULL CHECK (event_type IN ('open', 'click')),
  channel          TEXT NOT NULL DEFAULT 'email'
                   CHECK (channel IN ('email', 'whatsapp')),
  ip               INET,
  user_agent       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tracking_events IS
  'Eventos brutos de abertura (open, via pixel) e clique (click, via link curto).';

-- ---------------------------------------------------------------------------
-- 4.5 Indices
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS communications_entity_idx
  ON public.communications(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS communications_created_at_idx
  ON public.communications(created_at DESC);
CREATE INDEX IF NOT EXISTS communications_kind_idx
  ON public.communications(kind);
CREATE INDEX IF NOT EXISTS communications_client_id_idx
  ON public.communications(client_id);

-- tracked_links.slug ja tem indice unico implicito pelo UNIQUE.
CREATE INDEX IF NOT EXISTS tracked_links_communication_id_idx
  ON public.tracked_links(communication_id);

CREATE INDEX IF NOT EXISTS tracking_events_communication_id_idx
  ON public.tracking_events(communication_id);
CREATE INDEX IF NOT EXISTS tracking_events_created_at_idx
  ON public.tracking_events(created_at DESC);
CREATE INDEX IF NOT EXISTS tracking_events_tracked_link_id_idx
  ON public.tracking_events(tracked_link_id);

-- ---------------------------------------------------------------------------
-- 4.4 RLS
-- ---------------------------------------------------------------------------
-- Leitura: somente papeis administrativos que consomem o dashboard de
-- comunicacoes. Escrita: exclusivamente via service role (edge functions),
-- que ignora RLS -- por isso nenhuma policy de INSERT/UPDATE/DELETE.

ALTER TABLE public.communications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracked_links   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "communications_admin_select" ON public.communications;
CREATE POLICY "communications_admin_select" ON public.communications
  FOR SELECT
  TO authenticated
  USING (
    public.has_role_in(
      auth.uid(),
      ARRAY['admin_super', 'admin', 'comercial', 'financeiro']::public.app_role[]
    )
  );

DROP POLICY IF EXISTS "tracked_links_admin_select" ON public.tracked_links;
CREATE POLICY "tracked_links_admin_select" ON public.tracked_links
  FOR SELECT
  TO authenticated
  USING (
    public.has_role_in(
      auth.uid(),
      ARRAY['admin_super', 'admin', 'comercial', 'financeiro']::public.app_role[]
    )
  );

DROP POLICY IF EXISTS "tracking_events_admin_select" ON public.tracking_events;
CREATE POLICY "tracking_events_admin_select" ON public.tracking_events
  FOR SELECT
  TO authenticated
  USING (
    public.has_role_in(
      auth.uid(),
      ARRAY['admin_super', 'admin', 'comercial', 'financeiro']::public.app_role[]
    )
  );
