/**
 * Edge Function: send-project-created
 * Notifica o cliente quando um novo projeto e vinculado a sua conta.
 *
 * Deploy:
 *   supabase functions deploy send-project-created --no-verify-jwt
 *
 * Secrets: RESEND_API_KEY, FROM_EMAIL, PORTAL_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildEmail, sendEmail, CORS } from "../_shared/email-template.ts";
import { requireOperationalAccess } from "../_shared/auth.ts";
import { getFormalGreeting } from "../_shared/greeting.ts";
import { createCommunication } from "../_shared/comms-tracking.ts";

interface Payload {
  client_id: string;
  project_name: string;
  solution_type?: string;
  current_stage?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const auth = await requireOperationalAccess(req, CORS);
    if (auth instanceof Response) return auth;

    const { client_id, project_name, solution_type, current_stage } = (await req.json()) as Payload;

    if (!client_id || !project_name) {
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
      .select("full_name, email, nome_fantasia, client_type, gender")
      .eq("id", client_id)
      .maybeSingle();

    if (!client?.email) {
      return new Response(JSON.stringify({ error: "Client not found" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const highlightRows = [
      { label: "Projeto", value: project_name },
      ...(solution_type ? [{ label: "Tipo", value: solution_type }] : []),
      ...(current_stage ? [{ label: "Etapa inicial", value: current_stage }] : []),
    ];

    const tracking = await createCommunication({
      kind: "project_created",
      recipientEmail: client.email,
      clientId: client_id,
      entityType: "project",
      entityId: null,
    });
    const projetosHref = await tracking.shorten(`${PORTAL_URL}/projetos`);

    const html = buildEmail({
      preheader: `O projeto "${project_name}" foi vinculado à sua conta.`,
      title: "Novo projeto registrado",
      greeting: getFormalGreeting(client),
      body: `
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">Informamos que um novo projeto foi registrado e vinculado à sua conta no <strong>Portal Elkys</strong>.</p>
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">A partir deste momento, o(a) senhor(a) pode acompanhar o andamento, etapas, documentos e informações financeiras diretamente pelo portal, com atualizações em tempo real.</p>
        <p style="margin:0;font-size:14px;line-height:22px;color:#333333;">Os detalhes iniciais estão relacionados abaixo.</p>
      `,
      highlight: { title: "Detalhes do projeto", rows: highlightRows },
      button: {
        label: "Acessar o projeto",
        href: projetosHref,
      },
      pixelUrl: tracking.pixelUrl,
      note: "Para dúvidas sobre o projeto, a equipe permanece à disposição pelo suporte do portal.",
    });

    const result = await sendEmail({
      to: client.email,
      subject: `Novo projeto registrado — ${project_name}`,
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
