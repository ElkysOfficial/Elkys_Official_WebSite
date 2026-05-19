/**
 * Edge Function: send-client-action-required
 * Notifica o cliente quando o admin solicita uma acao/dados vinculada ao projeto.
 * O email é customizado de acordo com o action_type da pendência.
 *
 * Deploy:
 *   supabase functions deploy send-client-action-required --no-verify-jwt
 *
 * Secrets: RESEND_API_KEY, FROM_EMAIL, PORTAL_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildEmail, sendEmail, CORS } from "../_shared/email-template.ts";
import { requireAdminAccess } from "../_shared/auth.ts";
import { escapeHtml } from "../_shared/validation.ts";
import { getFormalGreeting, getWhatsAppGreeting } from "../_shared/greeting.ts";
import { createCommunication } from "../_shared/comms-tracking.ts";
import { sendWhatsApp } from "../_shared/whatsapp.ts";

type ActionType =
  | "geral"
  | "reuniao"
  | "documento"
  | "aprovacao"
  | "informacao"
  | "feedback"
  | "acesso"
  | "conteudo";

interface Payload {
  client_id: string;
  project_id: string;
  project_name: string;
  step_title: string;
  step_description?: string;
  due_date?: string;
  action_type?: ActionType;
  meeting_link?: string;
}

function formatDate(date?: string | null): string | null {
  if (!date) return null;
  return new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/* ── Email content per action_type ────────────────────────────────── */

interface ActionTemplate {
  title: string;
  subjectPrefix: string;
  intro: (projectName: string) => string;
  detail: string;
  buttonLabel: string;
  note: string;
}

const ACTION_TEMPLATES: Record<ActionType, ActionTemplate> = {
  geral: {
    title: "Ação necessária",
    subjectPrefix: "Ação necessária",
    intro: (p) =>
      `Solicitamos sua colaboração para darmos continuidade ao projeto <strong>${escapeHtml(p)}</strong>.`,
    detail: "Os detalhes da solicitação estão disponíveis no portal para análise e resposta.",
    buttonLabel: "Responder no portal",
    note: "Sua resposta é importante para o andamento do projeto. Em caso de dúvidas, um ticket pode ser aberto pelo suporte do portal.",
  },
  reuniao: {
    title: "Agendamento de reunião",
    subjectPrefix: "Agendamento de reunião",
    intro: (p) =>
      `Gostaríamos de agendar uma <strong>reunião</strong> para alinharmos os próximos passos do projeto <strong>${escapeHtml(p)}</strong>.`,
    detail:
      "Solicitamos a escolha do melhor horário por meio do botão abaixo. Caso nenhuma das opções funcione, a equipe permanece à disposição pelo portal.",
    buttonLabel: "Agendar reunião",
    note: "A reunião é importante para garantirmos o avanço do projeto conforme o planejado.",
  },
  documento: {
    title: "Envio de documento",
    subjectPrefix: "Envio de documento",
    intro: (p) =>
      `Necessitamos do envio de um <strong>documento</strong> para darmos continuidade ao projeto <strong>${escapeHtml(p)}</strong>.`,
    detail: "Solicitamos o envio do documento indicado diretamente pelo portal, de forma segura.",
    buttonLabel: "Enviar documento",
    note: "Em caso de dúvidas sobre o formato ou conteúdo, a equipe permanece à disposição pelo suporte do portal.",
  },
  aprovacao: {
    title: "Aprovação pendente",
    subjectPrefix: "Aprovação pendente",
    intro: (p) =>
      `Uma entrega do projeto <strong>${escapeHtml(p)}</strong> aguarda sua <strong>aprovação</strong> para seguir adiante.`,
    detail:
      "Solicitamos a revisão dos detalhes e a confirmação da aprovação pelo portal. Caso ajustes sejam necessários, a solicitação pode ser registrada pelo mesmo canal.",
    buttonLabel: "Revisar e aprovar",
    note: "A aprovação é necessária para avançarmos para a próxima etapa do projeto.",
  },
  informacao: {
    title: "Informações pendentes",
    subjectPrefix: "Informações pendentes",
    intro: (p) =>
      `Necessitamos de algumas <strong>informações</strong> para prosseguirmos no projeto <strong>${escapeHtml(p)}</strong>.`,
    detail: "Os detalhes da solicitação estão disponíveis no portal para sua resposta.",
    buttonLabel: "Responder no portal",
    note: "O retorno rápido nos permite avançar com o projeto dentro do planejamento.",
  },
  feedback: {
    title: "Feedback sobre entrega",
    subjectPrefix: "Feedback sobre entrega",
    intro: (p) =>
      `Uma entrega do projeto <strong>${escapeHtml(p)}</strong> está pronta para sua <strong>avaliação</strong>.`,
    detail:
      "Solicitamos o teste, a revisão e o envio do retorno pelo portal. O feedback é essencial para garantirmos a conformidade com o esperado.",
    buttonLabel: "Avaliar entrega",
    note: "Ajustes serão realizados com base no retorno enviado.",
  },
  acesso: {
    title: "Credenciais pendentes",
    subjectPrefix: "Credenciais pendentes",
    intro: (p) =>
      `Necessitamos de <strong>credenciais ou acessos</strong> para darmos continuidade ao projeto <strong>${escapeHtml(p)}</strong>.`,
    detail: "Solicitamos o envio das credenciais pelo portal, de forma segura.",
    buttonLabel: "Enviar credenciais",
    note: "Por segurança, solicitamos o envio de credenciais exclusivamente pelo portal. Senhas não devem ser compartilhadas por e-mail.",
  },
  conteudo: {
    title: "Materiais pendentes",
    subjectPrefix: "Materiais pendentes",
    intro: (p) =>
      `Necessitamos de <strong>materiais ou conteúdo</strong> para avançarmos no projeto <strong>${escapeHtml(p)}</strong>.`,
    detail:
      "Os detalhes sobre o material solicitado (textos, imagens, logotipos, vídeos, entre outros) estão disponíveis no portal.",
    buttonLabel: "Enviar conteúdo",
    note: "Para melhor qualidade final, solicitamos o envio de imagens em alta resolução e textos revisados.",
  },
};

