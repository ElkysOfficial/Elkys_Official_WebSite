# Sistema de Atalhos de Teclado Elkys

> Estudo de benchmark e definição do esquema de atalhos do portal Elkys.
> Objetivo: atalhos fáceis para um público misto, incluindo muitas pessoas
> não ligadas a tecnologia.
>
> Data: 2026-05-21. Implementado no portal admin (`AdminLayout.tsx`).

---

## 1. Contexto e o problema real

O portal Elkys é usado por gente de perfis muito diferentes: sócios,
desenvolvedores, designers, comercial, financeiro, jurídico, suporte. Boa parte
desse público **não tem familiaridade com convenções de ferramentas de
desenvolvedor**. Um atalho só é bom se a pessoa comum descobre, entende e usa
sem treinamento.

A primeira tentativa usou a sequência `g` seguida de uma tecla (padrão do
GitHub e do Gmail para "go to"). Funciona, mas tem dois defeitos para este
público: a letra `g` não diz nada em português, e a ideia de "apertar uma tecla
e depois outra" não é intuitiva para quem nunca viu isso.

A contraproposta natural foi `Ctrl + letra`. Essa é pior. Os atalhos que **todo
mundo** já conhece são os do próprio navegador, e eles ocupam justamente as
letras úteis:

| Atalho              | O que o navegador faz         |
| ------------------- | ----------------------------- |
| `Ctrl+P`            | Imprimir                      |
| `Ctrl+F`            | Buscar na página              |
| `Ctrl+S`            | Salvar                        |
| `Ctrl+T`            | Nova aba                      |
| `Ctrl+W`            | Fechar aba                    |
| `Ctrl+E`            | Barra de busca                |
| `Ctrl+C` / `Ctrl+V` | Copiar / colar                |
| `Ctrl+L` / `Ctrl+D` | Barra de endereço / favoritar |

Sequestrar `Ctrl+P` ou `Ctrl+F` quebraria exatamente a convenção universal que
queremos respeitar. Conclusão dura: **em um app que roda no navegador, não
existe um conjunto de `Ctrl + letra` que seja ao mesmo tempo universal e livre
de conflito.** Por isso este estudo.

---

## 2. Como as empresas de referência fazem

Levantamento de produtos com esquemas de atalho maduros, separados por perfil
de público.

| Empresa                | Público                       | Padrão de navegação                                      | Ajuda `?` | Observação relevante                                                     |
| ---------------------- | ----------------------------- | -------------------------------------------------------- | --------- | ------------------------------------------------------------------------ |
| **Gmail**              | Massivo, não técnico          | `g` + tecla                                              | Sim       | Atalhos vêm **desligados** por padrão; o usuário ativa nas configurações |
| **YouTube**            | Massivo, qualquer pessoa      | Teclas simples (sem modificador)                         | Sim       | Prova que tecla pura é aprendível por qualquer público                   |
| **Trello**             | Amplo, casual                 | Teclas simples                                           | Sim       | Atalhos de ação rápida, sem modificador                                  |
| **Slack**              | Amplo, escritório             | `Ctrl/Cmd+K` (troca rápida)                              | `Ctrl+/`  | `Ctrl/Cmd+[` e `]` para voltar e avançar                                 |
| **Jira / Atlassian**   | Enterprise, muito não técnico | `g` + tecla                                              | Sim       | Milhares de gestores e usuários de negócio usam `g`+tecla                |
| **Asana**              | Negócio, amplo                | `Tab` + letra                                            | Sim       | Combinação incomum, exige aprendizado                                    |
| **Notion**             | Amplo                         | `Ctrl/Cmd+K`, `Ctrl/Cmd+P`                               | Sim       | `Ctrl+[` e `]` navegam histórico                                         |
| **Linear**             | Times de software             | `Ctrl/Cmd+K` + `g`+tecla                                 | Sim       | Teclado em primeiro lugar, público técnico                               |
| **Superhuman**         | Executivos, power users       | Teclas simples + paleta                                  | Sim       | Velocidade extrema, público treinado                                     |
| **GitHub**             | Desenvolvedores               | `Ctrl/Cmd+K` + `g`+tecla                                 | Sim       | Paleta de comando recente substituindo menus                             |
| **Vercel / Stripe**    | Técnico + negócio             | `Ctrl/Cmd+K`                                             | Sim       | Paleta como porta de entrada única                                       |
| **Google Docs/Sheets** | Massivo, não técnico          | `Ctrl + letra` (sobrepõe o navegador)                    | `Ctrl+/`  | Funciona porque o contexto é edição de documento                         |
| **Windows (SO)**       | Universal                     | `Alt` + letra (menus), `Win` + número (barra de tarefas) | n/a       | A herança cultural do nosso público no desktop                           |

