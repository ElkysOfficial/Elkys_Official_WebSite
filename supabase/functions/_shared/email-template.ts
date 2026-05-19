import { escapeHtml } from "./validation.ts";

const LOGO_URL = "https://elkys.com.br/imgs/icons/lettering_elkys_branco.png";
const SITE_URL = "elkys.com.br";

interface EmailButton {
  label: string;
  href: string;
}

interface EmailTemplateOptions {
  preheader?: string;
  title: string;
  greeting: string;
  body: string;
  button?: EmailButton;
  note?: string;
  highlight?: {
    title: string;
    rows: { label: string; value: string }[];
  };
  warning?: string;
  /**
   * Exibe o parágrafo institucional no footer ("A Elkys é especializada..."),
   * usado apenas em e-mails de primeiro contato (welcome). Default: false.
   */
  showInstitutional?: boolean;
  /**
   * Exibe o aviso de segurança ("Caso você não reconheça este acesso...").
   * Default: false. Usado em welcome e password-reset.
   */
  showSecurityNote?: boolean;
  /**
   * URL do pixel de rastreio de abertura (1×1). Quando informada, um
   * `<img>` invisível é injetado antes do `</body>`. Gerada por
   * `createCommunication` (`_shared/comms-tracking.ts`).
   */
  pixelUrl?: string;
}

/**
 * Escapa aspas, sinais de maior/menor em URLs antes de interpolar em atributos
 * href. Evita XSS quando o valor vier de input (admin).
 */
