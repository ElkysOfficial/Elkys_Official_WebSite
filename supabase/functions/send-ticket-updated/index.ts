/**
 * Edge Function: send-ticket-updated
 * Notifica o cliente por e-mail quando:
 *   - Status muda para em_andamento → "Seu ticket está sendo analisado"
 *   - Status muda para resolvido   → "Seu ticket foi resolvido"
 *   - Admin envia uma resposta       → "Você recebeu uma resposta"
 *
 * Secrets: RESEND_API_KEY, FROM_EMAIL, PORTAL_URL,
 *          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildEmail, sendEmail, CORS } from "../_shared/email-template.ts";
import { escapeHtml } from "../_shared/validation.ts";
import { requireOperationalAccess } from "../_shared/auth.ts";
import { getFormalGreeting, nl2br, truncateAtWord } from "../_shared/greeting.ts";
import { createCommunication } from "../_shared/comms-tracking.ts";

type EventType = "em_andamento" | "resolvido" | "reply";

interface Payload {
  ticket_id: string;
  event: EventType;
  reply_body?: string; // presente quando event = 'reply'
}

const EVENT_SUBJECT: Record<EventType, string> = {
  em_andamento: "Seu ticket está em análise",
  resolvido: "Seu ticket foi resolvido",
  reply: "Nova resposta no seu ticket",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // Acao operacional: apenas team (admin/support/etc) pode notificar cliente.
    const auth = await requireOperationalAccess(req, CORS);
    if (auth instanceof Response) return auth;

    const { ticket_id, event, reply_body } = (await req.json()) as Payload;

    const VALID_EVENTS: EventType[] = ["em_andamento", "resolvido", "reply"];

    if (!ticket_id || !event) {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (!VALID_EVENTS.includes(event)) {
      return new Response(JSON.stringify({ error: "Invalid event type" }), {
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

    // Busca ticket + cliente
    const { data: ticket, error: ticketError } = await admin
      .from("support_tickets")
      .select("subject, body, clients(id, full_name, email, nome_fantasia, client_type, gender)")
      .eq("id", ticket_id)
      .maybeSingle();

    if (ticketError || !ticket) {
      console.error("[send-ticket-updated] ticket not found", ticketError);
      return new Response(JSON.stringify({ error: "Ticket not found" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const client = ticket.clients as {
      id?: string;
      full_name?: string;
      email?: string;
      nome_fantasia?: string | null;
      client_type?: string | null;
      gender?: "masculino" | "feminino" | null;
    } | null;

    const clientEmail = client?.email ?? "";
    if (!clientEmail) {
      console.warn("[send-ticket-updated] client has no email — skipping");
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const subject = ticket.subject as string;
    const ticketUrl = `${PORTAL_URL}/suporte`;
    const greeting = getFormalGreeting(client ?? {});

    // Destinatário do feedback NPS (resolvido). Recai em SUPPORT_FEEDBACK_EMAIL,
    // depois REPLY_TO_EMAIL, e por último o fallback padrão.
    const FEEDBACK_EMAIL =
      Deno.env.get("SUPPORT_FEEDBACK_EMAIL") ??
      Deno.env.get("REPLY_TO_EMAIL") ??
      "contato@elkys.com.br";

    let bodyHtml = "";
    let noteHtml: string | undefined;

    if (event === "em_andamento") {
      bodyHtml = `<p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">Informamos que sua solicitação de suporte foi recebida e encontra-se em análise pela equipe Elkys. O retorno será enviado em breve.</p>`;
    } else if (event === "resolvido") {
      // Mailto pré-preenchido — o cliente responde com 1 clique e o feedback
      // cai na caixa de suporte identificado pelo ticket_id no subject.
      const feedbackSubjectYes = encodeURIComponent(
        `[Feedback] Ticket resolvido — ${subject} (${ticket_id})`
      );
      const feedbackSubjectNo = encodeURIComponent(
        `[Feedback] Ticket não resolveu — ${subject} (${ticket_id})`
      );
      const feedbackBodyYes = encodeURIComponent(
        "Confirmo que a solicitação foi resolvida. Comentário (opcional):\n\n"
      );
      const feedbackBodyNo = encodeURIComponent(
        "A solicitação ainda não foi resolvida. Detalhes do que permanece em aberto:\n\n"
      );
      const mailtoYes = `mailto:${FEEDBACK_EMAIL}?subject=${feedbackSubjectYes}&body=${feedbackBodyYes}`;
      const mailtoNo = `mailto:${FEEDBACK_EMAIL}?subject=${feedbackSubjectNo}&body=${feedbackBodyNo}`;

      bodyHtml = `
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">Sua solicitação de suporte foi concluída e marcada como <strong>resolvida</strong>.</p>
        <p style="margin:0 0 18px;font-size:14px;line-height:22px;color:#333333;">Caso o problema persista ou surja uma nova dúvida, um novo ticket pode ser aberto a qualquer momento pelo portal.</p>

        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0"
          style="margin:0 0 18px 0;border:1px solid #e5e7eb;border-left:3px solid #148f8f;">
          <tr>
            <td style="padding:14px 16px;">
              <p style="margin:0 0 10px 0;font-size:14px;font-weight:700;color:#111111;">Esta resposta resolveu sua solicitação?</p>
              <p style="margin:0 0 12px 0;font-size:13px;color:#555555;line-height:20px;">
                Seu retorno é importante para aprimorarmos continuamente o atendimento.
              </p>
              <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding-right:8px;">
                    <a href="${mailtoYes}" target="_blank"
                      style="display:inline-block;background-color:#148f8f;color:#ffffff;font-size:13px;font-weight:700;padding:10px 18px;text-decoration:none;">
                      Sim, resolveu
                    </a>
                  </td>
                  <td>
                    <a href="${mailtoNo}" target="_blank"
                      style="display:inline-block;background-color:#ffffff;color:#148f8f;border:1px solid #148f8f;font-size:13px;font-weight:700;padding:9px 18px;text-decoration:none;">
                      Ainda não
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      `;
    } else if (event === "reply") {
      bodyHtml = `<p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">A equipe Elkys registrou uma resposta ao seu ticket. A resposta completa está disponível no portal para continuidade do atendimento.</p>`;
      if (reply_body) {
        const preview = nl2br(escapeHtml(truncateAtWord(reply_body, 400)));
        noteHtml = `<strong>Resposta da equipe:</strong><br/><em style="color:#52525b;">"${preview}"</em>`;
      }
    }

    const tracking = await createCommunication({
      kind: "ticket_updated",
      recipientEmail: clientEmail,
      clientId: client?.id ?? null,
      entityType: "ticket",
      entityId: ticket_id,
    });
    const ticketHref = await tracking.shorten(ticketUrl);

    const html = buildEmail({
      preheader: `${EVENT_SUBJECT[event]} — "${subject}".`,
      title: EVENT_SUBJECT[event],
      greeting,
      body: bodyHtml,
      highlight: {
        title: "Sua solicitação",
        rows: [{ label: "Assunto", value: subject }],
      },
      button: {
        label: "Acessar o ticket",
        href: ticketHref,
      },
      pixelUrl: tracking.pixelUrl,
      note: noteHtml,
    });

    const result = await sendEmail({
      to: clientEmail,
      subject: `${EVENT_SUBJECT[event]} — ${subject}`,
      html,
    });

    await tracking.finalize(result.ok);

    if (!result.ok) {
      console.error("[send-ticket-updated] email failed:", result.error);
    }

    return new Response(JSON.stringify({ ok: result.ok }), {
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