### Leituras importantes deste levantamento

1. **A paleta de comando (`Ctrl/Cmd+K`) é praticamente unânime.** Slack,
   Notion, Linear, GitHub, Vercel, Stripe, todos a adotaram. Ela venceu porque
   é busca, não memorização: o usuário digita o que quer. É o atalho mais
   universal e mais amigável para o público não técnico.

2. **A ajuda com `?` é quase tão unânime quanto.** Gmail, YouTube, Slack, Jira,
   Notion, Linear, GitHub. Apertar `?` mostra a lista de atalhos. É o mecanismo
   que torna o sistema **autoexplicativo**, e por isso é decisivo para quem não
   é técnico: a pessoa não precisa decorar nada, ela consulta.

3. **A sequência `g` + tecla não é exclusiva de ferramenta de dev.** Jira e
   Gmail provam que público não técnico consegue usá-la. O problema dela para a
   Elkys não é viabilidade, é que a letra `g` é opaca em português e o conceito
   de sequência soa estranho para quem nunca viu.

4. **Tecla pura (sem modificador) funciona em escala massiva** (YouTube, Gmail,
   Trello), mas costuma ser usada para **ações dentro de uma tela**, não para
   trocar a tela inteira. Trocar de página com uma tecla solta surpreende e
   gera navegação acidental.

5. **`Ctrl + letra` só funciona quando o contexto justifica sobrepor o
   navegador** (Google Docs, num documento, onde `Ctrl+B` = negrito é
   esperado). Para navegação geral, sobrepor o navegador é hostil.

6. **`Alt` é a herança de desktop do nosso público.** Usuários de Windows
   convivem há décadas com `Alt` + letra sublinhada nos menus e com `Win` +
   número na barra de tarefas. "Modificador + número para saltar para o N-ésimo
   item" é um gesto que essas pessoas já fazem sem pensar.

---

## 3. Os padrões destilados

Do benchmark saem seis padrões possíveis:

| Padrão               | Exemplo        | Força                                   | Fraqueza                                  |
| -------------------- | -------------- | --------------------------------------- | ----------------------------------------- |
| Paleta de comando    | `Ctrl+K`       | Universal, zero memorização             | Um passo a mais que um atalho direto      |
| Ajuda `?`            | `?` abre lista | Torna tudo autoexplicativo              | Sozinho não acelera nada                  |
| Sequência leader     | `g` depois `p` | Zero conflito (1ª tecla é morta)        | Conceito estranho ao leigo                |
| Tecla pura           | `p`            | Mais simples possível                   | Surpreende em navegação de página         |
| Modificador + letra  | `Alt+P`        | Direto                                  | Colisão de letras em PT, conflito de menu |
| Modificador + número | `Alt+1`        | Direto, sem colisão, livre no navegador | Exige saber o número de cada área         |

---

## 4. Avaliação para o contexto Elkys

Critérios: (a) livre de conflito com o navegador, (b) fácil para o público não
técnico, (c) regra simples de explicar em uma frase, (d) descobrível.

- **`Ctrl + letra`**: reprovado em (a). Colide com imprimir, buscar, salvar.
- **Sequência leader**: passa em (a). A fraqueza em (b) e (c) é separável da
  ideia: vinha de a tecla líder ser opaca (`g` não diz nada) e de não haver
  retorno visual. Com uma líder com significado e um indicador na tela, o
  padrão passa também em (b), (c) e (d).
- **Tecla pura para navegar**: passa em (a) e (c), fraco em (b): trocar a tela
  inteira sem querer é desconcertante para quem não é técnico.
- **`Alt + letra`**: bom em (c), mas reprovado na prática. Em português as
  áreas colidem na inicial: **C**RM, **C**lientes, **C**ontratos,
  **C**alendário, **C**omunicações. E `Alt+E` / `Alt+F` abrem o menu do
  Chrome. Vira um quebra-cabeça de exceções.
- **`Alt + número`**: passa em tudo.
  - (a) Livre: o navegador usa `Ctrl + número` para abas, não `Alt + número`.
    `Alt + número` chega limpo ao aplicativo.
  - (b) Fácil: nenhum conceito novo. É o mesmo gesto do `Win + número` da barra
    de tarefas do Windows, que o público já conhece.
  - (c) Regra de uma frase: "Segure `Alt` e aperte o número da área na barra
    lateral."
  - (d) Descobrível: o número pode ser **mostrado na própria barra lateral**,
    ao lado de cada item. O usuário vê o atalho toda vez que olha o menu.
  - Bônus: número não tem o problema de colisão de inicial que a letra tem em
    português.

