/**
 * Edge Function: send-invoice-due
 * Notifica clientes com fatura próxima do vencimento.
 * Deve ser chamada por um cron job ou manualmente.
 *
 * Lógica: busca cobranças com due_date == hoje + DAYS_BEFORE,
 * status em ('pendente', 'agendada'), is_historical = false,
 * e envia aviso por e-mail para o cliente vinculado.
 *
 * Deploy:
 *   supabase functions deploy send-invoice-due
 *
 * Cron sugerido (no Supabase Dashboard > Edge Functions > Cron):
 *   0 9 * * *   → todo dia às 9h (UTC)
 *
 * Secrets: RESEND_API_KEY, FROM_EMAIL, PORTAL_URL,
 *          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *          INVOICE_DAYS_BEFORE (padrão: 3)
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildEmail, sendEmail, CORS } from "../_shared/email-template.ts";
import { getFormalGreeting, getWhatsAppGreeting, plural } from "../_shared/greeting.ts";
import { createCommunication } from "../_shared/comms-tracking.ts";
import { sendWhatsApp } from "../_shared/whatsapp.ts";

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const PORTAL_URL = Deno.env.get("PORTAL_URL") ?? "https://elkys.com.br/portal/cliente";
    const DAYS_BEFORE = parseInt(Deno.env.get("INVOICE_DAYS_BEFORE") ?? "3", 10);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Target date: today + DAYS_BEFORE
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + DAYS_BEFORE);
    const targetDateIso = targetDate.toISOString().slice(0, 10);

    // Fetch charges due on the target date that are operational (non-historical, non-cancelled)
    const { data: charges, error: chargesError } = await admin
      .from("charges")
      .select("id, client_id, description, amount, due_date, status")
      .eq("due_date", targetDateIso)
      .in("status", ["pendente", "agendada"])
      .eq("is_historical", false);

    if (chargesError) {
      console.error("[send-invoice-due] charges query error:", chargesError.message);
      return new Response(JSON.stringify({ error: chargesError.message }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (!charges || charges.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, message: "No invoices due" }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Collect unique client IDs from the charges
    const clientIds = [...new Set(charges.map((c) => c.client_id))];

    const { data: clients, error: clientsError } = await admin
      .from("clients")
      .select(
        "id, full_name, email, email_financeiro, nome_fantasia, contract_status, client_type, gender, phone, whatsapp, responsavel_financeiro_phone"
      )
      .in("id", clientIds)
      .eq("is_active", true);

    if (clientsError) {
      console.error("[send-invoice-due] clients query error:", clientsError.message);
      return new Response(JSON.stringify({ error: clientsError.message }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const clientMap = Object.fromEntries((clients ?? []).map((c) => [c.id, c]));

    const dueDateFormatted = targetDate.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    // Group charges by client to send a single email per client
    const chargesByClient = charges.reduce<Record<string, typeof charges>>((acc, charge) => {
      if (!acc[charge.client_id]) acc[charge.client_id] = [];
      acc[charge.client_id].push(charge);
      return acc;
    }, {});

    let sent = 0;
    let failed = 0;

    for (const [clientId, clientCharges] of Object.entries(chargesByClient)) {
      const client = clientMap[clientId];
      if (!client?.email) {
        failed++;
        continue;
      }

      const totalAmount = clientCharges.reduce((sum, c) => sum + Number(c.amount), 0);
      const amountFormatted = formatBRL(totalAmount);
      const isInadimplente = client.contract_status === "inadimplente";
      const chargeCount = clientCharges.length;
      const faturaLabel = chargeCount === 1 ? "fatura" : "faturas";
      const verbo = chargeCount === 1 ? "vence" : "vencem";
      const daysLabel = plural(DAYS_BEFORE, "dia", "dias");

      const chargeRows = clientCharges.map((c) => ({
        label: c.description,
        value: formatBRL(Number(c.amount)),
      }));

      const recipientEmail = client.email_financeiro || client.email;
      // Telefone para o WhatsApp: prefere o do responsavel financeiro.
      const recipientPhone =
        client.responsavel_financeiro_phone || client.whatsapp || client.phone || null;

      // Rastreio: 1 communication por cliente, pixel de abertura + link curto.
      const tracking = await createCommunication({
        kind: "invoice_due",
        recipientEmail,
        recipientPhone,
        clientId,
        entityType: "charge",
        entityId: clientCharges[0].id,
      });
      const portalHref = await tracking.shorten(`${PORTAL_URL}/financeiro`);

      const html = buildEmail({
        preheader: isInadimplente
          ? `Identificamos pendência financeira em aberto em sua conta.`
          : `Sua ${faturaLabel} de ${amountFormatted} ${verbo} em ${daysLabel}.`,
        title: isInadimplente ? "Pendência financeira" : "Lembrete de vencimento",
        greeting: getFormalGreeting(client),
        body: isInadimplente
          ? `
            <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">Identificamos uma <strong>pendência financeira</strong> em aberto em sua conta. Solicitamos a regularização o quanto antes para que os serviços permaneçam ativos.</p>
          `
          : `
            <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">Enviamos este lembrete referente à sua ${faturaLabel} com vencimento em <strong>${dueDateFormatted}</strong> (${daysLabel}).</p>
            <p style="margin:0;font-size:14px;line-height:22px;color:#333333;">Manter o pagamento em dia garante a continuidade dos serviços sem interrupção.</p>
          `,
        highlight: {
          title: "Resumo da cobrança",
          rows: [
            ...chargeRows,
            { label: "Total", value: amountFormatted },
            { label: "Vencimento", value: dueDateFormatted },
            {
              label: "Status",
              value: isInadimplente ? "Inadimplente" : "Ativo",
            },
          ],
        },
        button: {
          label: "Acessar o portal",
          href: portalHref,
        },
        pixelUrl: tracking.pixelUrl,
        ...(isInadimplente && {
          warning:
            "A conta apresenta pendência financeira. Solicitamos contato com nossa equipe para evitar a suspensão dos serviços.",
        }),
        note: `Dúvidas sobre cobranças: atendimento pelo portal ou WhatsApp <a href="https://wa.me/553199738235" style="color:#472680;">wa.me/553199738235</a>.`,
      });

      const result = await sendEmail({
        to: recipientEmail,
        subject: isInadimplente
          ? `Pendência financeira em aberto`
          : `Lembrete: sua ${faturaLabel} ${verbo} em ${daysLabel}`,
        html,
      });

      // Espelha o aviso no WhatsApp (curto + link). Falha nao afeta o e-mail.
      let waStatus: "sent" | "failed" | "skipped" = "skipped";
      if (recipientPhone) {
        const waText = isInadimplente
          ? `${getWhatsAppGreeting(client)}\n\nIdentificamos uma pendência financeira em aberto na sua conta, no valor de ${amountFormatted}.\n\nPara manter tudo em dia, pedimos a regularização assim que possível.\n\nAcesse o financeiro por aqui:\n${portalHref}\n\nSe o pagamento já foi feito, pode desconsiderar. Estamos à disposição.`
          : `${getWhatsAppGreeting(client)}\n\nPassando para lembrar: sua ${faturaLabel} de ${amountFormatted} ${verbo} em ${dueDateFormatted} (${daysLabel}).\n\nAcesse o financeiro por aqui:\n${portalHref}\n\nQualquer dúvida, estamos à disposição para ajudar.`;
        waStatus = (await sendWhatsApp(recipientPhone, waText)) ? "sent" : "failed";
      }
      await tracking.finalize(result.ok, waStatus);

      if (result.ok) sent++;
      else failed++;
    }

    return new Response(
      JSON.stringify({ ok: true, sent, failed, total: Object.keys(chargesByClient).length }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
