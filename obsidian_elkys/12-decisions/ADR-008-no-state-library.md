---
title: ADR-008 — Sem state library global
tags: [adr, frontend, state]
status: accepted
---

# ADR-008 — Sem Zustand/Redux/Jotai

## Contexto

Aplicação dividida em 3 zonas (público, admin, cliente) com pouco state cross-cutting. O único state global é o usuário autenticado.

## Decisão

Manter apenas:

- **React Context** para `AuthContext` (user, roles, session, timeout).
- **TanStack React Query** para todo data-fetching e cache.
- **`useState`/`useReducer`** para state local de componente.

Sem Zustand, Redux, MobX, Jotai, Recoil.

## Alternativas

| Opção          | Por que não                                                           |
| -------------- | --------------------------------------------------------------------- |
| Zustand        | Útil em SPAs com lots de "wizards" e shared state — não é o caso aqui |
| Redux Toolkit  | Boilerplate alto, ROI baixo na escala atual                           |
| Jotai/Recoil   | Atomicidade não compensa o custo de aprendizado                       |
| Apenas Context | Mas teria re-render hell em queries server — daí React Query          |

## Consequências

### Positivas

- Bundle enxuto.
- Cada feature owna seu data-fetching via `useQuery`.
- Time pequeno ramp-up rápido.

### Negativas

- **Sem cache de "form em progresso" cross-route** — `useFormDraftAutoSave` cobre, mas é localStorage.
- **Cmd+K busca global** futuro precisará de mini state ou query agregada.
- Difícil compartilhar selecionados (ex: bulk actions) entre páginas — solução: URL state via `useUrlState`.

## Convenção

- **Server state** → React Query.
- **Form state** → react-hook-form.
- **URL state** → `useUrlState` / `useSearchParams`.
- **Component state** → `useState`/`useReducer`.
- **App-wide** → React Context (apenas Auth, hoje).

## Relações

- [[../07-frontend/state-strategy]]
- [[../07-frontend/hooks]]
- [[ADR-013-query-provider-in-portalshell]] — onde o `QueryClientProvider` é montado
- `useUrlState`, `useFormDraftAutoSave`

## Referências

- `src/contexts/AuthContext.tsx`
- `src/hooks/useUrlState.ts`
- `package.json` (sem `zustand`/`redux`)
