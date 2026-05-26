# Plano de Consolidação de Branches — 2026-05

Status atual do repositório e como subir tudo pra `develop` → release → `main` antes de apagar todas as branches.

---

## 🚨 Diagnóstico crítico

**`develop` local e `origin/develop` divergiram.**

`origin/develop` tem 10 commits que `develop` local não tem, incluindo as releases `v3.0.0`, `v3.0.1`, `v3.1.0`, `v3.1.1` que estão no ar (`main` deploy em produção).

`develop` local tem 2 commits que `origin/develop` não tem:

```
b2fd4fe feat(admin): adicionei alertas de cobranca no dashboard e badge na sidebar
940047f Merge branch 'feature/portal-valor-imediato' into develop
```

**Causa provável**: você trabalhou local sem fazer pull antes de criar a sequência de releases que foi pra origin via PRs. O remoto avançou, o local não acompanhou.

**Consequência**: `feature/admin-sidebar-redesign` (que aponta pro mesmo `940047f`) está baseada nessa snapshot antiga de develop. Tentar mergear ela direto contra `origin/develop` produz conflitos enormes porque a árvore inteira do portal está numa versão diferente.

**Solução**: tratar `origin/develop` como fonte da verdade (tem as releases que deployaram). O trabalho local divergente precisa ser cherry-picked em cima dela.

---

## Inventário do que está pendente

### Branches

| Branch                                   | Estado                                                                        | Ação                                                        |
| ---------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `feature/comms-dashboard-v2`             | **commitada** (`f221b74`), baseada em `origin/develop`                        | Push + PR pra `develop`                                     |
| `feature/admin-sidebar-redesign`         | Mesmo HEAD que `develop` local (`940047f`). Divergente de origin. + stash@{0} | Cherry-pick em branch nova de `origin/develop`              |
| `develop` (local)                        | 2 commits divergentes (`b2fd4fe` + `940047f`)                                 | Reset hard pra `origin/develop` depois de salvar os commits |
| `main`                                   | OK, em sync                                                                   | —                                                           |
| `origin/chore/security-deps-bump-v3.1.1` | Já foi mergido (PR #8)                                                        | Apagar no remoto                                            |

### Stashes

| Stash       | Conteúdo                                                                                                                           | Ação                                                                       |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `stash@{0}` | `AdminLayout.tsx` (763 linhas) + Overview.tsx (2 linhas tweak `xl:col-span-2`)                                                     | Aplicar em `feature/admin-sidebar-redesign-v2` baseada em `origin/develop` |
| `stash@{1}` | E-mails formais Sr/Sra + migration gender/campos estendidos (ClientCreate, ClientDetail, TeamCreate, TeamEdit, +20 edge functions) | Aplicar em `feature/emails-formal-treatment` baseada em `origin/develop`   |
| `stash@{2}` | Backup automático do lint-staged                                                                                                   | Descartar                                                                  |

### Commits divergentes em `develop` local

- `b2fd4fe` — `feat(admin): adicionei alertas de cobranca no dashboard e badge na sidebar` — cherry-pick em `feature/admin-overdue-alerts` baseada em `origin/develop`
- `940047f` — Merge commit, **descartar** (recria-se via PR)

---

## Plano de execução (passo a passo, com confirmação)

### Etapa 1 — Comms v2 (já commitada, mais simples)

```
git push -u origin feature/comms-dashboard-v2
# Abrir PR feature/comms-dashboard-v2 → develop no GitHub
```

### Etapa 2 — Salvar os 2 commits de develop divergente

```
git checkout -b feature/admin-overdue-alerts origin/develop
git cherry-pick b2fd4fe
# Resolver conflitos se houver (provável: AdminLayout/Sidebar mudou em origin)
git push -u origin feature/admin-overdue-alerts
# PR feature/admin-overdue-alerts → develop
```

### Etapa 3 — Sidebar redesign

```
git checkout -b feature/admin-sidebar-redesign-v2 origin/develop
git stash apply stash@{0}
# AVISO: stash{0} foi criado de uma base muito antiga. Pode dar conflito
# enorme em AdminLayout — origin já evoluiu esse arquivo. Pode ser mais
# rápido recriar a redesign do zero usando o stash como referência visual.
npx tsc --noEmit  # validar
git push -u origin feature/admin-sidebar-redesign-v2
# PR
```

### Etapa 4 — Emails formais Sr/Sra + migration

```
git checkout -b feature/emails-formal-treatment origin/develop
git stash apply stash@{1}
# Mesma situação: pode conflitar com a evolução das edge functions feita
# em origin (cc93e65 mudou várias send-* functions)
npx tsc --noEmit
git push -u origin feature/emails-formal-treatment
# PR
```

### Etapa 5 — Resync do `develop` local

Depois que todos os PRs acima estiverem mergidos em `origin/develop`:

```
git checkout develop
git reset --hard origin/develop  # ⚠️ destrutivo, mas seguro porque já cherry-picamos tudo
```

### Etapa 6 — Release branch

```
git checkout -b release/v3.2.0 origin/develop
# Bump de versão em package.json
# CHANGELOG.md atualizado com tudo que entrou
git commit -m "chore(release): v3.2.0"
git push -u origin release/v3.2.0
# PR release/v3.2.0 → main
# Após merge em main, merge back release/v3.2.0 → develop (git-flow)
```

Decidir o bump (3.2.0 vs 3.1.2) com base em:

- Quebrou contrato? → major (não é o caso)
- Funcionalidade nova? → minor (sim: dashboard de comms repensado, sidebar, e-mails formais) → **v3.2.0**
- Só bugfix? → patch

### Etapa 7 — Limpeza

Depois do merge em main e validação de produção:

```
# Remoto:
git push origin --delete chore/security-deps-bump-v3.1.1
git push origin --delete feature/comms-dashboard-v2
git push origin --delete feature/admin-overdue-alerts
git push origin --delete feature/admin-sidebar-redesign-v2
git push origin --delete feature/emails-formal-treatment
git push origin --delete release/v3.2.0

# Local:
git branch -D feature/admin-sidebar-redesign  # antiga, divergente
git branch -D feature/comms-dashboard-v2
git branch -D feature/admin-overdue-alerts
git branch -D feature/admin-sidebar-redesign-v2
git branch -D feature/emails-formal-treatment
git branch -D release/v3.2.0
git stash drop stash@{0}
git stash drop stash@{1}
git stash drop stash@{2}
```

Sobra `main` e `develop` apenas, conforme combinado.

---

## ⚠️ Riscos e pontos de decisão

1. **Stashes podem conflitar pesado.** Stash@{0} e stash@{1} foram criados em cima da snapshot antiga de develop. Como origin/develop evoluiu muito (releases 3.0.0 → 3.1.1, consolidação de portal, comms WhatsApp), é provável que o `git stash apply` produza conflitos extensos. Pode ser mais rápido reaplicar manualmente os pontos-chave usando o stash como referência.

2. **Não amend / não force-push em main ou origin/develop.** Tudo via PR.

3. **Migration do stash@{1}** (gender + campos estendidos): conferir se já não existe migration equivalente em `supabase/migrations/` no origin. Se já existe, descartar a do stash. Se não, garantir nome cronológico correto.

4. **Branch `chore/security-deps-bump-v3.1.1`** ainda existe em origin — verificar se já foi mergida via PR e pode ser apagada (parece que sim, é a base do v3.1.1).

---

## Próximo passo

Confirme se posso começar pela **Etapa 1** (push + PR de comms-dashboard-v2). As Etapas 2-7 envolvem cherry-pick e resolução de conflitos — vou pausar entre cada uma pra alinhar.
