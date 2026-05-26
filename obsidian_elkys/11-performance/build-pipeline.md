---
title: Build Pipeline
tags: [performance, build, vite]
---

# Build Pipeline

## Contexto

`npm run build` orquestra Vite + 3 scripts pós-build, totalizando ~30s para um build limpo. `build:min` adiciona Terser 2-pass para deploy de produção.

## Pipeline

```
1. Vite (SWC)
   ├─ resolve módulos
   ├─ tree-shake
   └─ manualChunks por arquivo (react/form/recharts/supabase vendors)

2. Plugins
   ├─ vite-plugin-svgr → SVG como React component
   ├─ vite-plugin-html → injeção de meta tags
   └─ rollup-plugin-visualizer → stats.html (debug)

3. Minificação (apenas build:min)
   └─ Terser 2-pass: drops console.*, debugger, dead code

4. PurgeCSS
   ├─ landing CSS (full purged) → inline em HTML
   └─ portal CSS → lazy-load via window.__ELKYS_FULL_CSS__

5. Entry inlining
   └─ entry.js (~27KB gzip) inlined em HTML
       + modulepreload hint para react-vendor (único vendor que o
         entry importa de forma estática; query-vendor saiu em v3.3.2
         — ver ADR-013)

6. scripts/generate-sitemap.cjs
   └─ sitemap.xml com routes públicas + dynamic /servicos/:slug

7. scripts/prerender.cjs
   └─ HTML estático de cada rota pública (com canonical/OG)

8. scripts/copy-htaccess.cjs
   └─ Apache config → dist/.htaccess
```

## Modos

| Modo        | Minificador            | console.\* | Uso                             |
| ----------- | ---------------------- | ---------- | ------------------------------- |
| `build`     | esbuild (default Vite) | mantido    | staging, iteração               |
| `build:min` | Terser 2-pass          | removido   | produção (prod = `MINIFY=true`) |
| `build:dev` | nenhum                 | mantido    | debug local                     |

## manualChunks (canonical)

```ts
manualChunks(id) {
  if (!id.includes('node_modules')) return
  if (id.includes('/node_modules/recharts/')) return 'recharts-vendor'
  if (id.includes('/node_modules/@supabase/supabase-js/')) return 'supabase-vendor'
  if (id.includes('/node_modules/@tanstack/react-query/')) return 'query-vendor'
  if (id.includes('/node_modules/react-hook-form/') ||
      id.includes('/node_modules/@hookform/') ||
      id.includes('/node_modules/zod/')) return 'form-vendor'
  // clsx + tailwind-merge fixados em react-vendor (senão o Rollup os
  // posiciona no recharts-vendor e a landing baixa libs de gráfico)
  if (id.includes('/node_modules/clsx/') ||
      id.includes('/node_modules/tailwind-merge/')) return 'react-vendor'
  if (id.includes('/node_modules/react/') ||
      id.includes('/node_modules/react-dom/') ||
      id.includes('/node_modules/react-router-dom/') ||
      id.includes('/node_modules/react-router/') ||
      id.includes('/node_modules/scheduler/')) return 'react-vendor'
}
```

⚠️ Função, **não** objeto — ver [[../12-decisions/ADR-005-manualchunks-pitfall]] e a memória `project_manualchunks_gotcha`.

`@tanstack/react-query` tem chunk próprio (`query-vendor`), não cai em `react-vendor`. Desde v3.3.2 ele só carrega no portal (lazy via `PortalShell`) — ver [[../12-decisions/ADR-013-query-provider-in-portalshell]].

## Imagens

`scripts/optimize-landing-images.cjs` (sharp):

- Hexagonal.webp 1024×1024 q80 (decorativo, blur)
- Lettering icons 256×256 q85 (2× retina)
- Login logos 400×133 (3:1)
- WebP em vez de PNG/JPEG

## Problemas Identificados

🟠 **`stats.html` (rollup-plugin-visualizer)** sempre gerado mesmo em prod — peso desprezível, mas vai a produção desnecessariamente.
🟠 **Sem cache de chunks no FTP** — deploy `dangerous-clean-slate=true` no primeiro tentativo apaga tudo. Cache HTTP de 1ª visita pós-deploy degrada (cache miss).
🟢 **Bundle não tem hash de Subresource Integrity** — sem garantia de integridade.

## Recomendações

1. Build em prod: pular `stats.html` (env var `BUNDLE_STATS=false`).
2. Investigar **immutable cache headers** + hash em chunks no `.htaccess` para forçar revalidation.
3. Considerar SRI para entry.js (overkill mas blueprint para crescer).

## Relações

- [[bundle-strategy]]
- [[css-splitting]]
- [[../12-decisions/ADR-005-manualchunks-pitfall]]
- [[../12-decisions/ADR-009-css-splitting-purgecss]]
- [[../12-decisions/ADR-013-query-provider-in-portalshell]]
- [[../09-infra/deployment]]

## Referências

- `vite.config.ts`
- `scripts/generate-sitemap.cjs`
- `scripts/prerender.cjs`
- `scripts/copy-htaccess.cjs`
- `scripts/optimize-landing-images.cjs`
