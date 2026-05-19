/**
 * Edge Function: check-overdue-client-actions
 * Cron job that checks for overdue next_steps requiring client action
 * and sends reminder emails.
 *
 * Deploy:
 *   supabase functions deploy check-overdue-client-actions --no-verify-jwt
 *
 * Secrets: RESEND_API_KEY, FROM_EMAIL, PORTAL_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildEmail, sendEmail, CORS, getTimeGreeting } from "../_shared/email-template.ts";
import { createCommunication } from "../_shared/comms-tracking.ts";

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const PORTAL_URL = Deno.env.get("PORTAL_URL") ?? "https://elkys.com.br/portal/cliente";

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const today = new Date().toISOString().slice(0, 10);

    // Find overdue next_steps requiring client action
    const { data: overdueSteps, error: queryError } = await admin
      .from("project_next_steps")
      .select("id, title, description, due_date, client_id, project_id")
      .eq("requires_client_action", true)
      .is("client_responded_at", null)
      .lt("due_date", today)
      .in("status", ["pendente", "em_andamento"]);

    if (queryError || !overdueSteps?.length) {
      return new Response(
        JSON.stringify({
          ok: true,
          processed: 0,
          reason: queryError?.message ?? "No overdue steps",
        }),
        { headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // Group by client to send one email per client
    const byClient: Record<
      string,
      { client_id: string; project_ids: Set<string>; steps: typeof overdueSteps }
    > = {};

    for (const step of overdueSteps) {
      if (!byClient[step.client_id]) {
        byClient[step.client_id] = {
          client_id: step.client_id,
          project_ids: new Set(),
          steps: [],
        };
      }
      byClient[step.client_id].steps.push(step);
      if (step.project_id) byClient[step.client_id].project_ids.add(step.project_id);
    }

    let sentCount = 0;

    for (const group of Object.values(byClient)) {
      const { data: client } = await admin
        .from("clients")
        .select("full_name, email")
        .eq("id", group.client_id)
        .maybeSingle();

      if (!client?.email) continue;

      const firstName = client.full_name.split(" ")[0];
      const stepsList = group.steps
        .map(
          (s) =>
            `<li style="margin-bottom:8px;"><strong>${s.title}</strong>${s.due_date ? ` (prazo: ${formatDate(s.due_date)})` : ""}</li>`
        )
        .join("");

      const tracking = await createCommunication({
        kind: "client_action",
        recipientEmail: client.email,
        clientId: group.client_id,
        entityType: "client",
        entityId: group.client_id,
      });
      const projectsHref = await tracking.shorten(`${PORTAL_URL}/projetos`);

      const html = buildEmail({
        preheader: `Você tem ${group.steps.length} solicitação(ões) pendente(s) que precisam da sua atenção.`,
        title: "Lembrete: solicitações pendentes",
        greeting: `${getTimeGreeting()}, ${firstName}!`,
        body: `
          <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">Você tem <strong>${group.steps.length}</strong> solicitação(ões) pendente(s) que já ultrapassaram o prazo estimado.</p>
          <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">Sua resposta é fundamental para o andamento dos projetos:</p>
          <ul style="margin:0 0 12px;padding-left:20px;">
            ${stepsList}
          </ul>
          <p style="margin:0;font-size:14px;line-height:22px;color:#333333;">Acesse o portal para responder.</p>
        `,
        button: {
          label: "Acessar meus projetos →",
          href: projectsHref,
        },
        note: "Responder dentro do prazo evita atrasos nas entregas do seu projeto.",
        pixelUrl: tracking.pixelUrl,
      });

      const result = await sendEmail({
        to: client.email,
        subject: `Lembrete: ${group.steps.length} solicitação(ões) pendente(s)`,
        html,
      });

      await tracking.finalize(result.ok);

      if (result.ok) sentCount++;

      // Create admin notification
      void admin.from("admin_notifications").insert({
        type: "lembrete_enviado",
        title: `Lembrete enviado: ${client.full_name}`,
        body: `Lembrete automático enviado para ${client.full_name} sobre ${group.steps.length} solicitação(ões) em atraso.`,
        severity: "info",
        target_roles: ["admin_super", "admin"],
        entity_type: "client",
        entity_id: group.client_id,
      });
    }

    return new Response(
      JSON.stringify({ ok: true, processed: Object.keys(byClient).length, sent: sentCount }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