### Decisão

Dois finalistas: `Alt + número`, mais limpo de conflito, e a sequência leader,
mais memorável quando a tecla líder tem significado. A escolha foi pela
**sequência leader com a tecla `E`, de Elkys**. Razão: dá identidade ao
produto, a letra de destino é mnemônica (`E` depois `V` de Visão, `P` de
Projetos), e as duas fraquezas históricas do padrão ficam neutralizadas:

- A líder deixa de ser opaca: `E` é a inicial da empresa, fácil de lembrar.
- A sequência deixa de ser confusa: ao apertar `E`, um indicador aparece na
  tela e diz "aperte a letra da área", então a pessoa sempre sabe o estado.

O custo aceito: como em português várias áreas começam com a mesma letra (CRM,
Clientes, Contratos, Calendário, Comunicações), as letras de destino são
**curadas**, e algumas não são a inicial. O painel `?` e a dica na barra
lateral cobrem isso, então ninguém precisa decorar.

---

## 5. Decisão: o Sistema de Atalhos Elkys

Um sistema de **três camadas**, em divulgação progressiva: cada camada serve um
nível de usuário, e ninguém precisa subir de camada para ser produtivo.

```
  +-----------------------------------------------------------+
  |  CAMADA 1 - A BUSCA            Ctrl+K  (ou  /  )           |
  |  Para todos. Abre a paleta, digita o destino, Enter.      |
  |  Zero memorizacao. E a convencao universal (Slack,        |
  |  Notion, Linear). Cobre 100% da navegacao sozinha.        |
  +-----------------------------------------------------------+
  |  CAMADA 2 - A AJUDA           ?                           |
  |  Para quem quer aprender. Abre a lista completa de        |
  |  atalhos, gerada a partir da barra lateral do usuario.    |
  |  Torna o sistema autoexplicativo. Ninguem decora nada.    |
  +-----------------------------------------------------------+
  |  CAMADA 3 - O SALTO           E  +  letra                 |
  |  Para quem quer velocidade. Aperte E (de Elkys), depois   |
  |  a letra da area. Ex.: E depois V vai para Visao Geral.   |
  |  Regra unica: "E, depois a letra da area".                |
  +-----------------------------------------------------------+
```

Por que três camadas e não um atalho só: o público é heterogêneo. O sócio que
entra uma vez por semana usa só a Camada 1. O analista que vive no portal
naturalmente migra para a Camada 3. A Camada 2 é a ponte entre as duas, e
garante que ninguém fica preso por falta de informação.

### Princípios de projeto

- **Uma regra, uma frase.** A Camada 3 inteira se explica com "aperte `E`,
  depois a letra da área".
- **A líder tem significado.** `E` é de Elkys. Ao pressioná-la, um indicador na
  tela confirma que o atalho está armado e diz o que fazer em seguida.
- **A letra de destino é mnemônica quando dá.** `V` Visão, `P` Projetos, `F`
  Financeiro, `T` Tarefas. As áreas que colidem na inicial recebem letra
  curada, sempre visível no painel `?` e na barra lateral.
- **Atalhos sem modificador só agem fora de campos de texto.** Digitar nunca
  dispara atalho.
- **Nada é exclusivo do teclado.** Todo destino continua acessível por clique.
  O atalho acelera, nunca é a única porta.

---

## 6. Mapa completo de atalhos

| Tecla              | Ação                                             | Camada |
| ------------------ | ------------------------------------------------ | ------ |
| `Ctrl+K` / `Cmd+K` | Abrir a busca universal                          | 1      |
| `/`                | Abrir a busca universal (alternativa)            | 1      |
| `?`                | Abrir / fechar a ajuda de atalhos                | 2      |
| `E` depois `letra` | Ir para a área correspondente                    | 3      |
| `[`                | Recolher / expandir a barra lateral              | extra  |
| `Esc`              | Fechar janelas e menus; cancelar a sequência `E` | extra  |
| `↑` `↓` `Enter`    | Navegar e abrir resultados dentro da busca       | extra  |

Mapa da Camada 3. A barra lateral é filtrada por papel, então cada pessoa vê
apenas o subconjunto de áreas a que tem acesso:

