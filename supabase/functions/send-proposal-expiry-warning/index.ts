/**
 * Edge Function: send-proposal-expiry-warning
 * Cron diario que avisa clientes cujas propostas expiram em N dias
 * (default 2), pra evitar proposta morrer por esquecimento.
 *
 * Deploy:
 *   supabase functions deploy send-proposal-expiry-warning --no-verify-jwt
 *
 * Secrets: RESEND_API_KEY, FROM_EMAIL, PORTAL_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Opcional: PROPOSAL_EXPIRY_WARNING_DAYS (default 2)
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildEmail, sendEmail, CORS } from "../_shared/email-template.ts";
import { getFormalGreeting, plural, type Gender } from "../_shared/greeting.ts";
import { createCommunication } from "../_shared/comms-tracking.ts";

interface ProposalRow {
  id: string;
  title: string;
  total_amount: number;
  valid_until: string;
  client_id: string;
}

interface ClientRow {
  id: string;
  full_name: string;
  email: string;
  nome_fantasia: string | null;
  client_type: string | null;
  gender: Gender;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const PORTAL_URL = Deno.env.get("PORTAL_URL") ?? "https://elkys.com.br/portal/cliente";
    const WARNING_DAYS = Number(Deno.env.get("PROPOSAL_EXPIRY_WARNING_DAYS") ?? "2");

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const target = new Date();
    target.setUTCDate(target.getUTCDate() + WARNING_DAYS);
    const targetDate = target.toISOString().slice(0, 10);

    const { data: proposals, error: queryError } = await admin
      .from("proposals")
      .select("id, title, total_amount, valid_until, client_id")
      .eq("status", "enviada")
      .eq("valid_until", targetDate)
      .not("client_id", "is", null);

    if (queryError) {
      return new Response(JSON.stringify({ ok: false, error: queryError.message }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const rows = (proposals ?? []) as ProposalRow[];
    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, reason: "No proposals expiring in N days" }),
        { headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const clientIds = [...new Set(rows.map((p) => p.client_id))];
    const { data: clientsData } = await admin
      .from("clients")
      .select("id, full_name, email, nome_fantasia, client_type, gender")
      .in("id", clientIds);

    const clientMap = new Map(((clientsData ?? []) as ClientRow[]).map((c) => [c.id, c]));

    let sent = 0;
    let failed = 0;

    for (const proposal of rows) {
      const client = clientMap.get(proposal.client_id);
      if (!client?.email) {
        failed++;
        continue;
      }

      const formattedAmount = Number(proposal.total_amount).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
      const validUntilText = new Date(`${proposal.valid_until}T00:00:00`).toLocaleDateString(
        "pt-BR",
        { day: "2-digit", month: "long", year: "numeric" }
      );
      const warningLabel = plural(WARNING_DAYS, "dia", "dias");

      const tracking = await createCommunication({
        kind: "proposal_expiry",
        recipientEmail: client.email,
        clientId: proposal.client_id,
        entityType: "proposal",
        entityId: proposal.id,
      });
      const proposalHref = await tracking.shorten(`${PORTAL_URL}/propostas/${proposal.id}`);

      const html = buildEmail({
        preheader: `A proposta "${proposal.title}" perde validade em ${warningLabel}.`,
        title: "Proposta prestes a expirar",
        greeting: getFormalGreeting(client),
        body: `
          <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">A proposta <strong>${proposal.title}</strong> permanece aguardando avaliação e sua validade expira em <strong>${warningLabel}</strong>.</p>
          <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">Após o vencimento, a proposta perde validade automaticamente e uma nova negociação se faz necessária. Caso o interesse permaneça, solicitamos sua resposta pelo portal.</p>
          <p style="margin:0;font-size:14px;line-height:22px;color:#333333;">Permanecemos à disposição para esclarecimentos.</p>
        `,
        highlight: {
          title: "Resumo da proposta",
          rows: [
            { label: "Proposta", value: proposal.title },
            { label: "Valor", value: formattedAmount },
            { label: "Válida até", value: validUntilText },
          ],
        },
        button: {
          label: "Analisar proposta",
          href: proposalHref,
        },
        pixelUrl: tracking.pixelUrl,
      });

      const result = await sendEmail({
        to: client.email,
        subject: `Proposta expira em ${warningLabel} — ${proposal.title}`,
        html,
      });

      await tracking.finalize(result.ok);

      if (result.ok) sent++;
      else failed++;
    }

    if (sent > 0) {
      void admin.from("admin_notifications").insert({
        type: "propostas_prestes_a_expirar",
        title: `${sent} lembrete(s) de proposta enviado(s)`,
        body: `Propostas expirando em ${WARNING_DAYS} dia(s): ${rows.length} candidata(s), ${sent} e-mail(s) enviado(s).`,
        severity: "info",
        target_roles: ["admin_super", "admin", "comercial"],
      });
    }

    return new Response(JSON.stringify({ ok: true, sent, failed, total: rows.length }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[send-proposal-expiry-warning] error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
