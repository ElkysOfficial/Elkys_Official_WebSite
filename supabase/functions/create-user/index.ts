/**
 * Edge Function: create-user
 * Creates an auth user via Admin API (no Supabase confirmation email is sent).
 * Called by ClientCreate and TeamCreate instead of supabase.auth.signUp().
 *
 * Deploy:
 *   supabase functions deploy create-user
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { CORS } from "../_shared/email-template.ts";
import { requireAdminAccess } from "../_shared/auth.ts";
import { isValidEmail, isStrongPassword } from "../_shared/validation.ts";

interface Payload {
  email: string;
  password: string;
  full_name: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const auth = await requireAdminAccess(req, CORS);
    if (auth instanceof Response) return auth;

    const { email, password, full_name } = (await req.json()) as Payload;

    if (!email || !password || !full_name) {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = full_name.trim();

    if (!isValidEmail(trimmedEmail)) {
      return new Response(JSON.stringify({ error: "Invalid email format" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (trimmedName.length < 3 || trimmedName.length > 200) {
      return new Response(JSON.stringify({ error: "Name must be between 3 and 200 characters" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (!isStrongPassword(password)) {
      return new Response(
        JSON.stringify({
          error: "Password must be at least 8 characters with uppercase, lowercase, and digit",
        }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // Admin createUser never sends Supabase's own confirmation email
    const { data, error } = await auth.adminClient.auth.admin.createUser({
      email: trimmedEmail,
      password,
      email_confirm: true, // mark as confirmed - no email needed, we send our own
      user_metadata: { full_name: trimmedName },
    });

    if (error) {
      // E-mail ja cadastrado e o caso mais comum: o Supabase Auth nao
      // permite duas contas com o mesmo e-mail (um membro da equipe e um
      // cliente, por exemplo). Devolve uma mensagem clara em vez do texto
      // tecnico cru do GoTrue.
      const alreadyRegistered = /already (been )?registered|already exists|email.*exists/i.test(
        error.message
      );
      const friendlyMessage = alreadyRegistered
        ? "Este e-mail já está em uso por outra conta do portal. Use um e-mail diferente."
        : error.message;
      return new Response(JSON.stringify({ error: friendlyMessage }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, user_id: data.user.id }), {
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
