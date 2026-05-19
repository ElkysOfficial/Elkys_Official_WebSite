/**
 * Edge Function: send-charge-overdue
 * Notifica o cliente quando uma cobranca entra em atraso.
 *
 * Pode ser invocado manualmente pelo admin ou via cron (mark_overdue_charges).
 *
 * Deploy:
 *   supabase functions deploy send-charge-overdue --no-verify-jwt
 *
 * Secrets: RESEND_API_KEY, FROM_EMAIL, PORTAL_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildEmail, sendEmail, CORS } from "../_shared/email-template.ts";
import { isServiceRoleRequest, requireOperationalAccess } from "../_shared/auth.ts";
import { getFormalGreeting, getWhatsAppGreeting, plural } from "../_shared/greeting.ts";
import { createCommunication } from "../_shared/comms-tracking.ts";
import { sendWhatsApp } from "../_shared/whatsapp.ts";

interface Payload {
  client_id: string;
  charge_description: string;
  charge_amount: number;
  due_date: string;
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // Autenticacao: aceita cron (service-role) ou usuario operacional (admin/team).
    // Sem isso qualquer requisicao anonima conseguiria disparar email em nome da Elkys.
    if (!isServiceRoleRequest(req)) {
      const auth = await requireOperationalAccess(req, CORS);
      if (auth instanceof Response) return auth;
    }

    const { client_id, charge_description, charge_amount, due_date } =
      (await req.json()) as Payload;

    if (!client_id || !charge_description || !due_date) {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
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

    const { data: client } = await admin
      .from("clients")
      .select(
        "full_name, email, email_financeiro, nome_fantasia, client_type, gender, phone, whatsapp, responsavel_financeiro_phone"
      )
      .eq("id", client_id)
      .maybeSingle();

    if (!client?.email) {
      return new Response(JSON.stringify({ error: "Client not found" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Calcula dias de atraso para uso no texto.
    const dueDateObj = new Date(`${due_date}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysOverdue = Math.max(
      1,
      Math.floor((today.getTime() - dueDateObj.getTime()) / (1000 * 60 * 60 * 24))
    );
    const overdueLabel = plural(daysOverdue, "dia", "dias");

    // Prefere e-mail financeiro quando informado.
    const recipientEmail = client.email_financeiro || client.email;
    // Telefone para o WhatsApp: prefere o do responsavel financeiro.
    const recipientPhone =
      client.responsavel_financeiro_phone || client.whatsapp || client.phone || null;

    const tracking = await createCommunication({
      kind: "charge_overdue",
      recipientEmail,
      recipientPhone,
      clientId: client_id,
      entityType: "charge",
      entityId: null,
    });
    const financeiroHref = await tracking.shorten(`${PORTAL_URL}/financeiro`);

    const html = buildEmail({
      preheader: `Identificamos uma pendência financeira vencida há ${overdueLabel}.`,
      title: "Pendência financeira",
      greeting: getFormalGreeting(client),
      body: `
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">Identificamos que a cobrança abaixo encontra-se vencida há <strong>${overdueLabel}</strong>.</p>
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">Solicitamos a gentileza de regularizar a pendência o quanto antes para que os serviços em andamento não sofram interrupção.</p>
        <p style="margin:0;font-size:14px;line-height:22px;color:#333333;">Caso o pagamento já tenha sido realizado, favor desconsiderar este aviso. Para dúvidas ou negociação, a equipe financeira permanece à disposição.</p>
      `,
      highlight: {
        title: "Detalhes da cobrança",
        rows: [
          { label: "Descrição", value: charge_description },
          { label: "Valor", value: formatBRL(charge_amount) },
          { label: "Vencimento", value: formatDate(due_date) },
          { label: "Atraso", value: overdueLabel },
        ],
      },
      button: {
        label: "Acessar o financeiro",
        href: financeiroHref,
      },
      pixelUrl: tracking.pixelUrl,
      note: `Preferir tratar por WhatsApp? Fale diretamente com o financeiro: <a href="https://wa.me/553199738235" style="color:#472680;">wa.me/553199738235</a>`,
    });

    const result = await sendEmail({
      to: recipientEmail,
      subject: `Pendência financeira — ${charge_description}`,
      html,
    });

    // Espelha o aviso no WhatsApp (curto + link). Falha nao afeta o e-mail.
    let waStatus: "sent" | "failed" | "skipped" = "skipped";
    if (recipientPhone) {
      const waText = `${getWhatsAppGreeting(client)}\n\nIdentificamos que a cobrança "${charge_description}", no valor de ${formatBRL(charge_amount)}, está vencida há ${overdueLabel}.\n\nPara manter sua conta em dia e evitar qualquer interrupção, pedimos a regularização assim que possível.\n\nAcesse o financeiro por aqui:\n${financeiroHref}\n\nSe o pagamento já foi feito, pode desconsiderar este aviso. Qualquer dúvida, estamos à disposição.`;
      waStatus = (await sendWhatsApp(recipientPhone, waText)) ? "sent" : "failed";
    }
    await tracking.finalize(result.ok, waStatus);

    if (!result.ok) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
