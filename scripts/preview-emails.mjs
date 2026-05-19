/**
 * Preview generator: renderiza cada email transacional como HTML estatico em
 * previews/ usando buildEmail() do template real (supabase/functions/_shared/email-template.ts).
 *
 * Uso:
 *   node scripts/preview-emails.mjs
 *
 * Abre o arquivo previews/index.html no navegador para ver todos.
 *
 * Fonte: pega o template bundlado pelo esbuild (resolve o import ./validation.ts).
 * Os payloads sao replicas representativas dos que cada edge function chama.
 */

import { build } from "esbuild";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TEMPLATE_SRC = path.join(ROOT, "supabase/functions/_shared/email-template.ts");
const CACHE_DIR = path.join(ROOT, "scripts/.cache");
const CACHE_FILE = path.join(CACHE_DIR, "email-template.mjs");
const OUT_DIR = path.join(ROOT, "previews");

// Stub global Deno para o modulo bundlado nao quebrar ao carregar (sendEmail
// usa Deno.env.get, mas so dentro do corpo da funcao — nunca eh chamada aqui).
globalThis.Deno = globalThis.Deno ?? { env: { get: () => undefined } };

async function bundleTemplate() {
  if (existsSync(CACHE_DIR)) await rm(CACHE_DIR, { recursive: true, force: true });
  await mkdir(CACHE_DIR, { recursive: true });
  await build({
    entryPoints: [TEMPLATE_SRC],
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2020",
    outfile: CACHE_FILE,
    logLevel: "warning",
  });
}

// ─── Sample payloads (uma entry por edge function) ────────────────────────────
//
// Cada entry simula um disparo realista da function correspondente.
// Tente alinhar o conteudo (greeting / body / highlight / button / note /
// warning) com o que index.ts daquela function passa em producao.
const PORTAL = "https://elkys.com.br/portal/cliente";
const ADMIN_PORTAL = "https://elkys.com.br/portal/admin";

