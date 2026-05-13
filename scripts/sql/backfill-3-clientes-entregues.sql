-- ============================================================================
-- Backfill retroativo: marcar projetos dos 3 clientes legados
-- (Ramiro, Alexandre, José) como tendo passado por todas as etapas do fluxo
-- atual (onboarding, validação, aceite contrato, aceite entrega).
--
-- Contexto: esses clientes foram fechados ANTES das features de
-- onboarding/validação/aceite serem implementadas. Em produção eles estão
-- pagando há meses, mas o portal mostra "Aguardando aceite" em tudo.
--
-- Premissas:
--   - Cliente identificado pelo primeiro nome (case-insensitive).
--   - Cada cliente tem 1 projeto ativo. Se tiver mais de um, o script
--     atualiza TODOS e mostra warning no SELECT final — revise antes.
--   - Data retroativa do aceite: 60 dias atrás (ajustar se quiser).
--   - Usa o admin atual (auth.uid()) como accepted_by / validated_by_internal.
--
-- IMPORTANTE: Roda dentro de transação. Se algo parecer errado no SELECT
-- final, ROLLBACK e ajuste os WHEREs.
-- ============================================================================

BEGIN;

-- Passo 0: variáveis. Ajuste as datas e nomes se necessário.
DO $$
DECLARE
  v_onboarding_date  timestamptz := now() - interval '90 days';
  v_validation_date  timestamptz := now() - interval '75 days';
  v_contract_date    timestamptz := now() - interval '85 days';
  v_acceptance_date  timestamptz := now() - interval '60 days';
  v_admin_uid        uuid := auth.uid();  -- assume admin rodando o script
  v_client_names     text[] := ARRAY['ramiro', 'alexandre', 'jose', 'josé'];
  v_project          RECORD;
  v_contract         RECORD;
  v_onboarding_done  jsonb := jsonb_build_object(
    'scope_confirmed',    jsonb_build_object('done', true, 'owner', 'elkys',         'note', 'Backfill retroativo — projeto fechado antes do checklist existir'),
    'materials_received', jsonb_build_object('done', true, 'owner', 'cliente',       'note', 'Backfill retroativo'),
    'access_provided',    jsonb_build_object('done', true, 'owner', 'cliente',       'note', 'Backfill retroativo'),
    'schedule_aligned',   jsonb_build_object('done', true, 'owner', 'compartilhado', 'note', 'Backfill retroativo'),
    'team_assigned',      jsonb_build_object('done', true, 'owner', 'elkys',         'note', 'Backfill retroativo')
  );
BEGIN

  -- Loop por cada projeto dos 3 clientes
  FOR v_project IN
    SELECT p.id AS project_id, p.client_id, c.full_name AS client_name
      FROM public.projects p
      JOIN public.clients c ON c.id = p.client_id
     WHERE lower(c.full_name)                       ~ ANY(v_client_names)
        OR lower(coalesce(c.nome_fantasia, ''))     ~ ANY(v_client_names)
  LOOP
    RAISE NOTICE 'Processando projeto % do cliente %', v_project.project_id, v_project.client_name;

    -- 1. Onboarding concluído
    UPDATE public.projects
       SET onboarding_checklist    = v_onboarding_done,
           onboarding_completed_at = COALESCE(onboarding_completed_at, v_onboarding_date),
           updated_at              = now()
     WHERE id = v_project.project_id;

    -- 2. Validação aprovada (rodada única "aprovada")
    INSERT INTO public.project_validation_rounds (
      project_id, client_id, round_no, scope_summary, status, feedback,
      validated_by_internal, internal_validated_at,
      validated_by_client, client_validated_at,
      started_at, closed_at, created_by
    )
    SELECT
      v_project.project_id, v_project.client_id, 1,
      'Backfill retroativo: validação concluída antes do tracking existir',
      'aprovada',
      'Cliente aprovou entrega na época. Registro reconstruído para fins de histórico.',
      v_admin_uid, v_validation_date,
      v_project.client_name, v_validation_date,
      v_validation_date, v_validation_date, v_admin_uid
    WHERE NOT EXISTS (
      SELECT 1 FROM public.project_validation_rounds
        WHERE project_id = v_project.project_id AND round_no = 1
    );

    -- 3. Aceite formal do contrato (todos os contratos do projeto)
    UPDATE public.project_contracts
       SET accepted_at         = COALESCE(accepted_at, v_contract_date),
           accepted_by_user_id = COALESCE(accepted_by_user_id, v_admin_uid),
           acceptance_ip       = COALESCE(acceptance_ip, 'backfill'),
           status              = CASE WHEN status = 'rascunho' THEN 'ativo' ELSE status END,
           updated_at          = now()
     WHERE project_id = v_project.project_id;

    -- 4. Aceite formal de entrega do projeto
    UPDATE public.projects
       SET accepted_at        = COALESCE(accepted_at, v_acceptance_date),
           accepted_by        = COALESCE(accepted_by, v_admin_uid),
           acceptance_notes   = COALESCE(acceptance_notes, 'Aceite retroativo — entrega aprovada na época antes do registro formal existir'),
           delivered_at       = COALESCE(delivered_at, v_acceptance_date - interval '2 days'),
           updated_at         = now()
     WHERE id = v_project.project_id;

  END LOOP;
END $$;

-- ============================================================================
-- VERIFICAÇÃO — confira antes de commit
-- ============================================================================

SELECT
  c.full_name                                           AS cliente,
  c.nome_fantasia                                       AS nome_fantasia,
  p.id                                                  AS project_id,
  p.name                                                AS projeto,
  p.onboarding_completed_at IS NOT NULL                 AS onboarding_ok,
  (SELECT count(*) FROM project_validation_rounds vr
    WHERE vr.project_id = p.id AND vr.status = 'aprovada') AS rodadas_aprovadas,
  p.accepted_at IS NOT NULL                             AS entrega_aceita,
  (SELECT count(*) FROM project_contracts pc
    WHERE pc.project_id = p.id AND pc.accepted_at IS NOT NULL) AS contratos_aceitos,
  (SELECT count(*) FROM project_contracts pc
    WHERE pc.project_id = p.id) AS contratos_total
  FROM public.projects p
  JOIN public.clients c ON c.id = p.client_id
 WHERE lower(c.full_name)                       ~ ANY(ARRAY['ramiro','alexandre','jose','josé'])
    OR lower(coalesce(c.nome_fantasia, ''))     ~ ANY(ARRAY['ramiro','alexandre','jose','josé'])
 ORDER BY c.full_name;

-- Se o resultado bater com o esperado:
COMMIT;

-- Se algo estiver errado, rode em vez disso:
-- ROLLBACK;
