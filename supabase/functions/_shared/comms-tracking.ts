/**
 * Helper compartilhado de rastreio de comunicacao.
 *
 * Usado pelas edge functions send-* para:
 *   1. registrar 1 linha em `communications` por mensagem enviada;
 *   2. obter a URL do pixel de abertura (embutir no HTML do e-mail);
 *   3. encurtar a URL do botao de acao (`shorten`) gerando um `tracked_link`;
 *   4. fechar o status de envio do e-mail (`finalize`).
 *
 * Principio de robustez: NADA aqui pode quebrar o envio do e-mail. Se a
 * gravacao no banco falhar, o helper entra em modo no-op -- `pixelUrl` vem
 * vazio e `shorten` devolve a URL original sem encurtar.
 *
 * Secret necessario: SHORT_LINK_BASE (default https://lnk.elkys.com.br).
 * Esse dominio deve estar apontado para a edge function `track`.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SHORT_LINK_BASE = (Deno.env.get("SHORT_LINK_BASE") ?? "https://lnk.elkys.com.br").replace(
  /\/+$/,
  ""
);

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Slug aleatorio base62 (~7 chars) para o link curto. */
function randomSlug(len = 7): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (const b of bytes) out += BASE62[b % 62];
  return out;
}

function adminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type TrackingChannel = "email" | "whatsapp";

export interface CreateCommunicationOpts {
  /** Nome logico do envio, igual ao da edge function (ex.: invoice_due). */
  kind: string;
  /** E-mail do destinatario. */
  recipientEmail: string;
  /** Cliente vinculado, se houver. */
  clientId?: string | null;
  /** Telefone (reservado para a fase futura de WhatsApp). */
  recipientPhone?: string | null;
  /** Tipo da entidade de origem (charge, proposal, document, ...). */
  entityType?: string | null;
  /** Id da entidade de origem. */
  entityId?: string | null;
}

export interface CommunicationTracking {
  /** Id da communication criada; null se a gravacao falhou (modo no-op). */
  commId: string | null;
  /**
   * URL do pixel 1x1 de abertura. Embutir no HTML do e-mail
   * (`buildEmail({ pixelUrl })`). Vazio em modo no-op.
   */
  pixelUrl: string;
  /**
   * Encurta uma URL criando um `tracked_link`. Em qualquer falha devolve a
   * URL original -- o e-mail sempre sai com um link funcional.
   */
  shorten(targetUrl: string, channel?: TrackingChannel): Promise<string>;
  /** Fecha o status de e-mail da communication (sent / failed). */
  finalize(emailOk: boolean): Promise<void>;
}

/**
 * Cria a communication e devolve o tracking. Sempre resolve -- nunca lanca.
 */
export async function createCommunication(
  opts: CreateCommunicationOpts
): Promise<CommunicationTracking> {
  let admin: ReturnType<typeof createClient> | null = null;
  try {
    admin = adminClient();
  } catch (err) {
    console.error("[comms-tracking] admin client init failed:", err);
  }

  let commId: string | null = null;
  if (admin) {
    try {
      const { data, error } = await admin
        .from("communications")
        .insert({
          kind: opts.kind,
          client_id: opts.clientId ?? null,
          recipient_email: opts.recipientEmail,
          recipient_phone: opts.recipientPhone ?? null,
          entity_type: opts.entityType ?? null,
          entity_id: opts.entityId ?? null,
          email_status: "pending",
        })
        .select("id")
        .single();
      if (error) {
        console.error("[comms-tracking] insert communication failed:", error.message);
      } else {
        commId = data.id as string;
      }
    } catch (err) {
      console.error("[comms-tracking] insert communication threw:", err);
    }
  }

  const pixelUrl = commId ? `${SHORT_LINK_BASE}/o/${commId}.gif` : "";

  return {
    commId,
    pixelUrl,

    async shorten(targetUrl: string, channel: TrackingChannel = "email") {
      if (!admin || !commId) return targetUrl;
      // Ate 5 tentativas para contornar colisao de slug (erro 23505).
      for (let attempt = 0; attempt < 5; attempt++) {
        const slug = randomSlug();
        const { error } = await admin.from("tracked_links").insert({
          slug,
          communication_id: commId,
          target_url: targetUrl,
          channel,
        });
        if (!error) return `${SHORT_LINK_BASE}/c/${slug}`;
        if (error.code !== "23505") {
          console.error("[comms-tracking] shorten failed:", error.message);
          return targetUrl;
        }
      }
      console.error("[comms-tracking] shorten: slug collisions exhausted");
      return targetUrl;
    },

    async finalize(emailOk: boolean) {
      if (!admin || !commId) return;
      try {
        await admin
          .from("communications")
          .update({ email_status: emailOk ? "sent" : "failed" })
          .eq("id", commId);
      } catch (err) {
        console.error("[comms-tracking] finalize failed:", err);
      }
    },
  };
}
