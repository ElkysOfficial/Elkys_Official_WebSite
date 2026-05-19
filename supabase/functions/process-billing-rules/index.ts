import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  requireAdminAccess,
  createServiceRoleClient,
  isServiceRoleRequest,
} from "../_shared/auth.ts";
import { buildEmail, sendEmail, getTimeGreeting } from "../_shared/email-template.ts";
import { getWhatsAppGreeting } from "../_shared/greeting.ts";
import { escapeAndFormat } from "../_shared/validation.ts";
import { createCommunication } from "../_shared/comms-tracking.ts";
import { sendWhatsApp } from "../_shared/whatsapp.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function replaceVars(
  template: string,
  vars: { client_name: string; amount: string; due_date: string; description: string }
): string {
  return template
    .replace(/\{\{client_name\}\}/g, vars.client_name)
    .replace(/\{\{amount\}\}/g, vars.amount)
    .replace(/\{\{due_date\}\}/g, vars.due_date)
    .replace(/\{\{description\}\}/g, vars.description);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    // Authentication: allow cron (service role) or admin (bearer token)
    const isCron = isServiceRoleRequest(req);
    if (!isCron) {
      const auth = await requireAdminAccess(req, CORS);
      if (auth instanceof Response) return auth;
    }

    const portalUrl = Deno.env.get("PORTAL_URL") ?? "https://elkys.com.br/portal/cliente";
    const supabase = createServiceRoleClient();

    let triggeredBy = isCron ? "cron" : "manual";
    let singleChargeId: string | null = null;
    let forceTemplateType: string | null = null;

    try {
      const body = await req.json();
      if (body?.triggered_by) triggeredBy = body.triggered_by;
      if (body?.single_charge_id) singleChargeId = body.single_charge_id;
      if (body?.force_template_type) forceTemplateType = body.force_template_type;
    } catch {
      // No body or invalid JSON
    }

    // Special mode: send a specific template to a specific charge (e.g., payment confirmation)
    if (singleChargeId && forceTemplateType) {
      const { data: tpl } = await supabase
        .from("billing_templates")
        .select("*")
        .eq("type", forceTemplateType)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (!tpl) {
        return jsonResponse(
          { ok: false, error: `No active template of type '${forceTemplateType}'` },
          404
        );
      }

      const { data: charge } = await supabase
        .from("charges")
        .select("id, client_id, description, amount, due_date")
        .eq("id", singleChargeId)
        .single();

      if (!charge) {
        return jsonResponse({ ok: false, error: "Charge not found" }, 404);
      }

      const { data: client } = await supabase
        .from("clients")
        .select(
          "full_name, email, gender, nome_fantasia, client_type, phone, whatsapp, responsavel_financeiro_phone"
        )
        .eq("id", charge.client_id)
        .single();

      if (!client?.email) {
        return jsonResponse({ ok: false, error: "Client has no email" }, 400);
      }

      const clientName =
        client.client_type === "pj" && client.nome_fantasia
          ? client.nome_fantasia
          : client.full_name;

      const vars = {
        client_name: clientName,
        amount: formatBRL(Number(charge.amount)),
        due_date: formatDate(charge.due_date),
        description: charge.description,
      };

      // Check for existing send today (idempotency for single-charge mode)
      const { data: existingLog } = await supabase
        .from("billing_actions_log")
        .select("id")
        .eq("charge_id", charge.id)
        .eq("template_id", tpl.id)
        .eq("status", "enviado")
        .gte("sent_at", `${new Date().toISOString().slice(0, 10)}T00:00:00`)
        .limit(1)
        .maybeSingle();

      if (existingLog) {
        return jsonResponse({ ok: true, sent: 0, skipped: true, reason: "Already sent today" });
      }

      // Rastreio da comunicacao: registra a communication, encurta o link
      // do botao e injeta o pixel de abertura. Modo no-op se a gravacao
      // falhar -- nunca bloqueia o envio do e-mail.
      // Telefone para o WhatsApp: prefere o do responsavel financeiro.
      const recipientPhone =
        client.responsavel_financeiro_phone || client.whatsapp || client.phone || null;

      const tracking = await createCommunication({
        kind: forceTemplateType === "agradecimento" ? "installment_paid" : forceTemplateType,
        recipientEmail: client.email,
        recipientPhone,
        clientId: charge.client_id,
        entityType: "charge",
        entityId: charge.id,
      });
      const portalHref = await tracking.shorten(`${portalUrl}/financeiro`);

      const subject = replaceVars(tpl.subject, vars);
      const bodyText = replaceVars(tpl.body, vars);
      const html = buildEmail({
        preheader: subject,
        title: "Elkys - Aviso Financeiro",
        greeting: `${getTimeGreeting()}, ${clientName}`,
        body: `<p style="margin:0 0 18px 0;font-size:14px;line-height:22px;color:#333333;">${escapeAndFormat(bodyText)}</p>`,
        button: { label: "Acessar portal", href: portalHref },
        pixelUrl: tracking.pixelUrl,
      });

      const result = await sendEmail({ to: client.email, subject, html });

      // Espelha o aviso financeiro no WhatsApp (curto + link). Falha nao
      // afeta o e-mail. Nao repete o corpo do template, apenas resume.
      let waStatus: "sent" | "failed" | "skipped" = "skipped";
      if (recipientPhone) {
        const waText = `${getWhatsAppGreeting(client)}\n\n${subject}\n\nReferente à cobrança "${vars.description}", no valor de ${vars.amount}, com vencimento em ${vars.due_date}.\n\nAcesse o financeiro por aqui:\n${portalHref}\n\nQualquer dúvida, estamos à disposição para ajudar.`;
        waStatus = (await sendWhatsApp(recipientPhone, waText)) ? "sent" : "failed";
      }
      await tracking.finalize(result.ok, waStatus);

      const { error: logError } = await supabase.from("billing_actions_log").insert({
        charge_id: charge.id,
        action_type: "email",
        template_id: tpl.id,
        status: result.ok ? "enviado" : "falha",
        error_message: result.error ?? null,
        triggered_by: triggeredBy,
      });

      if (logError?.code === "23505") {
        return jsonResponse({ ok: true, sent: 0, skipped: true, reason: "Already sent today" });
      }

      return jsonResponse({ ok: result.ok, sent: result.ok ? 1 : 0, errors: result.ok ? 0 : 1 });
    }

    // 1. Load active rules
    const { data: rules, error: rulesError } = await supabase
      .from("billing_rules")
      .select("*, billing_templates(*)")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (rulesError) {
      console.error("[billing] Error loading rules:", rulesError.message);
      return jsonResponse({ ok: false, error: rulesError.message }, 500);
    }

    if (!rules || rules.length === 0) {
      return jsonResponse({ ok: true, message: "No active rules", processed: 0 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);

    let totalSent = 0;
    let totalErrors = 0;

    for (const rule of rules) {
      // 2. Calculate target date based on trigger_days
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() - rule.trigger_days);
      const targetDateStr = targetDate.toISOString().slice(0, 10);

      // 3. Find matching charges
      let statusFilter: string[];
      if (rule.trigger_days < 0) {
        // Before due: look for pendente or agendada
        statusFilter = ["pendente", "agendada"];
      } else if (rule.trigger_days === 0) {
        // On due date: pendente
        statusFilter = ["pendente"];
      } else {
        // After due: atrasado
        statusFilter = ["atrasado"];
      }

      const { data: charges, error: chargesError } = await supabase
        .from("charges")
        .select("id, client_id, description, amount, due_date, status")
        .eq("due_date", targetDateStr)
        .in("status", statusFilter)
        .eq("is_historical", false);

      if (chargesError || !charges || charges.length === 0) continue;

      // 4. Check which charges already had this rule applied today
      const chargeIds = charges.map((c: { id: string }) => c.id);
      const { data: existingLogs } = await supabase
        .from("billing_actions_log")
        .select("charge_id")
        .eq("rule_id", rule.id)
        .in("charge_id", chargeIds)
        .gte("sent_at", `${todayStr}T00:00:00`);

      const alreadySent = new Set(
        (existingLogs ?? []).map((l: { charge_id: string }) => l.charge_id)
      );

      const pendingCharges = charges.filter((c: { id: string }) => !alreadySent.has(c.id));

      if (pendingCharges.length === 0) continue;

      // 5. Get template
      const template = rule.billing_templates as {
        subject: string;
        body: string;
      } | null;

      if (!template && rule.action_type === "email") continue;

      // 6. Process each charge
      for (const charge of pendingCharges) {
        // Get client info
        const { data: client } = await supabase
          .from("clients")
          .select(
            "full_name, email, gender, nome_fantasia, client_type, phone, whatsapp, responsavel_financeiro_phone"
          )
          .eq("id", charge.client_id)
          .single();

        if (!client || !client.email) continue;

        const clientName =
          client.client_type === "pj" && client.nome_fantasia
            ? client.nome_fantasia
            : client.full_name;

        const vars = {
          client_name: clientName,
          amount: formatBRL(Number(charge.amount)),
          due_date: formatDate(charge.due_date),
          description: charge.description,
        };

        let status = "enviado";
        let errorMessage: string | null = null;

        if (rule.action_type === "email" && template) {
          // Rastreio: lembrete (trigger negativo/zero) entra como invoice_due,
          // cobranca em atraso (trigger positivo) como charge_overdue -- assim
          // aparece no dashboard de Comunicacoes com pixel e link curto.
          // Telefone para o WhatsApp: prefere o do responsavel financeiro.
          const recipientPhone =
            client.responsavel_financeiro_phone || client.whatsapp || client.phone || null;

          const tracking = await createCommunication({
            kind: rule.trigger_days > 0 ? "charge_overdue" : "invoice_due",
            recipientEmail: client.email,
            recipientPhone,
            clientId: charge.client_id,
            entityType: "charge",
            entityId: charge.id,
          });
          const portalHref = await tracking.shorten(`${portalUrl}/financeiro`);

          const subject = replaceVars(template.subject, vars);
          const bodyText = replaceVars(template.body, vars);

          const html = buildEmail({
            preheader: subject,
            title: "Elkys - Aviso Financeiro",
            greeting: `${getTimeGreeting()}, ${clientName}`,
            body: `<p style="margin:0 0 18px 0;font-size:14px;line-height:22px;color:#333333;">${escapeAndFormat(bodyText)}</p>`,
            button: {
              label: "Acessar portal",
              href: portalHref,
            },
            pixelUrl: tracking.pixelUrl,
          });

          const result = await sendEmail({ to: client.email, subject, html });

          // Espelha o aviso financeiro no WhatsApp (curto + link). Falha nao
          // afeta o e-mail. Nao repete o corpo do template, apenas resume.
          let waStatus: "sent" | "failed" | "skipped" = "skipped";
          if (recipientPhone) {
            const waText =
              rule.trigger_days > 0
                ? `${getWhatsAppGreeting(client)}\n\n${subject}\n\nA cobrança "${vars.description}", no valor de ${vars.amount}, venceu em ${vars.due_date} e está em aberto. Pedimos a regularização assim que possível.\n\nAcesse o financeiro por aqui:\n${portalHref}\n\nSe o pagamento já foi feito, pode desconsiderar. Estamos à disposição.`
                : `${getWhatsAppGreeting(client)}\n\n${subject}\n\nA cobrança "${vars.description}", no valor de ${vars.amount}, tem vencimento em ${vars.due_date}.\n\nAcesse o financeiro por aqui:\n${portalHref}\n\nQualquer dúvida, estamos à disposição para ajudar.`;
            waStatus = (await sendWhatsApp(recipientPhone, waText)) ? "sent" : "failed";
          }
          await tracking.finalize(result.ok, waStatus);
          if (!result.ok) {
            status = "falha";
            errorMessage = result.error ?? "Unknown error";
            totalErrors++;
          } else {
            totalSent++;
          }
        } else {
          // Notificacao type — just log for now
          totalSent++;
        }

        // 7. Log the action (unique index prevents duplicate sends on conflict)
        const { error: logError } = await supabase.from("billing_actions_log").insert({
          charge_id: charge.id,
          rule_id: rule.id,
          action_type: rule.action_type,
          template_id: rule.template_id,
          status,
          error_message: errorMessage,
          triggered_by: triggeredBy,
        });

        // If unique constraint violation (23505), another process already logged this — skip
        if (logError?.code === "23505") {
          console.warn(`[billing] Duplicate log skipped: charge=${charge.id} rule=${rule.id}`);
        } else if (logError) {
          console.error(`[billing] Log insert error: ${logError.message}`);
        }
      }
    }

    console.log(`[billing] Processed: ${totalSent} sent, ${totalErrors} errors`);

    return jsonResponse({
      ok: true,
      sent: totalSent,
      errors: totalErrors,
    });
  } catch (err) {
    console.error("[billing] Unexpected error:", err);
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      500
    );
  }
});
