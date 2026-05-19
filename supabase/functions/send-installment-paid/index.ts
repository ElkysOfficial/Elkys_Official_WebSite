/**
 * Edge Function: send-installment-paid
 * Notifica o cliente por e-mail quando uma parcela do projeto é confirmada como paga.
 *
 * Deploy:
 *   supabase functions deploy send-installment-paid --no-verify-jwt
 *
 * Secrets: RESEND_API_KEY, FROM_EMAIL, PORTAL_URL,
 *          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { buildEmail, sendEmail, CORS } from "../_shared/email-template.ts";
import { requireAdminAccess, createServiceRoleClient } from "../_shared/auth.ts";
import { getFormalGreeting } from "../_shared/greeting.ts";
import { createCommunication } from "../_shared/comms-tracking.ts";

interface Payload {
  installment_id: string;
  client_id: string;
  project_id: string;
}

const INSTALLMENT_TYPE_LABEL: Record<string, string> = {
  entrada: "Entrada",
  entrega: "Entrega",
  parcial: "Parcial",
  final: "Final",
};

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateBR(iso: string | null): string {
  if (!iso) return "—";
  const [year, month, day] = iso.slice(0, 10).split("-");
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const auth = await requireAdminAccess(req, CORS);
    if (auth instanceof Response) return auth;

    const { installment_id, client_id, project_id } = (await req.json()) as Payload;

    if (!installment_id || !client_id || !project_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const PORTAL_URL = Deno.env.get("PORTAL_URL") ?? "https://elkys.com.br/portal/cliente";
    const admin = createServiceRoleClient();

    // Fetch installment
    const { data: installment, error: installmentError } = await admin
      .from("project_installments")
      .select(
        "installment_type, percentage, amount, effective_due_date, expected_due_date, paid_at"
      )
      .eq("id", installment_id)
      .maybeSingle();

    if (installmentError || !installment) {
      return new Response(JSON.stringify({ error: "Installment not found" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Fetch project name
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("name")
      .eq("id", project_id)
      .maybeSingle();

    if (projectError || !project) {
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Fetch client
    const { data: client, error: clientError } = await admin
      .from("clients")
      .select("full_name, email, email_financeiro, nome_fantasia, client_type, gender")
      .eq("id", client_id)
      .maybeSingle();

    if (clientError || !client?.email) {
      return new Response(JSON.stringify({ error: "Client not found or missing email" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const companyName = client.nome_fantasia || client.full_name;
    const typeLabel =
      INSTALLMENT_TYPE_LABEL[installment.installment_type] ?? installment.installment_type;
    const amount = formatBRL(Number(installment.amount));
    const percentage = Number(installment.percentage);
    const dueDate = formatDateBR(installment.effective_due_date ?? installment.expected_due_date);
    const paidAt = formatDateBR(installment.paid_at ?? new Date().toISOString().slice(0, 10));
    const projectUrl = `${PORTAL_URL}/projetos/${project_id}`;

    const recipientEmail = client.email_financeiro || client.email;

    const tracking = await createCommunication({
      kind: "installment_paid",
      recipientEmail,
      clientId: client_id,
      entityType: "charge",
      entityId: installment_id,
    });
    const projectHref = await tracking.shorten(projectUrl);

    const html = buildEmail({
      preheader: `Confirmamos o recebimento da parcela de ${typeLabel.toLowerCase()} no valor de ${amount}.`,
      title: "Pagamento confirmado",
      greeting: getFormalGreeting(client),
      body: `
        <p style="margin:0 0 14px;font-size:14px;line-height:22px;color:#333333;">Confirmamos o recebimento do pagamento referente à parcela de <strong>${typeLabel.toLowerCase()}</strong> do projeto <strong>${project.name}</strong>.</p>
        <p style="margin:0 0 14px;font-size:14px;line-height:22px;color:#333333;">O registro foi processado e sua conta encontra-se em situação regular. Agradecemos pela pontualidade e pela confiança depositada em nosso trabalho.</p>
        <p style="margin:0 0 22px;font-size:14px;line-height:22px;color:#333333;">Para dúvidas sobre este ou outros pagamentos, a equipe financeira permanece à disposição pelo portal.</p>
      `,
      highlight: {
        title: "Detalhes do pagamento",
        rows: [
          { label: "Projeto", value: project.name },
          { label: "Cliente", value: companyName },
          { label: "Parcela", value: `${typeLabel} (${percentage}%)` },
          { label: "Valor", value: amount },
          { label: "Vencimento original", value: dueDate },
          { label: "Confirmação", value: paidAt },
          { label: "Situação", value: "Pago" },
        ],
      },
      button: {
        label: "Acessar o projeto",
        href: projectHref,
      },
      pixelUrl: tracking.pixelUrl,
      note: "Este e-mail serve como comprovante de registro do pagamento.",
    });

    const result = await sendEmail({
      to: recipientEmail,
      subject: `Pagamento confirmado — ${project.name} (${typeLabel} ${percentage}%)`,
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
    console.error("[send-installment-paid]", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