const SAMPLES = [
  {
    file: "send-client-welcome",
    label: "Boas-vindas ao cliente (primeiro acesso)",
    description: "Disparo quando admin cria o cliente. Inclui credenciais + bloco institucional + aviso de seguranca.",
    payload: {
      preheader: "Seu acesso ao Portal Elkys esta pronto.",
      title: "Boas-vindas ao Portal Elkys",
      greeting: "Prezado(a) Sr. Joao Silva,",
      body: `
        <p class="text-body" style="margin:0 0 18px 0;font-size:14px;line-height:22px;color:#333333;">E com satisfacao que damos as boas-vindas a <strong>Elkys</strong>. Seu acesso ao <strong>Portal do Cliente</strong> foi criado e ja esta ativo.</p>
        <p class="text-body" style="margin:0 0 18px 0;font-size:14px;line-height:22px;color:#333333;">No portal, o(a) senhor(a) tem acesso centralizado a projetos, documentos, informacoes financeiras e canal de suporte direto com nossa equipe.</p>
        <p class="text-body" style="margin:0 0 18px 0;font-size:14px;line-height:22px;color:#333333;">Utilize as credenciais abaixo no primeiro acesso. <strong>Por seguranca, sera solicitada a alteracao da senha logo apos o login.</strong></p>
      `,
      highlight: {
        title: "Credenciais de acesso",
        rows: [
          { label: "E-mail", value: "joao.silva@empresa.com.br" },
          { label: "Senha temporaria", value: "Bv-2026-tmp" },
        ],
      },
      button: { label: "Acessar o Portal", href: PORTAL },
      showInstitutional: true,
      showSecurityNote: true,
    },
  },
  {
    file: "send-team-welcome",
    label: "Boas-vindas a membro da equipe",
    description: "Admin cadastra novo membro da equipe interna; recebe credenciais para o portal admin.",
    payload: {
      preheader: "Seu acesso ao painel interno da Elkys esta ativo.",
      title: "Boas-vindas a equipe Elkys",
      greeting: "Ola, Marina!",
      body: `
        <p style="margin:0 0 18px 0;font-size:14px;line-height:22px;color:#333333;">E com grande satisfacao que damos as boas-vindas a equipe <strong>Elkys</strong>.</p>
        <p style="margin:0 0 18px 0;font-size:14px;line-height:22px;color:#333333;">Nosso compromisso e com entregas de excelencia, colaboracao entre areas e crescimento continuo. Sua chegada fortalece esse trabalho.</p>
        <p style="margin:0 0 18px 0;font-size:14px;line-height:22px;color:#333333;">Abaixo estao as credenciais de acesso ao painel interno. <strong>Por seguranca, sera solicitada a alteracao da senha no primeiro login.</strong></p>
      `,
      highlight: {
        title: "Credenciais de acesso",
        rows: [
          { label: "E-mail", value: "marina@elkys.com.br" },
          { label: "Senha temporaria", value: "Bv-equipe-2026" },
        ],
      },
      button: { label: "Acessar o painel", href: ADMIN_PORTAL },
      showInstitutional: true,
      showSecurityNote: true,
    },
  },
  {
    file: "send-password-reset",
    label: "Redefinicao de senha",
    description: "Cliente solicita reset; recebe link de recuperacao com warning de seguranca.",
    payload: {
      preheader: "Solicitacao de redefinicao de senha recebida.",
      title: "Redefinicao de senha",
      greeting: "Prezado(a) usuario(a),",
      body: `
        <p class="text-body" style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">Recebemos uma solicitacao de redefinicao de senha para a conta <strong>joao.silva@empresa.com.br</strong> no Portal Elkys.</p>
        <p class="text-body" style="margin:0;font-size:14px;line-height:22px;color:#333333;">Para prosseguir, clique no botao abaixo e defina uma nova senha. O link tem validade limitada e pode ser utilizado uma unica vez.</p>
      `,
      button: { label: "Redefinir senha", href: `${PORTAL}/alterar-senha?token=abc123` },
      warning: "Caso o(a) senhor(a) nao tenha solicitado esta redefinicao, pode ignorar este e-mail com seguranca — a senha permanece inalterada.",
      note: `Caso o botao nao funcione, copie e cole este endereco no navegador: <a href="${PORTAL}/alterar-senha?token=abc123" style="word-break:break-all;">${PORTAL}/alterar-senha?token=abc123</a>`,
      showSecurityNote: true,
    },
  },
  {
    file: "send-proposal-sent",
    label: "Nova proposta comercial enviada",
    description: "Comercial envia proposta para avaliacao do cliente. Inclui resumo (titulo, valor, validade, escopo).",
    payload: {
      preheader: "Proposta comercial disponivel para analise no portal.",
      title: "Nova proposta comercial",
      greeting: "Prezada Sra. Ana Carolina,",
      body: `
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">Uma nova <strong>proposta comercial</strong> foi preparada e encontra-se disponivel no portal para sua analise.</p>
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">A proposta contempla escopo detalhado, condicoes de pagamento e investimento. A aprovacao ou solicitacao de ajustes pode ser realizada diretamente pelo portal.</p>
        <p style="margin:0;font-size:14px;line-height:22px;color:#333333;">Permanecemos a disposicao para esclarecimentos.</p>
      `,
      highlight: {
        title: "Resumo da proposta",
        rows: [
          { label: "Proposta", value: "Plataforma de Gestao - V2" },
          { label: "Valor", value: "R$ 48.500,00" },
          { label: "Valida ate", value: "30 de junho de 2026" },
          { label: "Escopo", value: "Modulo financeiro, dashboard executivo, integracao Asaas e onboarding de 5 usuarios." },
        ],
      },
      button: { label: "Analisar proposta", href: `${PORTAL}/propostas` },
      note: "A aprovacao ou solicitacao de ajustes pode ser realizada pelo portal a qualquer momento.",
    },
  },
  {
    file: "send-proposal-expiry-warning",
    label: "Proposta perto de expirar",
    description: "Cron de aviso quando proposta esta a poucos dias da validade.",
    payload: {
      preheader: 'A proposta "Plataforma de Gestao - V2" perde validade em 3 dias.',
      title: "Proposta prestes a expirar",
      greeting: "Prezada Sra. Ana Carolina,",
      body: `
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">A proposta <strong>Plataforma de Gestao - V2</strong> permanece aguardando avaliacao e sua validade expira em <strong>3 dias</strong>.</p>
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">Apos o vencimento, a proposta perde validade automaticamente e uma nova negociacao se faz necessaria. Caso o interesse permaneca, solicitamos sua resposta pelo portal.</p>
        <p style="margin:0;font-size:14px;line-height:22px;color:#333333;">Permanecemos a disposicao para esclarecimentos.</p>
      `,
      highlight: {
        title: "Resumo da proposta",
        rows: [
          { label: "Proposta", value: "Plataforma de Gestao - V2" },
          { label: "Valor", value: "R$ 48.500,00" },
          { label: "Valida ate", value: "18 de maio de 2026" },
        ],
      },
      button: { label: "Analisar proposta", href: `${PORTAL}/propostas/abc-123` },
    },
  },
  {
    file: "send-contract-validation",
    label: "Contrato para validacao",
    description: "Juridico envia contrato finalizado para aceite do cliente.",
    payload: {
      preheader: 'Contrato do projeto "Portal Cliente PJ" aguardando sua validacao.',
      title: "Contrato para validacao",
      greeting: "Prezado(a) Sr. Joao Silva,",
      body: `
        <p style="margin:0 0 18px 0;font-size:14px;line-height:22px;color:#333333;">O contrato referente ao projeto <strong>Portal Cliente PJ</strong> foi finalizado pela nossa equipe juridica e encontra-se disponivel para analise e validacao.</p>
        <p style="margin:0 0 18px 0;font-size:14px;line-height:22px;color:#333333;">Resumo do escopo: desenvolvimento de plataforma de gestao com modulo financeiro, integracao Asaas, dashboard executivo e onboarding de ate 10 usuarios.</p>
        <p style="margin:0 0 18px 0;font-size:14px;line-height:22px;color:#333333;">Solicitamos a revisao dos termos e a confirmacao de aceite diretamente pelo portal.</p>
      `,
      button: { label: "Revisar contrato", href: `${PORTAL}/contratos` },
      note: "Em caso de duvidas sobre qualquer clausula, solicitamos contato previo ao aceite.",
    },
  },
  {
    file: "send-project-created",
    label: "Novo projeto registrado",
    description: "Notifica o cliente que um novo projeto foi vinculado a sua conta.",
    payload: {
      preheader: 'O projeto "Portal Cliente PJ" foi vinculado a sua conta.',
      title: "Novo projeto registrado",
      greeting: "Prezado(a) Sr. Joao Silva,",
      body: `
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">Informamos que um novo projeto foi registrado e vinculado a sua conta no <strong>Portal Elkys</strong>.</p>
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">A partir deste momento, o(a) senhor(a) pode acompanhar o andamento, etapas, documentos e informacoes financeiras diretamente pelo portal, com atualizacoes em tempo real.</p>
        <p style="margin:0;font-size:14px;line-height:22px;color:#333333;">Os detalhes iniciais estao relacionados abaixo.</p>
      `,
      highlight: {
        title: "Detalhes do projeto",
        rows: [
          { label: "Projeto", value: "Portal Cliente PJ" },
          { label: "Tipo", value: "Plataforma SaaS" },
          { label: "Etapa inicial", value: "Descoberta & escopo" },
        ],
      },
      button: { label: "Acessar o projeto", href: `${PORTAL}/projetos` },
      note: "Para duvidas sobre o projeto, a equipe permanece a disposicao pelo suporte do portal.",
    },
  },
  {
    file: "send-project-stage-changed",
    label: "Mudanca de etapa do projeto",
    description: "Cliente recebe aviso quando a etapa avanca (ou status muda).",
    payload: {
      preheader: 'O projeto "Portal Cliente PJ" avancou para a etapa "Desenvolvimento".',
      title: "Atualizacao de etapa",
      greeting: "Prezado(a) Sr. Joao Silva,",
      body: `
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">Informamos que o projeto <strong>Portal Cliente PJ</strong> avancou para uma nova etapa.</p>
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">O progresso completo, documentos e proximos passos estao disponiveis no portal para consulta.</p>
        <p style="margin:0;font-size:14px;line-height:22px;color:#333333;">Atualizacao da equipe: <em>finalizamos a revisao do design e iniciamos a implementacao do modulo financeiro.</em></p>
      `,
      highlight: {
        title: "Detalhes da atualizacao",
        rows: [
          { label: "Projeto", value: "Portal Cliente PJ" },
          { label: "Etapa anterior", value: "Design & UX" },
          { label: "Nova etapa", value: "Desenvolvimento" },
        ],
      },
      button: { label: "Acompanhar o projeto", href: `${PORTAL}/projetos/abc-123` },
      note: "Para duvidas, a equipe permanece a disposicao pelo suporte do portal.",
    },
  },
  {
    file: "send-project-completed",
    label: "Entrega concluida",
    description: "Projeto entregue. Inclui bloco de avaliacao (review) se REVIEW_URL configurado.",
    payload: {
      preheader: 'O projeto "Portal Cliente PJ" foi entregue e esta concluido.',
      title: "Entrega concluida",
      greeting: "Prezado(a) Sr. Joao Silva,",
      body: `
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">E com satisfacao que informamos a conclusao e entrega do projeto <strong>Portal Cliente PJ</strong>.</p>
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">Todos os detalhes, documentos e historico permanecem disponiveis no portal para consulta a qualquer momento.</p>
        <p style="margin:0 0 18px;font-size:14px;line-height:22px;color:#333333;">Agradecemos a confianca depositada em nosso trabalho e permanecemos a disposicao para os proximos passos.</p>
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0"
          style="margin:0 0 18px 0;border:1px solid #e5e7eb;border-left:3px solid #148f8f;">
          <tr>
            <td style="padding:14px 16px;">
              <p style="margin:0 0 6px 0;font-size:14px;font-weight:700;color:#111111;">Sua opiniao vale muito</p>
              <p style="margin:0 0 10px 0;font-size:13px;color:#555555;line-height:20px;">
                Se a entrega atendeu as suas expectativas, agradecemos se puder compartilhar
                uma avaliacao publica. Isso ajuda outros clientes a nos conhecerem.
              </p>
              <a href="https://g.page/elkys/review" target="_blank"
                style="display:inline-block;background-color:#148f8f;color:#ffffff;font-size:13px;font-weight:700;padding:10px 20px;text-decoration:none;">
                Deixar avaliacao
              </a>
            </td>
          </tr>
        </table>
      `,
      highlight: {
        title: "Resumo da entrega",
        rows: [
          { label: "Projeto", value: "Portal Cliente PJ" },
          { label: "Data de entrega", value: "15 de maio de 2026" },
          { label: "Status", value: "Concluido" },
        ],
      },
      button: { label: "Acessar o projeto", href: `${PORTAL}/projetos` },
      note: "Para ajustes ou suporte pos-entrega, a equipe permanece a disposicao pelo portal.",
    },
  },
  {
    file: "send-document-added",
    label: "Novo documento disponivel",
    description: "Admin anexa documento (contrato, NF, codigo-fonte, etc) ao cliente.",
    payload: {
      preheader: "Contrato: Contrato Portal Cliente PJ v2 — disponivel no portal.",
      title: "Novo documento disponivel",
      greeting: "Prezado(a) Sr. Joao Silva,",
      body: `
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">Um novo documento foi disponibilizado em sua area do <strong>Portal Elkys</strong>.</p>
        <p style="margin:0;font-size:14px;line-height:22px;color:#333333;">O arquivo esta disponivel para visualizacao e download a qualquer momento, de forma segura.</p>
      `,
      highlight: {
        title: "Detalhes do documento",
        rows: [
          { label: "Tipo", value: "Contrato" },
          { label: "Nome", value: "Contrato Portal Cliente PJ v2" },
        ],
      },
      button: { label: "Abrir documento", href: `${PORTAL}/documentos/xyz-456` },
      note: "Para duvidas sobre o documento, a equipe permanece a disposicao pelo portal.",
    },
  },
  {
    file: "send-invoice-due",
    label: "Lembrete de vencimento (cron)",
    description: "Aviso 3 dias antes do vencimento. Quando cliente inadimplente, vira warning em vez de lembrete.",
    payload: {
      preheader: "Sua fatura de R$ 4.850,00 vence em 3 dias.",
      title: "Lembrete de vencimento",
      greeting: "Prezado(a) Sr. Joao Silva,",
      body: `
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">Enviamos este lembrete referente a sua fatura com vencimento em <strong>18 de maio de 2026</strong> (3 dias).</p>
        <p style="margin:0;font-size:14px;line-height:22px;color:#333333;">Manter o pagamento em dia garante a continuidade dos servicos sem interrupcao.</p>
      `,
      highlight: {
        title: "Resumo da cobranca",
        rows: [
          { label: "Mensalidade SaaS - Maio/2026", value: "R$ 4.850,00" },
          { label: "Total", value: "R$ 4.850,00" },
          { label: "Vencimento", value: "18 de maio de 2026" },
          { label: "Status", value: "Ativo" },
        ],
      },
      button: { label: "Acessar o portal", href: `${PORTAL}/financeiro` },
      note: `Duvidas sobre cobrancas: atendimento pelo portal ou WhatsApp <a href="https://wa.me/553199738235" style="color:#472680;">wa.me/553199738235</a>.`,
    },
  },
  {
    file: "send-charge-overdue",
    label: "Pendencia financeira (atraso)",
    description: "Cliente com cobranca em atraso. Inclui detalhes e link para o financeiro.",
    payload: {
      preheader: "Identificamos uma pendencia financeira vencida ha 7 dias.",
      title: "Pendencia financeira",
      greeting: "Prezado(a) Sr. Joao Silva,",
      body: `
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">Identificamos que a cobranca abaixo encontra-se vencida ha <strong>7 dias</strong>.</p>
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">Solicitamos a gentileza de regularizar a pendencia o quanto antes para que os servicos em andamento nao sofram interrupcao.</p>
        <p style="margin:0;font-size:14px;line-height:22px;color:#333333;">Caso o pagamento ja tenha sido realizado, favor desconsiderar este aviso. Para duvidas ou negociacao, a equipe financeira permanece a disposicao.</p>
      `,
      highlight: {
        title: "Detalhes da cobranca",
        rows: [
          { label: "Descricao", value: "Mensalidade SaaS - Abril/2026" },
          { label: "Valor", value: "R$ 4.850,00" },
          { label: "Vencimento", value: "08 de maio de 2026" },
          { label: "Atraso", value: "7 dias" },
        ],
      },
      button: { label: "Acessar o financeiro", href: `${PORTAL}/financeiro` },
      note: `Preferir tratar por WhatsApp? Fale diretamente com o financeiro: <a href="https://wa.me/553199738235" style="color:#472680;">wa.me/553199738235</a>`,
    },
  },
  {
    file: "send-installment-paid",
    label: "Confirmacao de pagamento de parcela",
    description: "Cliente paga uma parcela de projeto; recebe comprovante.",
    payload: {
      preheader: "Confirmamos o recebimento da parcela de entrada no valor de R$ 14.550,00.",
      title: "Pagamento confirmado",
      greeting: "Prezado(a) Sr. Joao Silva,",
      body: `
        <p style="margin:0 0 14px;font-size:14px;line-height:22px;color:#333333;">Confirmamos o recebimento do pagamento referente a parcela de <strong>entrada</strong> do projeto <strong>Portal Cliente PJ</strong>.</p>
        <p style="margin:0 0 14px;font-size:14px;line-height:22px;color:#333333;">O registro foi processado e sua conta encontra-se em situacao regular. Agradecemos pela pontualidade e pela confianca depositada em nosso trabalho.</p>
        <p style="margin:0 0 22px;font-size:14px;line-height:22px;color:#333333;">Para duvidas sobre este ou outros pagamentos, a equipe financeira permanece a disposicao pelo portal.</p>
      `,
      highlight: {
        title: "Detalhes do pagamento",
        rows: [
          { label: "Projeto", value: "Portal Cliente PJ" },
          { label: "Cliente", value: "Empresa Silva LTDA" },
          { label: "Parcela", value: "Entrada (30%)" },
          { label: "Valor", value: "R$ 14.550,00" },
          { label: "Vencimento original", value: "10 de maio de 2026" },
          { label: "Confirmacao", value: "15 de maio de 2026" },
          { label: "Situacao", value: "Pago" },
        ],
      },
      button: { label: "Acessar o projeto", href: `${PORTAL}/projetos/abc-123` },
      note: "Este e-mail serve como comprovante de registro do pagamento.",
    },
  },
  {
    file: "send-inadimplencia-warning",
    label: "Aviso de inadimplencia",
    description: "Cliente acabou de entrar em inadimplencia. Apenas botao + texto cordial.",
    payload: {
      preheader: "Aviso sobre o status do seu contrato.",
      title: "Aviso importante sobre seu contrato",
      greeting: "Bom dia, Empresa Silva LTDA.",
      body: `
        <p style="margin:0 0 18px;font-size:14px;line-height:22px;color:#333333;">Identificamos a existencia de pendencias financeiras em sua conta, o que ocasionou a alteracao do status do seu contrato.</p>
        <p style="margin:0 0 18px;font-size:14px;line-height:22px;color:#333333;">Para regularizar a situacao, orientamos que acesse o portal e verifique os debitos em aberto. A regularizacao e importante para evitar a aplicacao de medidas administrativas e eventuais restricoes na continuidade dos servicos.</p>
        <p style="margin:0 0 18px;font-size:14px;line-height:22px;color:#333333;">Caso o pagamento ja tenha sido realizado, pedimos a gentileza de desconsiderar esta mensagem. Se houver necessidade de negociacao ou esclarecimentos, nosso time financeiro esta disponivel para atendimento diretamente pelo portal.</p>
        <p style="margin:0;font-size:14px;line-height:22px;color:#333333;">Permanecemos a disposicao para qualquer suporte necessario.</p>
      `,
      button: { label: "Acessar financeiro -->", href: `${PORTAL}/financeiro` },
    },
  },
  {
    file: "send-client-action-required",
    label: "Acao do cliente necessaria",
    description: "Equipe pede acao especifica do cliente (validacao, envio de material, aprovacao).",
    payload: {
      preheader: "Acao necessaria — Validar wireframes (projeto Portal Cliente PJ).",
      title: "Acao necessaria no portal",
      greeting: "Prezado(a) Sr. Joao Silva,",
      body: `
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">A etapa atual do projeto <strong>Portal Cliente PJ</strong> aguarda sua validacao para prosseguirmos.</p>
        <p style="margin:0 0 18px;font-size:14px;line-height:22px;color:#333333;">Os wireframes da area logada estao disponiveis no portal para revisao e aprovacao.</p>
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;"><strong>Prazo sugerido:</strong> 20 de maio de 2026</p>
      `,
      highlight: {
        title: "Detalhes da solicitacao",
        rows: [
          { label: "Projeto", value: "Portal Cliente PJ" },
          { label: "Etapa", value: "Validar wireframes" },
          { label: "Prazo", value: "20 de maio de 2026" },
        ],
      },
      button: { label: "Abrir validacao", href: `${PORTAL}/projetos/abc-123/validacao` },
      note: "Aprovacoes podem ser feitas em poucos cliques pelo portal.",
    },
  },
  {
    file: "send-ticket-opened",
    label: "Ticket de suporte aberto (interna)",
    description: "Email recebido pela equipe interna quando cliente abre um novo ticket.",
    payload: {
      preheader: 'Ticket aberto por Empresa Silva LTDA: "Erro ao gerar relatorio".',
      title: "Novo ticket de suporte",
      greeting: "Bom dia,",
      body: `
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">O cliente <strong>Empresa Silva LTDA</strong> abriu um novo ticket de suporte. Solicitamos atendimento assim que possivel.</p>
      `,
      highlight: {
        title: "Detalhes da solicitacao",
        rows: [
          { label: "Cliente", value: "Empresa Silva LTDA" },
          { label: "E-mail", value: "joao.silva@empresa.com.br" },
          { label: "Assunto", value: "Erro ao gerar relatorio financeiro" },
        ],
      },
      button: { label: "Acessar o ticket", href: `${ADMIN_PORTAL}/suporte` },
      note: `<strong>Mensagem do cliente:</strong><br/><em style="color:#52525b;">"Ao tentar exportar o relatorio do mes de abril em PDF, recebo erro 500. Ja tentei em dois navegadores diferentes."</em>`,
    },
  },
  {
    file: "send-ticket-updated--em-andamento",
    label: "Ticket em analise (cliente)",
    description: "Cliente recebe aviso que seu ticket foi colocado em analise.",
    payload: {
      preheader: 'Seu ticket esta em analise — "Erro ao gerar relatorio".',
      title: "Seu ticket esta em analise",
      greeting: "Prezado(a) Sr. Joao Silva,",
      body: `<p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">Informamos que sua solicitacao de suporte foi recebida e encontra-se em analise pela equipe Elkys. O retorno sera enviado em breve.</p>`,
      highlight: {
        title: "Sua solicitacao",
        rows: [{ label: "Assunto", value: "Erro ao gerar relatorio financeiro" }],
      },
      button: { label: "Acessar o ticket", href: `${PORTAL}/suporte` },
    },
  },
  {
    file: "send-ticket-updated--resolvido",
    label: "Ticket resolvido + feedback (cliente)",
    description: "Cliente recebe aviso de resolucao com bloco de feedback (sim/nao).",
    payload: {
      preheader: 'Seu ticket foi resolvido — "Erro ao gerar relatorio".',
      title: "Seu ticket foi resolvido",
      greeting: "Prezado(a) Sr. Joao Silva,",
      body: `
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">Sua solicitacao de suporte foi concluida e marcada como <strong>resolvida</strong>.</p>
        <p style="margin:0 0 18px;font-size:14px;line-height:22px;color:#333333;">Caso o problema persista ou surja uma nova duvida, um novo ticket pode ser aberto a qualquer momento pelo portal.</p>

        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0"
          style="margin:0 0 18px 0;border:1px solid #e5e7eb;border-left:3px solid #148f8f;">
          <tr>
            <td style="padding:14px 16px;">
              <p style="margin:0 0 10px 0;font-size:14px;font-weight:700;color:#111111;">Esta resposta resolveu sua solicitacao?</p>
              <p style="margin:0 0 12px 0;font-size:13px;color:#555555;line-height:20px;">
                Seu retorno e importante para aprimorarmos continuamente o atendimento.
              </p>
              <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding-right:8px;">
                    <a href="mailto:contato@elkys.com.br?subject=Sim%20resolveu" target="_blank"
                      style="display:inline-block;background-color:#148f8f;color:#ffffff;font-size:13px;font-weight:700;padding:10px 18px;text-decoration:none;">
                      Sim, resolveu
                    </a>
                  </td>
                  <td>
                    <a href="mailto:contato@elkys.com.br?subject=Ainda%20nao" target="_blank"
                      style="display:inline-block;background-color:#ffffff;color:#148f8f;border:1px solid #148f8f;font-size:13px;font-weight:700;padding:9px 18px;text-decoration:none;">
                      Ainda nao
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      `,
      highlight: {
        title: "Sua solicitacao",
        rows: [{ label: "Assunto", value: "Erro ao gerar relatorio financeiro" }],
      },
      button: { label: "Acessar o ticket", href: `${PORTAL}/suporte` },
    },
  },
  {
    file: "send-ticket-updated--reply",
    label: "Resposta no ticket (cliente)",
    description: "Cliente recebe aviso de nova resposta no ticket, com preview da resposta no note.",
    payload: {
      preheader: 'Nova resposta no seu ticket — "Erro ao gerar relatorio".',
      title: "Nova resposta no seu ticket",
      greeting: "Prezado(a) Sr. Joao Silva,",
      body: `<p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#333333;">A equipe Elkys registrou uma resposta ao seu ticket. A resposta completa esta disponivel no portal para continuidade do atendimento.</p>`,
      highlight: {
        title: "Sua solicitacao",
        rows: [{ label: "Assunto", value: "Erro ao gerar relatorio financeiro" }],
      },
      button: { label: "Acessar o ticket", href: `${PORTAL}/suporte` },
      note: `<strong>Resposta da equipe:</strong><br/><em style="color:#52525b;">"Identificamos a causa do erro e ja aplicamos a correcao em producao. Pedimos que tente exportar novamente o relatorio. Caso persista, nos avise."</em>`,
    },
  },
  {
    file: "process-billing-rules",
    label: "Regra de cobranca (template configuravel)",
    description: "Email enviado por regra de billing (template configurado no admin). Conteudo dinamico.",
    payload: {
      preheader: "Aviso financeiro — fatura em aberto",
      title: "Elkys - Aviso Financeiro",
      greeting: "Bom dia, Empresa Silva LTDA",
      body: `<p style="margin:0 0 18px 0;font-size:14px;line-height:22px;color:#333333;">Identificamos que a sua fatura referente ao mes de <strong>maio/2026</strong> esta em aberto.<br/>Valor: <strong>R$ 4.850,00</strong>.<br/>Acesse o portal para regularizar.</p>`,
      button: { label: "Acessar portal", href: `${PORTAL}/financeiro` },
    },
  },
  {
    file: "notification-sender",
    label: "Notificacao generica (notification-sender)",
    description: "Sender compartilhado usado pelas funcoes de notificacao no portal.",
    payload: {
      preheader: "Notificacao do Portal: Atualizacao no projeto",
      title: "Notificacao do Portal",
      greeting: "Prezado(a) Sr. Joao Silva,",
      body: `
        <p style="margin:0 0 18px 0;font-size:14px;line-height:22px;color:#333333;">
          A etapa de <strong>Design & UX</strong> foi concluida no projeto. Os arquivos finais estao disponiveis em <a href="${PORTAL}/documentos" target="_blank" style="color:#472680;font-weight:700;text-decoration:underline;text-underline-offset:2px;">Documentos</a> e a equipe ja iniciou a proxima fase.
        </p>
      `,
      button: { label: "Acessar o portal", href: PORTAL },
    },
  },
];

