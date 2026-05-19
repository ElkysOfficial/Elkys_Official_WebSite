/**
 * Edge Function: send-project-stage-changed
 * Notifica o cliente quando a etapa ou status do projeto muda.
 *
 * Deploy:
 *   supabase functions deploy send-project-stage-changed --no-verify-jwt
 *
 * Secrets: RESEND_API_KEY, FROM_EMAIL, PORTAL_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildEmail, sendEmail, CORS } from "../_shared/email-template.ts";
import { requireAdminAccess } from "../_shared/auth.ts";
import { getFormalGreeting, getWhatsAppGreeting } from "../_shared/greeting.ts";
import { createCommunication } from "../_shared/comms-tracking.ts";
import { sendWhatsApp } from "../_shared/whatsapp.ts";

interface Payload {
  client_id: string;
  project_id: string;
  project_name: string;
  change_type: "stage" | "status";
  from_value: string;
  to_value: string;
  client_visible_summary?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const auth = await requireAdminAccess(req, CORS);
    if (auth instanceof Response) return auth;

    const {
      client_id,
      project_id,
      project_name,
      change_type,
      from_value,
      to_value,
      client_visible_summary,
    } = (await req.json()) as Payload;

    if (!client_id || !project_name || !change_type || !to_value) {
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
        "full_name, email, nome_fantasia, client_type, gender, phone, whatsapp, responsavel_financeiro_phone"
      )
      .eq("id", client_id)
      .maybeSingle();

    if (!client?.email) {
      return new Response(JSON.stringify({ error: "Client not found" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const isStageChange = change_type === "stage";
    const title = isStageChange ? "Atualização de etapa" : "Atualização de status";
    const subject = isStageChange
      ? `Atualização de etapa — ${project_name}`
      : `Atualização de status — ${project_name}`;

    const highlightRows = [
      { label: "Projeto", value: project_name },
      ...(from_value
        ? [{ label: isStageChange ? "Etapa anterior" : "Status anterior", value: from_value }]
        : []),
      { label: isStageChange ? "Nova etapa" : "Novo status", value: to_value },
    ];

    const bodyParagraphs = isStageChange
      ? `
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">Informamos que o projeto <strong>${project_name}</strong> avançou para uma nova etapa.</p>
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">O progresso completo, documentos e próximos passos estão disponíveis no portal para consulta.</p>
        ${client_visible_summary ? `<p style="margin:0;font-size:14px;line-height:22px;color:#333333;">Atualização da equipe: <em>${client_visible_summary}</em></p>` : ""}
      `
      : `
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">O status do projeto <strong>${project_name}</strong> foi atualizado.</p>
        <p style="margin:0;font-size:14px;line-height:22px;color:#333333;">Os detalhes completos encontram-se disponíveis no portal.</p>
      `;

    // Telefone para o WhatsApp.
    const recipientPhone = client.whatsapp || client.phone || null;

    const tracking = await createCommunication({
      kind: "project_stage",
      recipientEmail: client.email,
      recipientPhone,
      clientId: client_id,
      entityType: "project",
      entityId: project_id ?? null,
    });
    const projetoHref = await tracking.shorten(`${PORTAL_URL}/projetos/${project_id}`);

    const html = buildEmail({
      preheader: isStageChange
        ? `O projeto "${project_name}" avançou para a etapa "${to_value}".`
        : `O status do projeto "${project_name}" foi atualizado para "${to_value}".`,
      title,
      greeting: getFormalGreeting(client),
      body: bodyParagraphs,
      highlight: { title: "Detalhes da atualização", rows: highlightRows },
      button: {
        label: "Acompanhar o projeto",
        href: projetoHref,
      },
      pixelUrl: tracking.pixelUrl,
      note: "Para dúvidas, a equipe permanece à disposição pelo suporte do portal.",
    });

    const result = await sendEmail({
      to: client.email,
      subject,
      html,
    });

    // Espelha o aviso no WhatsApp (curto + link). Falha nao afeta o e-mail.
    let waStatus: "sent" | "failed" | "skipped" = "skipped";
    if (recipientPhone) {
      const waText = isStageChange
        ? `${getWhatsAppGreeting(client)}\n\nBoas notícias: o projeto "${project_name}" avançou para a etapa "${to_value}".\n\nAcompanhe o progresso por aqui:\n${projetoHref}\n\nQualquer dúvida, estamos à disposição para ajudar.`
        : `${getWhatsAppGreeting(client)}\n\nO status do projeto "${project_name}" foi atualizado para "${to_value}".\n\nVeja os detalhes por aqui:\n${projetoHref}\n\nQualquer dúvida, estamos à disposição para ajudar.`;
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
