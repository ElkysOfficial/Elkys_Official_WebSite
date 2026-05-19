/**
 * Edge Function: send-document-added
 * Notifica o cliente quando o admin adiciona um novo documento ao seu perfil.
 *
 * Deploy:
 *   supabase functions deploy send-document-added --no-verify-jwt
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
  document_label: string;
  document_type: string;
  document_url: string;
}

const DOC_TYPE_LABEL: Record<string, string> = {
  contrato: "Contrato",
  aditivo: "Aditivo contratual",
  nota_fiscal: "Nota Fiscal",
  codigo_fonte: "Código Fonte",
  outro: "Documento",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const auth = await requireAdminAccess(req, CORS);
    if (auth instanceof Response) return auth;

    const { client_id, document_label, document_type, document_url } =
      (await req.json()) as Payload;

    if (!client_id || !document_label) {
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

    // Fetch client email and name
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

    const typeLabel = DOC_TYPE_LABEL[document_type] ?? "Documento";

    // Abre o documento diretamente quando houver URL; caso contrário
    // direciona para a lista de documentos no portal.
    const documentHref =
      document_url && /^https?:\/\//i.test(document_url)
        ? document_url
        : `${PORTAL_URL}/documentos`;

    // Telefone para o WhatsApp.
    const recipientPhone = client.whatsapp || client.phone || null;

    const tracking = await createCommunication({
      kind: "document_added",
      recipientEmail: client.email,
      recipientPhone,
      clientId: client_id,
      entityType: "document",
      entityId: null,
    });
    const documentHrefTracked = await tracking.shorten(documentHref);

    const html = buildEmail({
      preheader: `${typeLabel}: ${document_label} — disponível no portal.`,
      title: "Novo documento disponível",
      greeting: getFormalGreeting(client),
      body: `
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">Um novo documento foi disponibilizado em sua área do <strong>Portal Elkys</strong>.</p>
        <p style="margin:0;font-size:14px;line-height:22px;color:#333333;">O arquivo está disponível para visualização e download a qualquer momento, de forma segura.</p>
      `,
      highlight: {
        title: "Detalhes do documento",
        rows: [
          { label: "Tipo", value: typeLabel },
          { label: "Nome", value: document_label },
        ],
      },
      button: {
        label: document_url ? "Abrir documento" : "Acessar documentos",
        href: documentHrefTracked,
      },
      pixelUrl: tracking.pixelUrl,
      note: "Para dúvidas sobre o documento, a equipe permanece à disposição pelo portal.",
    });

    const result = await sendEmail({
      to: client.email,
      subject: `Novo documento disponível — ${document_label}`,
      html,
    });

    // Espelha o aviso no WhatsApp (curto + link). Falha nao afeta o e-mail.
    let waStatus: "sent" | "failed" | "skipped" = "skipped";
    if (recipientPhone) {
      const waText = `${getWhatsAppGreeting(client)}\n\nUm novo documento (${typeLabel}: ${document_label}) foi disponibilizado na sua área do portal.\n\n${document_url ? "Abra o documento por aqui:" : "Acesse seus documentos por aqui:"}\n${documentHrefTracked}\n\nQualquer dúvida, estamos à disposição para ajudar.`;
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
