/**
 * Edge Function: send-inadimplencia-warning
 *
 * Envia email cordial a clientes que acabaram de entrar em inadimplencia.
 * Le client_inadimplencia_warnings com warning_sent_at IS NULL
 * AND exited_at IS NULL AND warning_error IS NULL, envia email, e marca
 * warning_sent_at (ou warning_error em caso de falha).
 *
 * Idempotencia:
 *  - Unique index em (client_id) WHERE exited_at IS NULL garante 1 evento aberto.
 *  - warning_sent_at preenchido => nao reenviado.
 *  - warning_error preenchido => nao retentado automaticamente (decisao: sem
 *    reenvio ruidoso; admin pode limpar warning_error manualmente para reenviar).
 *  - Se cliente sair e reentrar, o trigger abre novo evento => novo envio.
 *
 * Deploy:
 *   supabase functions deploy send-inadimplencia-warning --no-verify-jwt
 *
 * Secrets: RESEND_API_KEY, FROM_EMAIL, PORTAL_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { buildEmail, sendEmail, CORS, getTimeGreeting } from "../_shared/email-template.ts";
import { getWhatsAppGreeting } from "../_shared/greeting.ts";
import {
  isServiceRoleRequest,
  requireOperationalAccess,
  createServiceRoleClient,
} from "../_shared/auth.ts";
import { createCommunication } from "../_shared/comms-tracking.ts";
import { sendWhatsApp } from "../_shared/whatsapp.ts";

const MAX_PER_RUN = 200;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    if (!isServiceRoleRequest(req)) {
      const auth = await requireOperationalAccess(req, CORS);
      if (auth instanceof Response) return auth;
    }

    const PORTAL_URL = Deno.env.get("PORTAL_URL") ?? "https://elkys.com.br/portal/cliente";
    const admin = createServiceRoleClient();

    // Filtro opcional client_ids: util para disparos manuais direcionados
    // (ex: admin invocando pra um cliente especifico via Dashboard).
    // Quando omitido, processa toda a fila (comportamento do cron).
    let clientIdFilter: string[] | null = null;
    try {
      const body = await req.json();
      if (Array.isArray(body?.client_ids) && body.client_ids.length > 0) {
        clientIdFilter = body.client_ids.filter(
          (id: unknown): id is string => typeof id === "string"
        );
      }
    } catch {
      // sem body ou JSON invalido — ignora, processa tudo
    }

    let pendingQuery = admin
      .from("client_inadimplencia_warnings")
      .select("id, client_id, entered_at")
      .is("warning_sent_at", null)
      .is("exited_at", null)
      .is("warning_error", null)
      .order("entered_at", { ascending: true })
      .limit(MAX_PER_RUN);

    if (clientIdFilter) {
      pendingQuery = pendingQuery.in("client_id", clientIdFilter);
    }

    const { data: pending, error: pendingError } = await pendingQuery;

    if (pendingError) {
      console.error("[inadimplencia-warning] query error:", pendingError.message);
      return new Response(JSON.stringify({ error: pendingError.message }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (!pending || pending.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, failed: 0, skipped: 0 }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const event of pending) {
      const { data: client } = await admin
        .from("clients")
        .select(
          "full_name, email, gender, nome_fantasia, client_type, phone, whatsapp, responsavel_financeiro_phone"
        )
        .eq("id", event.client_id)
        .maybeSingle();

      if (!client) {
        skipped++;
        await admin
          .from("client_inadimplencia_warnings")
          .update({ warning_error: "Client not found" })
          .eq("id", event.id);
        continue;
      }

      if (!client.email) {
        skipped++;
        await admin
          .from("client_inadimplencia_warnings")
          .update({ warning_error: "Client without email" })
          .eq("id", event.id);
        continue;
      }

      // Guarda extra: re-checa via view client_financial_summary
      // (fonte de verdade computada). clients.contract_status eh snapshot
      // legado congelado pelo guard fn_guard_clients_legacy_snapshots,
      // entao nao serve mais como check em tempo real. Se na janela entre
      // reconcile (07h) e send (07h30) o cliente pagou as charges e deixou
      // de ser inadimplente, essa checagem evita o email desatualizado.
      const { data: summary } = await admin
        .from("client_financial_summary")
        .select("contract_status_calculated")
        .eq("client_id", event.client_id)
        .maybeSingle();

      if (summary?.contract_status_calculated !== "inadimplente") {
        skipped++;
        await admin
          .from("client_inadimplencia_warnings")
          .update({ exited_at: new Date().toISOString() })
          .eq("id", event.id);
        continue;
      }

      // Saudacao usa o nome completo: nome_fantasia pra PJ, full_name pra PF.
      // Nao abreviar pro primeiro nome — "Olá, AK" perde identidade institucional
      // pra clientes PJ e fica inapropriado em aviso financeiro.
      const clientName =
        client.client_type === "pj" && client.nome_fantasia
          ? client.nome_fantasia
          : client.full_name;

      // Telefone para o WhatsApp: prefere o do responsavel financeiro.
      const recipientPhone =
        client.responsavel_financeiro_phone || client.whatsapp || client.phone || null;

      const tracking = await createCommunication({
        kind: "inadimplencia_warning",
        recipientEmail: client.email,
        recipientPhone,
        clientId: event.client_id,
        entityType: "charge",
        entityId: null,
      });
      const financeiroHref = await tracking.shorten(`${PORTAL_URL}/financeiro`);

      const html = buildEmail({
        preheader: "Aviso sobre o status do seu contrato.",
        title: "Aviso importante sobre seu contrato",
        greeting: `${getTimeGreeting()}, ${clientName}.`,
        body: `
          <p style="margin:0 0 18px;font-size:14px;line-height:22px;color:#333333;">Identificamos a existência de pendências financeiras em sua conta, o que ocasionou a alteração do status do seu contrato.</p>
          <p style="margin:0 0 18px;font-size:14px;line-height:22px;color:#333333;">Para regularizar a situação, orientamos que acesse o portal e verifique os débitos em aberto. A regularização é importante para evitar a aplicação de medidas administrativas e eventuais restrições na continuidade dos serviços.</p>
          <p style="margin:0 0 18px;font-size:14px;line-height:22px;color:#333333;">Caso o pagamento já tenha sido realizado, pedimos a gentileza de desconsiderar esta mensagem. Se houver necessidade de negociação ou esclarecimentos, nosso time financeiro está disponível para atendimento diretamente pelo portal.</p>
          <p style="margin:0;font-size:14px;line-height:22px;color:#333333;">Permanecemos à disposição para qualquer suporte necessário.</p>
        `,
        button: {
          label: "Acessar financeiro →",
          href: financeiroHref,
        },
        pixelUrl: tracking.pixelUrl,
      });

      const result = await sendEmail({
        to: client.email,
        subject: "Aviso importante sobre seu contrato",
        html,
      });

      // Espelha o aviso no WhatsApp (curto + link). Falha nao afeta o e-mail.
      let waStatus: "sent" | "failed" | "skipped" = "skipped";
      if (recipientPhone) {
        const waText = `${getWhatsAppGreeting(client)}\n\nIdentificamos pendências financeiras que alteraram o status do seu contrato.\n\nPara regularizar e garantir a continuidade dos serviços, acesse o financeiro no portal.\n\nAcesse por aqui:\n${financeiroHref}\n\nSe o pagamento já foi efetuado, pode desconsiderar. Qualquer dúvida, estamos à disposição.`;
        waStatus = (await sendWhatsApp(recipientPhone, waText)) ? "sent" : "failed";
      }
      await tracking.finalize(result.ok, waStatus);

      if (result.ok) {
        const { error: updErr } = await admin
          .from("client_inadimplencia_warnings")
          .update({ warning_sent_at: new Date().toISOString() })
          .eq("id", event.id);
        if (updErr) {
          console.error("[inadimplencia-warning] update success row failed:", updErr.message);
        }
        sent++;
      } else {
        await admin
          .from("client_inadimplencia_warnings")
          .update({ warning_error: result.error ?? "Unknown error" })
          .eq("id", event.id);
        failed++;
      }
    }

    console.log(`[inadimplencia-warning] sent=${sent} failed=${failed} skipped=${skipped}`);

    return new Response(JSON.stringify({ ok: true, sent, failed, skipped }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[inadimplencia-warning] fatal:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