/* ── Document-style visual block for 'documento' type ─────────────── */

function buildDocumentBlock(title: string, description?: string): string {
  return `
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0"
      style="margin:0 0 22px 0;border:1px solid #e5e7eb;border-left:3px solid #472680;">
      <tr>
        <td style="padding:14px 16px;">
          <p style="margin:0 0 4px 0;font-size:14px;font-weight:700;color:#111111;">${escapeHtml(title)}</p>
          ${description ? `<p style="margin:0;font-size:13px;color:#666666;line-height:20px;">${escapeHtml(description)}</p>` : `<p style="margin:0;font-size:12px;color:#999999;">Detalhes adicionais disponíveis no portal.</p>`}
        </td>
      </tr>
    </table>`;
}

/* ── Meeting block with calendar button ───────────────────────────── */

function sanitizeUrl(url: string): string {
  // Aceita apenas http(s). Previne javascript: e data: em href.
  return /^https?:\/\//i.test(url)
    ? url.replace(/"/g, "%22").replace(/</g, "%3C").replace(/>/g, "%3E")
    : "#";
}

function buildMeetingBlock(meetingLink: string): string {
  const safeHref = sanitizeUrl(meetingLink);
  return `
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0"
      style="margin:0 0 22px 0;border:1px solid #e5e7eb;border-left:3px solid #148f8f;">
      <tr>
        <td style="padding:14px 16px;">
          <table role="presentation" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td valign="top">
                <p style="margin:0 0 8px 0;font-size:14px;font-weight:700;color:#111111;">Agendamento</p>
                <p style="margin:0 0 10px 0;font-size:13px;color:#666666;line-height:20px;">Solicitamos a escolha do melhor horário pelo link abaixo.</p>
                <a href="${safeHref}" target="_blank" style="display:inline-block;background-color:#148f8f;color:#ffffff;font-size:13px;font-weight:700;padding:10px 20px;text-decoration:none;">
                  Escolher horário
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
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
      step_title,
      step_description,
      due_date,
      action_type = "geral",
      meeting_link,
    } = (await req.json()) as Payload;

    if (!client_id || !project_name || !step_title) {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const PORTAL_URL = Deno.env.get("PORTAL_URL") ?? "https://elkys.com.br/portal/cliente";
    const CALENDAR_LINK =
      Deno.env.get("CALENDAR_LINK") ?? "https://calendar.app.google/PBxfwurV31hdDfiK7";

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

    const formattedDueDate = formatDate(due_date);
    const tpl = ACTION_TEMPLATES[action_type] ?? ACTION_TEMPLATES.geral;

    // Build highlight rows
    const highlightRows = [
      { label: "Projeto", value: project_name },
      { label: "Solicitação", value: step_title },
      ...(step_description ? [{ label: "Detalhes", value: step_description }] : []),
      ...(formattedDueDate ? [{ label: "Prazo", value: formattedDueDate }] : []),
    ];

    // Build extra blocks based on action_type
    let extraBlock = "";
    if (action_type === "documento") {
      extraBlock = buildDocumentBlock(step_title, step_description);
    } else if (action_type === "reuniao") {
      const link = meeting_link || CALENDAR_LINK;
      extraBlock = buildMeetingBlock(link);
    }

    // Button destination: meeting link for reuniao, otherwise portal
    const buttonHref =
      action_type === "reuniao" && meeting_link
        ? meeting_link
        : `${PORTAL_URL}/projetos/${project_id}`;

    // Telefone para o WhatsApp.
    const recipientPhone = client.whatsapp || client.phone || null;

    const tracking = await createCommunication({
      kind: "client_action",
      recipientEmail: client.email,
      recipientPhone,
      clientId: client_id,
      entityType: "client",
      entityId: client_id,
    });
    const buttonTrackedHref = await tracking.shorten(buttonHref);

    const html = buildEmail({
      preheader: `${tpl.subjectPrefix} — ${step_title} (projeto ${project_name}).`,
      title: tpl.title,
      greeting: getFormalGreeting(client),
      body: `
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">${tpl.intro(project_name)}</p>
        <p style="margin:0 0 18px;font-size:14px;line-height:22px;color:#333333;">${tpl.detail}</p>
        ${extraBlock}
        ${formattedDueDate ? `<p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;"><strong>Prazo sugerido:</strong> ${formattedDueDate}</p>` : ""}
      `,
      highlight: { title: "Detalhes da solicitação", rows: highlightRows },
      button: { label: tpl.buttonLabel, href: buttonTrackedHref },
      pixelUrl: tracking.pixelUrl,
      note: tpl.note,
    });

    const result = await sendEmail({
      to: client.email,
      subject: `${tpl.subjectPrefix} — ${step_title} (${project_name})`,
      html,
    });

    // Espelha o aviso no WhatsApp (curto + link). O texto varia conforme o
    // action_type, espelhando o titulo/intro usados no e-mail. Falha nao
    // afeta o e-mail.
    let waStatus: "sent" | "failed" | "skipped" = "skipped";
    if (recipientPhone) {
      const dueLine = formattedDueDate ? `\nPrazo sugerido: ${formattedDueDate}` : "";
      const waText = `${getWhatsAppGreeting(client)}\n\n${tpl.subjectPrefix} no projeto "${project_name}": ${step_title}.${dueLine}\n\nSua ação é importante para mantermos tudo no ritmo.\n\nAcesse por aqui:\n${buttonTrackedHref}\n\nQualquer dúvida, estamos à disposição para ajudar.`;
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