| Atalho  | Área              | Origem da letra          |
| ------- | ----------------- | ------------------------ |
| `E` `V` | Visão Geral       | inicial                  |
| `E` `C` | CRM               | inicial                  |
| `E` `F` | Financeiro        | inicial                  |
| `E` `L` | Clientes          | cLientes (C ocupado)     |
| `E` `R` | Régua de cobrança | inicial                  |
| `E` `O` | Contratos         | cOntratos (C ocupado)    |
| `E` `P` | Projetos          | inicial                  |
| `E` `S` | Suporte           | inicial                  |
| `E` `T` | Tarefas           | inicial                  |
| `E` `A` | Calendário        | cAlendário (C ocupado)   |
| `E` `D` | Documentos Dev    | inicial                  |
| `E` `M` | Documentos M&D    | M&D                      |
| `E` `Q` | Equipe            | eQuipe (E é a líder)     |
| `E` `N` | Comunicações      | comuNicações (C ocupado) |
| `E` `I` | Auditoria         | audItoria (A ocupado)    |

Depois de apertar `E`, há uma janela de 2 segundos para escolher a letra, e um
indicador na tela mostra que a sequência está ativa. `Esc` cancela. Como `E` e
a letra são teclas comuns, sem modificador, não há conflito com o navegador nem
com o sistema operacional, e o esquema funciona igual no Windows e no Mac.

---

## 7. Descoberta (discoverability)

Atalho que ninguém descobre não existe. Três mecanismos, em ordem de visibilidade:

1. **Letra na barra lateral.** Quando a barra está expandida, cada área mostra
   sua tecla de atalho (`E` mais a letra), discreta, ao lado do nome. O usuário
   vê o atalho no fluxo normal de uso, sem precisar procurar. É o mesmo
   princípio da letra sublinhada nos menus do Windows.
2. **A ajuda `?`.** Lista completa, agrupada por camada, gerada a partir da
   barra lateral real do usuário. É a referência sob demanda.
3. **A dica na busca.** O botão de busca no topo já exibe o `Ctrl K`, o que
   ensina a Camada 1 de forma passiva.

Decisão de governança: diferente do Gmail, que entrega os atalhos desligados, o
portal Elkys mantém os atalhos **sempre ligados**. O portal é uma ferramenta
interna de trabalho, não um produto de massa; o ganho de produtividade
justifica, e a ajuda `?` cobre quem se assustar.

---

## 8. Acessibilidade

- Os atalhos seguem o teclado, não o mouse, o que beneficia quem depende de
  navegação por teclado.
- Nenhuma função do portal exige atalho. Tudo tem caminho por clique e foco
  visível.
- A janela de ajuda e a paleta são diálogos modais com `role="dialog"`,
  `aria-modal` e fechamento por `Esc`.
- As teclas de atalho exibidas na barra lateral são marcadas como `aria-hidden`,
  porque são dica visual; o `aria-label` de cada item carrega o nome real da
  área. O indicador da sequência `E` usa `aria-live` para ser anunciado.
- Atalhos sem modificador são suprimidos dentro de campos editáveis, o que
  evita conflito com tecnologias assistivas em modo de formulário.

---

## 9. Implementação

Feito em `src/components/portal/admin/AdminLayout.tsx` e no novo componente
`src/components/portal/admin/KeyboardShortcutsHelp.tsx`:

- Camada 1: já existia (`Ctrl+K`, `Cmd+K`, `/`).
- Camada 2: nova janela de ajuda, carregada sob demanda, aberta por `?`.
- Camada 3: a sequência `E` + letra. `E` arma o modo (janela de 2 segundos) e
  exibe um indicador na tela; a letra seguinte vai para a área. As letras são
  declaradas em cada item de navegação (`buildNavSections`), então o mapa
  acompanha o papel do usuário.
- A sequência `g` + tecla da versão anterior foi removida.
- Cada área mostra sua letra de atalho na barra lateral quando expandida.

---

## 10. Evolução futura

- **Atalhos de ação**, não só de navegação: por exemplo, uma tecla para "novo
  cliente" ou "nova proposta" dentro da área correspondente. Seguiriam o padrão
  de tecla pura fora de campo de texto, no estilo Gmail/Linear.
- **Primeiro uso**: uma dica única ("aperte ? para ver os atalhos") na primeira
  sessão de cada usuário.
- **Estender ao portal do cliente**: o mesmo sistema de três camadas se aplica,
  ajustado ao conjunto de áreas do cliente.
- **Personalização**: permitir que o usuário avançado troque a letra de uma
  área, com o painel `?` refletindo a mudança automaticamente.
