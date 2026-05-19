/**
 * Edge Function: send-project-completed
 * Notifica o cliente quando o projeto e entregue (status -> concluido).
 *
 * Deploy:
 *   supabase functions deploy send-project-completed --no-verify-jwt
 *
 * Secrets: RESEND_API_KEY, FROM_EMAIL, PORTAL_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildEmail, sendEmail, CORS } from "../_shared/email-template.ts";
import { requireOperationalAccess } from "../_shared/auth.ts";
import { getFormalGreeting, getWhatsAppGreeting } from "../_shared/greeting.ts";
import { createCommunication } from "../_shared/comms-tracking.ts";
import { sendWhatsApp } from "../_shared/whatsapp.ts";

interface Payload {
  client_id: string;
  project_name: string;
  delivered_at?: string;
}

function formatDate(date?: string | null): string {
  if (!date) return "Hoje";
  return new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const auth = await requireOperationalAccess(req, CORS);
    if (auth instanceof Response) return auth;

    const { client_id, project_name, delivered_at } = (await req.json()) as Payload;

    if (!client_id || !project_name) {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const PORTAL_URL = Deno.env.get("PORTAL_URL") ?? "https://elkys.com.br/portal/cliente";
    // Link público de avaliação (Google Reviews, Trustpilot, etc.). Quando
    // configurado, adiciona um CTA secundário pedindo review pós-entrega.
    const REVIEW_URL = Deno.env.get("REVIEW_URL") ?? "";

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

    // Bloco de avaliação (NPS/review) — só renderiza se REVIEW_URL estiver
    // configurada. Visualmente distinto do note padrão: borda lateral cyan
    // para chamar atenção sem parecer cobrança.
    const reviewBlock = REVIEW_URL
      ? `
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0"
          style="margin:0 0 18px 0;border:1px solid #e5e7eb;border-left:3px solid #148f8f;">
          <tr>
            <td style="padding:14px 16px;">
              <p style="margin:0 0 6px 0;font-size:14px;font-weight:700;color:#111111;">Sua opinião vale muito</p>
              <p style="margin:0 0 10px 0;font-size:13px;color:#555555;line-height:20px;">
                Se a entrega atendeu às suas expectativas, agradecemos se puder compartilhar
                uma avaliação pública. Isso ajuda outros clientes a nos conhecerem.
              </p>
              <a href="${REVIEW_URL}" target="_blank"
                style="display:inline-block;background-color:#148f8f;color:#ffffff;font-size:13px;font-weight:700;padding:10px 20px;text-decoration:none;">
                Deixar avaliação
              </a>
            </td>
          </tr>
        </table>`
      : "";

    // Telefone para o WhatsApp.
    const recipientPhone = client.whatsapp || client.phone || null;

    const tracking = await createCommunication({
      kind: "project_completed",
      recipientEmail: client.email,
      recipientPhone,
      clientId: client_id,
      entityType: "project",
      entityId: null,
    });
    const projetosHref = await tracking.shorten(`${PORTAL_URL}/projetos`);

    const html = buildEmail({
      preheader: `O projeto "${project_name}" foi entregue e está concluído.`,
      title: "Entrega concluída",
      greeting: getFormalGreeting(client),
      body: `
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">É com satisfação que informamos a conclusão e entrega do projeto <strong>${project_name}</strong>.</p>
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">Todos os detalhes, documentos e histórico permanecem disponíveis no portal para consulta a qualquer momento.</p>
        <p style="margin:0 0 18px;font-size:14px;line-height:22px;color:#333333;">Agradecemos a confiança depositada em nosso trabalho e permanecemos à disposição para os próximos passos.</p>
        ${reviewBlock}
      `,
      highlight: {
        title: "Resumo da entrega",
        rows: [
          { label: "Projeto", value: project_name },
          { label: "Data de entrega", value: formatDate(delivered_at) },
          { label: "Status", value: "Concluído" },
        ],
      },
      button: {
        label: "Acessar o projeto",
        href: projetosHref,
      },
      pixelUrl: tracking.pixelUrl,
      note: "Para ajustes ou suporte pós-entrega, a equipe permanece à disposição pelo portal.",
    });

    const result = await sendEmail({
      to: client.email,
      subject: `Entrega concluída — ${project_name}`,
      html,
    });

    // Espelha o aviso no WhatsApp (curto + link). Falha nao afeta o e-mail.
    let waStatus: "sent" | "failed" | "skipped" = "skipped";
    if (recipientPhone) {
      const waText = `${getWhatsAppGreeting(client)} 🎉\n\nO projeto "${project_name}" foi entregue e está concluído.\n\nFoi um prazer construir isso com você. Os documentos e o histórico continuam disponíveis no portal sempre que precisar.\n\nAcesse o projeto por aqui:\n${projetosHref}\n\nQualquer dúvida, estamos à disposição.`;
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
