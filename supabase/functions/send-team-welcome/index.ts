/**
 * Edge Function: send-team-welcome
 * Dispara quando um membro da equipe é cadastrado pelo admin.
 * Envia e-mail com e-mail de acesso + senha temporária.
 *
 * Deploy:
 *   supabase functions deploy send-team-welcome
 *
 * Secrets: RESEND_API_KEY, FROM_EMAIL, PORTAL_URL
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { buildEmail, sendEmail, CORS } from "../_shared/email-template.ts";
import { requireAdminAccess } from "../_shared/auth.ts";
import { getTeamMemberGreeting, type Gender } from "../_shared/greeting.ts";
import { createCommunication } from "../_shared/comms-tracking.ts";

interface Payload {
  email: string;
  name: string;
  temp_password: string;
  gender?: Gender;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const auth = await requireAdminAccess(req, CORS);
    if (auth instanceof Response) return auth;

    const { email, name, temp_password, gender } = (await req.json()) as Payload;

    if (!email || !name || !temp_password) {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const PORTAL_URL = Deno.env.get("PORTAL_URL") ?? "https://elkys.com.br/portal/admin";

    const tracking = await createCommunication({
      kind: "team_welcome",
      recipientEmail: email,
      clientId: null,
      entityType: "team_member",
      entityId: null,
    });
    const panelHref = await tracking.shorten(PORTAL_URL);

    const html = buildEmail({
      preheader: "Seu acesso ao painel interno da Elkys está ativo.",
      title: "Boas-vindas à equipe Elkys",
      greeting: getTeamMemberGreeting({ full_name: name, gender }),
      body: `
        <p style="margin:0 0 18px 0;font-size:14px;line-height:22px;color:#333333;">É com grande satisfação que damos as boas-vindas à equipe <strong>Elkys</strong>.</p>
        <p style="margin:0 0 18px 0;font-size:14px;line-height:22px;color:#333333;">Nosso compromisso é com entregas de excelência, colaboração entre áreas e crescimento contínuo. Sua chegada fortalece esse trabalho.</p>
        <p style="margin:0 0 18px 0;font-size:14px;line-height:22px;color:#333333;">Abaixo estão as credenciais de acesso ao painel interno. <strong>Por segurança, será solicitada a alteração da senha no primeiro login.</strong></p>
      `,
      highlight: {
        title: "Credenciais de acesso",
        rows: [
          { label: "E-mail", value: email },
          { label: "Senha temporária", value: temp_password },
        ],
      },
      button: {
        label: "Acessar o painel",
        href: panelHref,
      },
      pixelUrl: tracking.pixelUrl,
      showInstitutional: true,
      showSecurityNote: true,
    });

    const result = await sendEmail({
      to: email,
      subject: `Boas-vindas à equipe Elkys`,
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
