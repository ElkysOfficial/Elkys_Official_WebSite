/**
 * Edge Function: track
 * Rota PUBLICA (sem JWT) para rastreio de comunicacoes.
 *
 * Dois caminhos, identificados pelos dois ultimos segmentos da URL
 * (funciona tanto via dominio curto `lnk.elkys.com.br/c/<slug>` quanto
 * via URL crua do Supabase `/functions/v1/track/c/<slug>`):
 *
 *   GET .../c/<slug>        -> loga tracking_events(click), responde 302
 *                              para o target_url do tracked_link.
 *   GET .../o/<commId>.gif  -> loga tracking_events(open), responde um
 *                              GIF 1x1 transparente com headers anti-cache.
 *
 * Principios:
 *   - O log e best-effort: uma falha ao gravar o evento NUNCA pode quebrar
 *     o redirect nem deixar de devolver o pixel.
 *   - Dedup leve de aberturas: ignora opens repetidos da mesma communication
 *     dentro de uma janela curta (reduz ruido de prefetch de imagem).
 *
 * Deploy:
 *   supabase functions deploy track
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *          FALLBACK_URL (opcional, default https://elkys.com.br)
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// GIF 1x1 transparente (43 bytes).
const PIXEL_GIF = Uint8Array.from(
  atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
  (c) => c.charCodeAt(0)
);

// Janela de dedup de aberturas (ms). Aberturas repetidas da mesma
// communication dentro desse intervalo nao geram novo evento.
const OPEN_DEDUP_WINDOW_MS = 60_000;

function pixelResponse(): Response {
  return new Response(PIXEL_GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL_GIF.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim() || null;
  return req.headers.get("x-real-ip");
}

serve(async (req) => {
  const FALLBACK_URL = Deno.env.get("FALLBACK_URL") ?? "https://elkys.com.br";

  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Dois ultimos segmentos da URL: [tipo, valor].
  const segments = new URL(req.url).pathname.split("/").filter(Boolean);
  const kind = segments[segments.length - 2];
  const rawValue = segments[segments.length - 1] ?? "";

  let admin: ReturnType<typeof createClient> | null = null;
  try {
    admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  } catch (err) {
    console.error("[track] failed to init supabase client:", err);
  }

  const ip = clientIp(req);
  const userAgent = req.headers.get("user-agent");

  // -------------------------------------------------------------------------
  // CLIQUE: /c/<slug>
  // -------------------------------------------------------------------------
  if (kind === "c") {
    const slug = rawValue;
    if (!slug || !admin) {
      return Response.redirect(FALLBACK_URL, 302);
    }

    try {
      const { data: link } = await admin
        .from("tracked_links")
        .select("id, communication_id, target_url, channel")
        .eq("slug", slug)
        .maybeSingle();

      if (!link) {
        return Response.redirect(FALLBACK_URL, 302);
      }

      // Log best-effort: nunca bloqueia o redirect.
      try {
        await admin.from("tracking_events").insert({
          communication_id: link.communication_id,
          tracked_link_id: link.id,
          event_type: "click",
          channel: link.channel ?? "email",
          ip,
          user_agent: userAgent,
        });
      } catch (logErr) {
        console.error("[track] click log failed:", logErr);
      }

      return Response.redirect(String(link.target_url), 302);
    } catch (err) {
      console.error("[track] click handler error:", err);
      return Response.redirect(FALLBACK_URL, 302);
    }
  }

  // -------------------------------------------------------------------------
  // ABERTURA: /o/<commId>.gif
  // -------------------------------------------------------------------------
  if (kind === "o") {
    const commId = rawValue.replace(/\.gif$/i, "");
    // UUID basico; se nao bater, ainda devolve o pixel (nunca quebra o e-mail).
    const isUuid = /^[0-9a-f-]{36}$/i.test(commId);

    if (admin && isUuid) {
      try {
        const since = new Date(Date.now() - OPEN_DEDUP_WINDOW_MS).toISOString();
        const { data: recent } = await admin
          .from("tracking_events")
          .select("id")
          .eq("communication_id", commId)
          .eq("event_type", "open")
          .gte("created_at", since)
          .limit(1);

        if (!recent || recent.length === 0) {
          await admin.from("tracking_events").insert({
            communication_id: commId,
            event_type: "open",
            channel: "email",
            ip,
            user_agent: userAgent,
          });
        }
      } catch (logErr) {
        console.error("[track] open log failed:", logErr);
      }
    }

    return pixelResponse();
  }

  // Caminho desconhecido.
  return Response.redirect(FALLBACK_URL, 302);
});