function htmlIndex(entries) {
  const items = entries
    .map(
      (e) => `
        <li>
          <a href="./${e.file}.html">${e.label}</a>
          <code>${e.file}</code>
          <p>${e.description}</p>
        </li>`
    )
    .join("");
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Previews de email — Elkys</title>
  <style>
    body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; max-width: 760px; margin: 40px auto; padding: 0 20px; color: #1f2937; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    .meta { color: #6b7280; font-size: 13px; margin-bottom: 24px; }
    ul { list-style: none; padding: 0; }
    li { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; margin-bottom: 10px; }
    li a { color: #472680; font-weight: 600; text-decoration: none; font-size: 15px; }
    li a:hover { text-decoration: underline; }
    li code { background: #f3f4f6; color: #4b5563; padding: 2px 6px; border-radius: 4px; font-size: 12px; margin-left: 8px; }
    li p { margin: 6px 0 0; font-size: 13px; color: #4b5563; line-height: 1.45; }
  </style>
</head>
<body>
  <h1>Previews de email transacional</h1>
  <p class="meta">Gerado em ${new Date().toLocaleString("pt-BR")} — total: ${entries.length}</p>
  <ul>${items}</ul>
</body>
</html>`;
}

async function main() {
  console.log("[preview-emails] bundling email-template.ts...");
  await bundleTemplate();

  const mod = await import(pathToFileURL(CACHE_FILE).href);
  const { buildEmail } = mod;
  if (typeof buildEmail !== "function") {
    throw new Error("buildEmail nao foi exportado pelo template bundlado.");
  }

  if (existsSync(OUT_DIR)) await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  for (const sample of SAMPLES) {
    const html = buildEmail(sample.payload);
    const out = path.join(OUT_DIR, `${sample.file}.html`);
    await writeFile(out, html, "utf8");
    console.log(`  -> ${path.relative(ROOT, out)}`);
  }

  const indexHtml = htmlIndex(SAMPLES);
  await writeFile(path.join(OUT_DIR, "index.html"), indexHtml, "utf8");
  console.log(`[preview-emails] ok — abra previews/index.html no navegador.`);
}

main().catch((err) => {
  console.error("[preview-emails] FAIL:", err);
  process.exit(1);
});
