/**
 * Edge Function: send-client-welcome
 * Dispara quando um cliente é cadastrado pelo admin.
 * Envia e-mail com e-mail de acesso + senha temporária.
 *
 * Deploy:
 *   supabase functions deploy send-client-welcome
 *
 * Secrets necessários (configurar via Dashboard ou CLI):
 *   supabase secrets set RESEND_API_KEY=re_xxxx
 *   supabase secrets set FROM_EMAIL=noreply@elkys.com.br
 *   supabase secrets set PORTAL_URL=https://elkys.com.br/portal/cliente
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { buildEmail, sendEmail, CORS } from "../_shared/email-template.ts";
import { requireAdminAccess } from "../_shared/auth.ts";
import { getFormalGreeting, getClientFirstName, type Gender } from "../_shared/greeting.ts";
import { createCommunication } from "../_shared/comms-tracking.ts";

interface Payload {
  email: string;
  name: string;
  temp_password: string;
  gender?: Gender;
  client_type?: "pf" | "pj";
  nome_fantasia?: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const auth = await requireAdminAccess(req, CORS);
    if (auth instanceof Response) return auth;

    const { email, name, temp_password, gender, client_type, nome_fantasia } =
      (await req.json()) as Payload;

    if (!email || !name || !temp_password) {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const PORTAL_URL = Deno.env.get("PORTAL_URL") ?? "https://elkys.com.br/portal/cliente";
    const client = {
      full_name: name,
      nome_fantasia: nome_fantasia ?? null,
      client_type: client_type ?? "pf",
      gender,
    };
    const displayName = getClientFirstName(client);

    const tracking = await createCommunication({
      kind: "client_welcome",
      recipientEmail: email,
      clientId: null,
      entityType: "client",
      entityId: null,
    });
    const portalHref = await tracking.shorten(PORTAL_URL);

    const html = buildEmail({
      preheader: "Seu acesso ao Portal Elkys está pronto.",
      title: "Boas-vindas ao Portal Elkys",
      greeting: getFormalGreeting(client),
      body: `
        <p class="text-body" style="margin:0 0 18px 0;font-size:14px;line-height:22px;color:#333333;">É com satisfação que damos as boas-vindas à <strong>Elkys</strong>. Seu acesso ao <strong>Portal do Cliente</strong> foi criado e já está ativo.</p>
        <p class="text-body" style="margin:0 0 18px 0;font-size:14px;line-height:22px;color:#333333;">No portal, o(a) senhor(a) tem acesso centralizado a projetos, documentos, informações financeiras e canal de suporte direto com nossa equipe.</p>
        <p class="text-body" style="margin:0 0 18px 0;font-size:14px;line-height:22px;color:#333333;">Utilize as credenciais abaixo no primeiro acesso. <strong>Por segurança, será solicitada a alteração da senha logo após o login.</strong></p>
      `,
      highlight: {
        title: "Credenciais de acesso",
        rows: [
          { label: "E-mail", value: email },
          { label: "Senha temporária", value: temp_password },
        ],
      },
      button: {
        label: "Acessar o Portal",
        href: portalHref,
      },
      pixelUrl: tracking.pixelUrl,
      showInstitutional: true,
      showSecurityNote: true,
    });

    const result = await sendEmail({
      to: email,
      subject: `Boas-vindas ao Portal Elkys — ${displayName}`,
      html,
    });

    await tracking.finalize(result.ok);

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