function escapeAttr(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildEmail(opts: EmailTemplateOptions): string {
  const highlightBlock = opts.highlight
    ? `
                        <!-- CREDENCIAIS -->
                        <table
                          role="presentation"
                          width="100%"
                          border="0"
                          cellspacing="0"
                          cellpadding="0"
                          style="
                            width: 100%;
                            background-color: #f7f7f7;
                            border: 1px solid #dddddd;
                            border-radius: 6px;
                            margin: 0 0 22px 0;
                          "
                        >
                          <tr>
                            <td style="padding: 14px;">
                              <table
                                role="presentation"
                                width="100%"
                                border="0"
                                cellspacing="0"
                                cellpadding="0"
                              >
                                ${opts.highlight.rows
                                  .map(
                                    (row, i) => `
                                <tr class="stack-column">
                                  <td
                                    class="credential-label text-muted"
                                    valign="top"
                                    style="
                                      width: 145px;
                                      padding: 0 10px ${i === opts.highlight!.rows.length - 1 ? "0" : "10px"} 0;
                                      font-size: 13px;
                                      line-height: 20px;
                                      color: #666666;
                                    "
                                  >
                                    ${escapeHtml(row.label)}
                                  </td>
                                  <td
                                    class="text-dark"
                                    valign="top"
                                    style="
                                      padding: 0 0 ${i === opts.highlight!.rows.length - 1 ? "0" : "10px"} 0;
                                      font-size: 13px;
                                      line-height: 20px;
                                      color: ${/e-?mail/i.test(row.label) ? "#1d4ed8" : "#111111"};
                                      font-weight: 700;
                                    "
                                  >
                                    ${escapeHtml(row.value)}
                                  </td>
                                </tr>`
                                  )
                                  .join("")}
                              </table>
                            </td>
                          </tr>
                        </table>`
    : "";

  const safeButtonHref = opts.button ? escapeAttr(opts.button.href) : "";
  const safeButtonLabel = opts.button ? escapeHtml(opts.button.label) : "";
  const buttonBlock = opts.button
    ? `
                        <!-- BOTÃO -->
                        <table
                          role="presentation"
                          width="100%"
                          border="0"
                          cellspacing="0"
                          cellpadding="0"
                          style="margin: 0 0 24px 0;"
                        >
                          <tr>
                            <td align="center">
                              <!--[if mso]>
                                <v:roundrect
                                  xmlns:v="urn:schemas-microsoft-com:vml"
                                  href="${safeButtonHref}"
                                  style="height:42px;v-text-anchor:middle;width:200px;"
                                  arcsize="14%"
                                  strokecolor="#472680"
                                  fillcolor="#472680"
                                >
                                  <w:anchorlock />
                                  <center
                                    style="
                                      color:#ffffff;
                                      font-family:Arial, Helvetica, sans-serif;
                                      font-size:14px;
                                      font-weight:bold;
                                    "
                                  >
                                    ${safeButtonLabel}
                                  </center>
                                </v:roundrect>
                              <![endif]-->

                              <!--[if !mso]><!-- -->
                              <a
                                href="${safeButtonHref}"
                                target="_blank"
                                class="button button-purple"
                                style="
                                  display: inline-block;
                                  background-color: #472680;
                                  color: #ffffff;
                                  font-size: 14px;
                                  line-height: 14px;
                                  font-weight: 700;
                                  padding: 14px 28px;
                                  border-radius: 6px;
                                "
                              >
                                ${safeButtonLabel}
                              </a>
                              <!--<![endif]-->
                            </td>
                          </tr>
                        </table>`
    : "";

  const warningBlock = opts.warning
    ? `
                        <p
                          class="text-body"
                          style="
                            margin: 0 0 18px 0;
                            font-size: 14px;
                            line-height: 22px;
                            color: #333333;
                          "
                        >
                          ${opts.warning}
                        </p>`
    : "";

  // Pixel de rastreio de abertura: GIF 1×1 invisivel injetado no fim do body.
  const pixelBlock = opts.pixelUrl
    ? `
    <img
      src="${escapeAttr(opts.pixelUrl)}"
      width="1"
      height="1"
      alt=""
      style="display:block;width:1px;height:1px;border:0;opacity:0;"
    />`
    : "";

  const noteBlock = opts.note
    ? `
                        <p
                          class="text-body"
                          style="
                            margin: 0 0 18px 0;
                            font-size: 14px;
                            line-height: 22px;
                            color: #333333;
                          "
                        >
                          ${opts.note}
                        </p>`
    : "";

  return `<!doctype html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="x-ua-compatible" content="ie=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <title>Email Elkys</title>

    <style>
      html,
      body {
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        height: 100% !important;
        background-color: #f3f4f6 !important;
      }

      body,
      table,
      td,
      a {
        -webkit-text-size-adjust: 100%;
        -ms-text-size-adjust: 100%;
        font-family: Arial, Helvetica, sans-serif;
      }

      table,
      td {
        mso-table-lspace: 0pt;
        mso-table-rspace: 0pt;
        border-collapse: collapse !important;
      }

      img {
        border: 0;
        outline: none;
        text-decoration: none;
        display: block;
        -ms-interpolation-mode: bicubic;
      }

      a {
        text-decoration: none;
      }

      .apple-link a {
        color: inherit !important;
        text-decoration: none !important;
      }

      @media only screen and (max-width: 600px) {
        .container {
          width: 100% !important;
          max-width: 100% !important;
        }

        .mobile-side-padding {
          padding-left: 16px !important;
          padding-right: 16px !important;
        }

        .mobile-content-padding {
          padding: 20px 16px 24px 16px !important;
        }

        .stack-column,
        .stack-column td {
          display: block !important;
          width: 100% !important;
        }

        .credential-label {
          padding-bottom: 4px !important;
        }

        .button {
          display: block !important;
          width: 100% !important;
          box-sizing: border-box !important;
        }

        .footer-social-padding {
          padding-left: 16px !important;
          padding-right: 16px !important;
        }
      }

      [data-ogsc] .email-bg,
      [data-ogsb] .email-bg {
        background-color: #f3f4f6 !important;
      }

      [data-ogsc] .card-bg,
      [data-ogsb] .card-bg {
        background-color: #ffffff !important;
      }

      [data-ogsc] .purple-bg,
      [data-ogsb] .purple-bg {
        background-color: #472680 !important;
      }

      [data-ogsc] .text-dark,
      [data-ogsb] .text-dark {
        color: #111111 !important;
      }

      [data-ogsc] .text-body,
      [data-ogsb] .text-body {
        color: #333333 !important;
      }

      [data-ogsc] .text-muted,
      [data-ogsb] .text-muted {
        color: #666666 !important;
      }

      [data-ogsc] .button-purple,
      [data-ogsb] .button-purple {
        background-color: #472680 !important;
        color: #ffffff !important;
      }
    </style>
  </head>

  <body class="email-bg" style="margin: 0; padding: 0; background-color: #f3f4f6;">
    <!-- PREHEADER (preview na inbox, invisível no corpo) -->
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f3f4f6;opacity:0;">
      ${escapeHtml(opts.preheader ?? "")}
    </div>
    <div style="display:none;max-height:0;overflow:hidden;">
      &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
    </div>
    <center style="width: 100%; background-color: #f3f4f6;">
    <table
      role="presentation"
      width="100%"
      border="0"
      cellspacing="0"
      cellpadding="0"
      class="email-bg"
      style="background-color: #f3f4f6;"
    >
      <tr>
        <td align="center" valign="top" style="background-color: #f3f4f6;">
          <!-- HEADER ROXO -->
          <table
            role="presentation"
            width="100%"
            border="0"
            cellspacing="0"
            cellpadding="0"
            class="purple-bg"
            style="background-color: #472680;"
          >
            <tr>
              <td align="center" style="padding: 28px 16px 0 16px;">
                <table
                  role="presentation"
                  width="552"
                  border="0"
                  cellspacing="0"
                  cellpadding="0"
                  class="container"
                  style="width: 552px; max-width: 552px;"
                >
                  <tr>
                    <td align="left" style="padding: 0 0 28px 16px;">
                      <img
                        src="${LOGO_URL}"
                        width="110"
                        height="29"
                        alt="Elkys"
                        style="display: block; width: 110px; max-width: 110px; height: auto;"
                      />
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td height="5" style="height: 5px; line-height: 5px; font-size: 0;">
                &nbsp;
              </td>
            </tr>
          </table>

          <!-- TRANSIÇÃO HEADER + CARD -->
          <table
            role="presentation"
            width="100%"
            border="0"
            cellspacing="0"
            cellpadding="0"
            style="background-color: #f3f4f6;"
          >
            <tr>
              <td
                align="center"
                valign="top"
                class="mobile-side-padding"
                style="
                  padding: 0 16px;
                  background:
                    linear-gradient(to bottom, #472680 0, #472680 58px, #f3f4f6 58px, #f3f4f6 100%);
                "
              >
                <table
                  role="presentation"
                  width="552"
                  border="0"
                  cellspacing="0"
                  cellpadding="0"
                  class="container card-bg"
                  style="
                    width: 552px;
                    max-width: 552px;
                    background-color: #ffffff;
                    border-top: 3px solid #148f8f;
                  "
                >
                  <tr>
                    <td
                      class="mobile-content-padding"
                      style="padding: 24px 24px 0 24px; background-color: #ffffff;"
                    >
                      <p
                        class="text-body"
                        style="
                          margin: 0 0 18px 0;
                          font-size: 14px;
                          line-height: 22px;
                          color: #444444;
                        "
                      >
                        ${opts.greeting}
                      </p>

                      ${opts.body}

                      ${highlightBlock}

                      ${buttonBlock}

                      ${warningBlock}

                      ${noteBlock}

                      <p
                        class="text-body"
                        style="
                          margin: 0 0 6px 0;
                          font-size: 14px;
                          line-height: 22px;
                          color: #333333;
                        "
                      >
                        Atenciosamente,
                      </p>

                      <p
                        class="text-dark"
                        style="
                          margin: 0 0 24px 0;
                          font-size: 14px;
                          line-height: 22px;
                          color: #111111;
                          font-weight: 700;
                        "
                      >
                        Equipe Elkys
                      </p>

                      ${
                        opts.showInstitutional
                          ? `<p
                        class="text-muted"
                        style="
                          margin: 0 0 12px 0;
                          font-size: 11px;
                          line-height: 18px;
                          color: #666666;
                          font-style: italic;
                        "
                      >
                        A Elkys é especializada no desenvolvimento de soluções digitais sob medida,
                        com foco em arquitetura robusta, performance e segurança. Atuamos na
                        construção de sistemas, automações e plataformas que sustentam operações
                        críticas, garantindo confiabilidade, escalabilidade e integridade dos dados
                        em todas as camadas da aplicação.
                      </p>`
                          : ""
                      }

                      ${
                        opts.showSecurityNote
                          ? `<p
                        class="text-muted"
                        style="
                          margin: 0 0 12px 0;
                          font-size: 11px;
                          line-height: 18px;
                          color: #666666;
                          font-style: italic;
                        "
                      >
                        Caso o(a) senhor(a) não reconheça este acesso ou não tenha solicitado este
                        cadastro, solicitamos contato imediato com nossa equipe.
                      </p>`
                          : ""
                      }

                      <p
                        class="text-muted"
                        style="
                          margin: 0 0 0 0;
                          font-size: 11px;
                          line-height: 18px;
                          color: #666666;
                          font-style: italic;
                        "
                      >
                        Permanecemos à disposição. Este e-mail aceita resposta direta.
                      </p>
                    </td>
                  </tr>

                  <!-- ESPAÇO INTERNO BRANCO ANTES DE ENTRAR NO FOOTER -->
                  <tr>
                    <td
                      style="
                        height: 14px;
                        line-height: 14px;
                        font-size: 0;
                        background-color: #ffffff;
                      "
                    >
                      &nbsp;
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <!-- FAIXA DE TRANSIÇÃO FOOTER:
               centro continua branco, laterais já ficam roxas -->
          <table
            role="presentation"
            width="100%"
            border="0"
            cellspacing="0"
            cellpadding="0"
            class="purple-bg"
            style="background-color: #472680"
          >
            <tr>
              <td
                align="center"
                valign="top"
                class="mobile-side-padding"
                style="padding: 0 16px; background-color: #472680"
              >
                <table
                  role="presentation"
                  width="552"
                  border="0"
                  cellspacing="0"
                  cellpadding="0"
                  class="container"
                  style="width: 552px; max-width: 552px"
                >
                  <tr>
                    <td
                      style="
                        height: 44px;
                        line-height: 14px;
                        font-size: 0;
                        background-color: #ffffff;
                      "
                    >
                      &nbsp;
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- FOOTER -->
            <tr>
              <td
                align="center"
                valign="top"
                class="footer-social-padding"
                style="padding: 14px 16px 20px 16px; background-color: #472680"
              >
                <table
                  role="presentation"
                  width="552"
                  border="0"
                  cellspacing="0"
                  cellpadding="0"
                  class="container"
                  style="width: 552px; max-width: 552px"
                >
                  <tr>
                    <td align="left" style="padding: 0 0 0 16px">
                      <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                        <tr>
                          <td style="padding: 0 8px 0 0">
                            <a href="https://www.linkedin.com/company/elkys/" target="_blank">
                              <img
                                src="https://cdn-icons-png.flaticon.com/24/174/174857.png"
                                width="24"
                                height="24"
                                alt="LinkedIn"
                                style="display: block"
                              />
                            </a>
                          </td>
                          <td style="padding: 0 8px 0 0">
                            <a href="https://www.instagram.com/elkys_oficial/" target="_blank">
                              <img
                                src="https://cdn-icons-png.flaticon.com/24/2111/2111463.png"
                                width="24"
                                height="24"
                                alt="Instagram"
                                style="display: block"
                              />
                            </a>
                          </td>
                          <td style="padding: 0">
                            <a
                              href="https://api.whatsapp.com/send/?phone=553199738235&text&type=phone_number&app_absent=0"
                              target="_blank"
                            >
                              <img
                                src="https://cdn-icons-png.flaticon.com/24/733/733585.png"
                                width="24"
                                height="24"
                                alt="WhatsApp"
                                style="display: block"
                              />
                            </a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td
                      align="left"
                      style="
                        padding: 12px 0 0 16px;
                        font-family: Arial, Helvetica, sans-serif;
                        font-size: 11px;
                        line-height: 16px;
                        color: #edeff2;
                        opacity: 0.7;
                      "
                    >
                      &copy; ${new Date().getFullYear()} Elkys &middot; ${SITE_URL}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

        </td>
      </tr>
    </table>
    </center>
    ${pixelBlock}
  </body>
</html>`;
}

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Retorna a saudacao apropriada para o horario atual no timezone do Brasil.
 * - 05h-11h59: "Bom dia"
 * - 12h-17h59: "Boa tarde"
 * - 18h-04h59: "Boa noite"
 *
 * Usa Intl.DateTimeFormat com timezone America/Sao_Paulo (respeita DST
 * automaticamente se voltar a ser adotado).
 *
 * Uso: `greeting: `${getTimeGreeting()}, ${clientName}.`,`
 */
export function getTimeGreeting(tz: string = "America/Sao_Paulo"): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    hour12: false,
  });
  const hour = parseInt(fmt.format(new Date()), 10);
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  /** Reply-To opcional — default: REPLY_TO_EMAIL (secret) ou contato@elkys.com.br */
  replyTo?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  // Fallback com display name: mailbox providers (Gmail/Outlook) mostram "Elkys"
  // no lugar do endereco cru quando o From vem como "Nome <email@dominio>".
  // O secret FROM_EMAIL no Supabase deve estar configurado com esse formato;
  // esse fallback evita quebra caso o secret seja resetado.
  const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "Elkys <noreply@elkys.com.br>";
  const DEFAULT_REPLY_TO = Deno.env.get("REPLY_TO_EMAIL") ?? "contato@elkys.com.br";
  // List-Unsubscribe (RFC 2369 + RFC 8058 one-click).
  // Gmail/Outlook exigem esse header em bulk senders para manter boa reputacao
  // e expor o botao nativo de descadastro no cabecalho do email — sem ele,
  // reports de spam caem direto na pontuacao do dominio. O endpoint mailto eh
  // aceitavel como ponto de entrada; a implementacao de opt-out efetivo (honrar
  // o pedido, remover da fila) fica com o time que recebe o inbox.
  const UNSUBSCRIBE_MAILTO = Deno.env.get("UNSUBSCRIBE_EMAIL") ?? "unsubscribe@elkys.com.br";

  if (!RESEND_API_KEY) {
    console.error("[sendEmail] RESEND_API_KEY not configured");
    return { ok: false, error: "Email service not configured" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      reply_to: opts.replyTo ?? DEFAULT_REPLY_TO,
      headers: {
        "List-Unsubscribe": `<mailto:${UNSUBSCRIBE_MAILTO}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("[sendEmail] Resend error:", detail);
    return { ok: false, error: detail };
  }

  return { ok: true };
}
