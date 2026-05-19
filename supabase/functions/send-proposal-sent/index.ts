/**
 * Edge Function: send-proposal-sent
 * Notifica o cliente quando uma proposta comercial e enviada para avaliacao.
 *
 * Deploy:
 *   supabase functions deploy send-proposal-sent
 *
 * Secrets: RESEND_API_KEY, FROM_EMAIL, PORTAL_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildEmail, sendEmail, CORS } from "../_shared/email-template.ts";
import { requireAdminAccess } from "../_shared/auth.ts";
import { getFormalGreeting, truncateAtWord } from "../_shared/greeting.ts";
import { createCommunication } from "../_shared/comms-tracking.ts";

interface Payload {
  proposal_id: string;
  client_id: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const auth = await requireAdminAccess(req, CORS);
    if (auth instanceof Response) return auth;

    const { proposal_id, client_id } = (await req.json()) as Payload;

    if (!proposal_id || !client_id) {
      return new Response(JSON.stringify({ error: "Missing proposal_id or client_id" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const PORTAL_URL = Deno.env.get("PORTAL_URL") ?? "https://elkys.com.br/portal/cliente";

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const [clientRes, proposalRes] = await Promise.all([
      admin
        .from("clients")
        .select("full_name, email, nome_fantasia, client_type, gender")
        .eq("id", client_id)
        .maybeSingle(),
      admin
        .from("proposals")
        .select("title, total_amount, valid_until, scope_summary")
        .eq("id", proposal_id)
        .maybeSingle(),
    ]);

    const client = clientRes.data;
    const proposal = proposalRes.data;

    if (!client?.email) {
      return new Response(JSON.stringify({ error: "Client not found or no email" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (!proposal) {
      return new Response(JSON.stringify({ error: "Proposal not found" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const formattedAmount = Number(proposal.total_amount).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

    const validUntilText = proposal.valid_until
      ? new Date(`${proposal.valid_until}T00:00:00`).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : null;

    const tracking = await createCommunication({
      kind: "proposal_sent",
      recipientEmail: client.email,
      clientId: client_id,
      entityType: "proposal",
      entityId: proposal_id,
    });
    const proposalHref = await tracking.shorten(`${PORTAL_URL}/propostas`);

    const html = buildEmail({
      preheader: "Proposta comercial disponível para análise no portal.",
      title: "Nova proposta comercial",
      greeting: getFormalGreeting(client),
      body: `
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">Uma nova <strong>proposta comercial</strong> foi preparada e encontra-se disponível no portal para sua análise.</p>
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">A proposta contempla escopo detalhado, condições de pagamento e investimento. A aprovação ou solicitação de ajustes pode ser realizada diretamente pelo portal.</p>
        <p style="margin:0;font-size:14px;line-height:22px;color:#333333;">Permanecemos à disposição para esclarecimentos.</p>
      `,
      highlight: {
        title: "Resumo da proposta",
        rows: [
          { label: "Proposta", value: proposal.title },
          { label: "Valor", value: formattedAmount },
          ...(validUntilText ? [{ label: "Válida até", value: validUntilText }] : []),
          ...(proposal.scope_summary
            ? [{ label: "Escopo", value: truncateAtWord(proposal.scope_summary, 200) }]
            : []),
        ],
      },
      button: {
        label: "Analisar proposta",
        href: proposalHref,
      },
      pixelUrl: tracking.pixelUrl,
      note: "A aprovação ou solicitação de ajustes pode ser realizada pelo portal a qualquer momento.",
    });

    const result = await sendEmail({
      to: client.email,
      subject: `Nova proposta comercial — ${proposal.title}`,
      html,
    });

    await tracking.finalize(result.ok);

    return new Response(JSON.stringify({ ok: result.ok, error: result.error ?? null }), {
      status: result.ok ? 200 : 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[send-proposal-sent] error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
