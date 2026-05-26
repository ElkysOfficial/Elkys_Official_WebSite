/**
 * Shared logic for processing a single notification:
 * resolves recipients, sends emails, updates statuses.
 *
 * Used by both `send-notification` (immediate, admin-triggered)
 * and `process-scheduled-notifications` (cron-triggered).
 */

import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildEmail, sendEmail } from "./email-template.ts";
import { formatNotificationBody } from "./validation.ts";
import { getFormalGreeting, getWhatsAppGreetingFullName } from "./greeting.ts";
import { buildWhatsAppMessage, ctaLink, docHighlight } from "./whatsapp-template.ts";
import { createCommunication } from "./comms-tracking.ts";
import { sendWhatsApp } from "./whatsapp.ts";

const TYPE_LABELS: Record<string, string> = {
  manutencao: "Manutenção programada",
  atualizacao: "Atualização",
  otimizacao: "Otimização",
  alerta: "Alerta importante",
  personalizado: "Comunicado",
};

const TYPE_SUBJECTS: Record<string, string> = {
  manutencao: "Manutenção programada — Elkys",
  atualizacao: "Novidades — Elkys",
  otimizacao: "Otimização em andamento — Elkys",
  alerta: "Alerta importante — Elkys",
  personalizado: "Comunicado — Elkys",
};

interface ProcessResult {
  ok: boolean;
  sent_count: number;
  error_count: number;
  error?: string;
}

export async function processNotification(
  adminClient: SupabaseClient,
  notificationId: string
): Promise<ProcessResult> {
  // 1. Fetch notification
  const { data: notification, error: fetchError } = await adminClient
    .from("notifications")
    .select("*")
    .eq("id", notificationId)
    .single();

  if (fetchError || !notification) {
    return { ok: false, sent_count: 0, error_count: 0, error: fetchError?.message ?? "Not found" };
  }

  if (!["enviando", "agendada"].includes(notification.status)) {
    return {
      ok: false,
      sent_count: 0,
      error_count: 0,
      error: `Invalid status: ${notification.status}`,
    };
  }

  // 2. Mark as sending
  await adminClient
    .from("notifications")
    .update({ status: "enviando", updated_at: new Date().toISOString() })
    .eq("id", notificationId);

  // 3. Resolve recipients based on filter_mode
  let clientQuery = adminClient
    .from("clients")
    .select(
      "id, user_id, full_name, email, nome_fantasia, client_type, gender, phone, whatsapp, responsavel_financeiro_phone"
    )
    .eq("is_active", true);

  switch (notification.filter_mode) {
    case "tags":
      if (notification.filter_tags?.length) {
        clientQuery = clientQuery.overlaps("tags", notification.filter_tags);
      }
      break;
    case "contract_status":
      if (notification.filter_contract_status) {
        // contract_status foi removido de clients na auditoria 2026-05-25; lemos da view calculada
        const { data: matching } = await adminClient
          .from("client_financial_summary")
          .select("client_id")
          .eq("contract_status_calculated", notification.filter_contract_status);
        const ids = (matching ?? []).map((row) => row.client_id).filter(Boolean) as string[];
        // Sentinel UUID quando ids esta vazio garante 0 resultados (em vez de filtrar nada)
        clientQuery = clientQuery.in(
          "id",
          ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]
        );
      }
      break;
    case "individual":
      if (notification.filter_client_ids?.length) {
        clientQuery = clientQuery.in("id", notification.filter_client_ids);
      } else {
        await adminClient
          .from("notifications")
          .update({
            status: "falha",
            error_count: 0,
            recipient_count: 0,
            updated_at: new Date().toISOString(),
          })
          .eq("id", notificationId);
        return { ok: false, sent_count: 0, error_count: 0, error: "No client IDs specified" };
      }
      break;
    // "all" -no extra filter
  }

  const { data: clients, error: clientsError } = await clientQuery;

  if (clientsError || !clients?.length) {
    await adminClient
      .from("notifications")
      .update({ status: "falha", recipient_count: 0, updated_at: new Date().toISOString() })
      .eq("id", notificationId);
    return {
      ok: false,
      sent_count: 0,
      error_count: 0,
      error: clientsError?.message ?? "No recipients found",
    };
  }

  // 4. Batch insert recipients (skip duplicates)
  const recipientRows = clients.map((c) => ({
    notification_id: notificationId,
    client_id: c.id,
    user_id: c.user_id ?? null,
  }));

  await adminClient
    .from("notification_recipients")
    .upsert(recipientRows, { onConflict: "notification_id,client_id", ignoreDuplicates: true });

  // 5. Send emails
  const PORTAL_URL = Deno.env.get("PORTAL_URL") ?? "https://elkys.com.br/portal/cliente";
  const typeLabel = TYPE_LABELS[notification.type] ?? "Comunicado";
  const subject = notification.title || TYPE_SUBJECTS[notification.type] || "Comunicado -Elkys";

  let sentCount = 0;
  let errorCount = 0;

  for (const client of clients) {
    // Telefone para o WhatsApp.
    const recipientPhone = client.whatsapp || client.phone || null;

    const tracking = await createCommunication({
      kind: "notification",
      recipientEmail: client.email,
      recipientPhone,
      clientId: client.id,
      entityType: "notification",
      entityId: notificationId,
    });
    const portalHref = await tracking.shorten(PORTAL_URL);
    const portalHrefWa = await tracking.shorten(PORTAL_URL, "whatsapp");

    const html = buildEmail({
      preheader: `${typeLabel}: ${notification.title}`,
      title: typeLabel,
      greeting: getFormalGreeting(client),
      body: `
        <p style="margin:0 0 18px 0;font-size:14px;line-height:22px;color:#333333;">
          ${formatNotificationBody(notification.body, PORTAL_URL)}
        </p>
      `,
      button: {
        label: "Acessar o portal",
        href: portalHref,
      },
      pixelUrl: tracking.pixelUrl,
    });

    const result = await sendEmail({ to: client.email, subject, html });

    // Espelha o comunicado no WhatsApp (curto + link). Falha nao afeta o e-mail.
    let waStatus: "sent" | "failed" | "skipped" = "skipped";
    if (recipientPhone) {
      const waText = buildWhatsAppMessage({
        greeting: getWhatsAppGreetingFullName(client),
        paragraphs: [
          "Temos um comunicado importante para você relacionado à sua conta no Portal Elkys.",
          docHighlight(typeLabel, notification.title),
          "O conteúdo completo, com todos os detalhes, está disponível no portal.",
        ],
        cta: ctaLink("Abrir comunicado no portal", portalHrefWa),
        closing: "Para qualquer dúvida sobre esta notificação, nossa equipe está à disposição.",
      });
      waStatus = (await sendWhatsApp(recipientPhone, waText)) ? "sent" : "failed";
    }
    await tracking.finalize(result.ok, waStatus);

    // Update recipient record
    const updatePayload = result.ok
      ? { email_sent: true }
      : { email_sent: false, email_error: result.error ?? "Unknown error" };

    await adminClient
      .from("notification_recipients")
      .update(updatePayload)
      .eq("notification_id", notificationId)
      .eq("client_id", client.id);

    if (result.ok) sentCount++;
    else errorCount++;
  }

  // 6. Finalize notification status
  await adminClient
    .from("notifications")
    .update({
      status: errorCount === clients.length ? "falha" : "enviada",
      sent_at: new Date().toISOString(),
      recipient_count: sentCount,
      error_count: errorCount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", notificationId);

  return { ok: true, sent_count: sentCount, error_count: errorCount };
}
