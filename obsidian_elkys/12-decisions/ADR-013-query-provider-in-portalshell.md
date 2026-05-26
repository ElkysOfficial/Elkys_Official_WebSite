---
title: ADR-013 — QueryClientProvider no PortalShell lazy, não no root
tags: [adr, frontend, performance, bundle]
status: accepted
---

# ADR-013 — `QueryClientProvider` no `PortalShell` (lazy), não no root

## Contexto

O `QueryClientProvider` (React Query) vivia em `src/App.tsx`, envolvendo
toda a árvore de rotas. Como o entry da landing importa `App.tsx` de forma
estática, o chunk `query-vendor` (~9 KB gzip) era baixado no boot de **toda**
visita — inclusive nas páginas públicas (Index, Cases, ServiceDetail, etc.),
que não consomem React Query.

Levantamento na v3.3.2: dos arquivos que importam `@tanstack/react-query`,
nenhum é página pública — só `AuthContext` e os hooks `useAdmin*` / `useClient*`,
todos atrás de rotas de portal. React Query era peso morto no first paint da
landing (download + parse + modulepreload hint competindo com fonts/CSS).

## Decisão

Mover o `QueryClient` (config) e o `QueryClientProvider` de `src/App.tsx` para
`src/pages/PortalShell.tsx` — a rota de layout pathless que já é `lazy()` e já
hospeda o `AuthProvider`. O provider passa a envolver `<AuthProvider>` dentro
do PortalShell.

React Query agora só carrega quando uma rota de portal/auth casa
(`/login`, `/forgot-password`, `/portal/*`).

**Princípio geral:** provider que só o portal precisa mora no `PortalShell`,
não no `App` root. Mesmo critério já aplicado ao `AuthProvider` (Supabase) e
ao `Toaster` (sonner).

## Alternativas

| Opção                                    | Por que não                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| Manter no root `App.tsx`                 | `query-vendor` baixado em toda landing sem uso                               |
| Só tirar `query-vendor` do modulepreload | Remove o hint, mas o import estático do entry continua — o chunk ainda baixa |
| Code-split manual do `QueryClient`       | `PortalShell` já é o boundary `lazy` natural — sem precisar de novo split    |

## Consequências

### Positivas

- Boot da landing: −9 KB gzip de JS, uma requisição HTTP a menos e um
  `modulepreload` hint a menos competindo com fonts/CSS.
- React Query não é parseado nem executado em visita pública.
- Reforça o padrão "portal-only no `PortalShell`".

### Negativas

- A hierarquia de providers do portal ganha um nível
  (`QueryClientProvider` > `AuthProvider` no `PortalShell`).
- A recomendação de `staleTime` global da issue
  [[../13-issues/refetch-on-window-focus]] agora se aplica ao `queryClient`
  em `PortalShell.tsx` (não mais em `App.tsx`).

## Verificação

Build de produção + `preview` com Playwright (v3.3.2): a landing renderiza
sem baixar `query-vendor`; `/login` carrega o chunk sob demanda; zero erros
de runtime; hierarquia `QueryClientProvider > AuthProvider` correta.

## Relações

- [[ADR-008-no-state-library]] — escolha de React Query como data layer
- [[ADR-009-css-splitting-purgecss]] — mesmo espírito (separar landing de portal)
- [[../11-performance/build-pipeline]]
- [[../13-issues/refetch-on-window-focus]]

## Referências

- `src/pages/PortalShell.tsx`
- `src/App.tsx`
- `vite.config.ts`
- v3.3.2 — commit `refactor(bundle): movi o QueryClientProvider para o PortalShell lazy`
