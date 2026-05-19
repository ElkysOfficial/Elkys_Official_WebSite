/**
 * Helpers de saudação formal para e-mails.
 *
 * Saída padrão esperada nos e-mails:
 *   "Bom dia, Sr. João,"
 *   "Boa tarde, Sra. Maria,"
 *   "Boa noite, Prezado(a) Cliente Alpha,"
 *
 * Referência de horário: America/Sao_Paulo (BRT/BRST, sem DST desde 2019).
 */

export type Gender = "masculino" | "feminino" | null | undefined;

export type ClientLike = {
  full_name?: string | null;
  nome_fantasia?: string | null;
  client_type?: string | null; // 'pf' | 'pj'
  gender?: Gender;
};

/**
 * Retorna "Bom dia" | "Boa tarde" | "Boa noite" no fuso America/Sao_Paulo.
 *
 * Faixas (inclusivas):
 *   05:00–11:59 → Bom dia
 *   12:00–17:59 → Boa tarde
 *   18:00–04:59 → Boa noite
 */
export function getTimeGreeting(now: Date = new Date()): string {
  // Extrai a hora em America/Sao_Paulo independente do TZ do servidor.
  const hour = Number(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hour12: false,
    }).format(now)
  );

  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Extrai o primeiro nome de uma string "João da Silva" → "João".
 * Para PJ, prefere nome_fantasia como nome amigável; cai em razão social
 * ou full_name quando ausente.
 */
export function getClientFirstName(client: ClientLike): string {
  const isPJ = client.client_type === "pj";
  const base = (isPJ ? client.nome_fantasia?.trim() : null) || client.full_name?.trim() || "";

  if (!base) return "Cliente";
  // Para PJ, retorna o nome fantasia/razão inteiro (curto). Para PF, só o primeiro.
  if (isPJ) return base;
  return base.split(/\s+/)[0];
}

/**
 * Nome completo ou razão social — usado em blocos de detalhes.
 */
export function getClientDisplayName(client: ClientLike): string {
  const isPJ = client.client_type === "pj";
  if (isPJ) {
    return client.nome_fantasia?.trim() || client.full_name?.trim() || "Cliente";
  }
  return client.full_name?.trim() || "Cliente";
}

/**
 * Saudação formal completa de abertura de e-mail.
 *
 * Regras:
 *   PF masculino  → "Bom dia, Sr. João,"
 *   PF feminino   → "Boa tarde, Sra. Maria,"
 *   PF sem gênero → "Boa noite, Prezado(a) João,"
 *   PJ            → "Bom dia, Prezado(a) Cliente Alpha," (gênero é do representante,
 *                    mas em e-mails corporativos usamos Prezado(a) por padrão)
 *
 * Observação: quando for PJ e `gender` estiver preenchido (do representante),
 * usa Sr./Sra. seguido do primeiro nome do representante (full_name).
 */
export function getFormalGreeting(client: ClientLike, now?: Date): string {
  const timePart = getTimeGreeting(now);
  const isPJ = client.client_type === "pj";

  // PJ com gênero do representante definido → usa Sr./Sra. + primeiro nome do representante
  if (isPJ && client.gender) {
    const repFirstName = (client.full_name?.trim() || "").split(/\s+/)[0] || "Cliente";
    const treatment = client.gender === "feminino" ? "Sra." : "Sr.";
    return `${timePart}, ${treatment} ${repFirstName},`;
  }

  // PJ sem gênero → Prezado(a) + nome da empresa
  if (isPJ) {
    return `${timePart}, Prezado(a) ${getClientDisplayName(client)},`;
  }

  // PF
  const firstName = getClientFirstName(client);
  if (client.gender === "masculino") return `${timePart}, Sr. ${firstName},`;
  if (client.gender === "feminino") return `${timePart}, Sra. ${firstName},`;
  return `${timePart}, Prezado(a) ${firstName},`;
}

/**
 * Saudação formal para destinatário interno (equipe Elkys) em e-mails de
 * notificação admin. Mesma lógica, sem PJ.
 */
export function getTeamMemberGreeting(
  member: { full_name?: string | null; gender?: Gender },
  now?: Date
): string {
  const timePart = getTimeGreeting(now);
  const firstName = (member.full_name?.trim() || "").split(/\s+/)[0] || "colega";
  if (member.gender === "masculino") return `${timePart}, Sr. ${firstName},`;
  if (member.gender === "feminino") return `${timePart}, Sra. ${firstName},`;
  return `${timePart}, ${firstName},`;
}

/**
 * Saudação genérica (sem destinatário identificado — ex: reset de senha
 * onde evitamos revelar se o e-mail existe).
 */
export function getGenericGreeting(now?: Date): string {
  return `${getTimeGreeting(now)},`;
}

/**
 * Saudação de abertura para mensagens de WhatsApp. Reaproveita a saudação
 * formal (Bom dia/tarde/noite + Sr./Sra./Prezado(a) + nome) trocando a
 * vírgula de e-mail por um fecho conversacional.
 *   "Bom dia, Sr. João! Tudo bem?"
 *   "Boa tarde, Sra. Maria! Tudo bem?"
 */
export function getWhatsAppGreeting(client: ClientLike, now?: Date): string {
  return `${getFormalGreeting(client, now).replace(/,\s*$/, "")}! Tudo bem?`;
}

/**
 * Trunca uma string respeitando a fronteira de palavras e adiciona "…" ao
 * final quando cortada. Evita o típico "...scopo da propos" dos slice brutos.
 */
export function truncateAtWord(text: string, maxLength: number): string {
  const clean = (text ?? "").trim();
  if (clean.length <= maxLength) return clean;
  const slice = clean.slice(0, maxLength);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > maxLength * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${cut.replace(/[.,;:!?-]+$/, "")}…`;
}

/**
 * Converte quebras de linha em `<br/>`. Usar *depois* de escapeHtml.
 */
export function nl2br(escapedText: string): string {
  return escapedText.replace(/\r?\n/g, "<br/>");
}

/**
 * Pluralização simples pt-BR para textos do tipo "X dia(s)".
 */
export function plural(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
