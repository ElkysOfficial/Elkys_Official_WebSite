# Versionamento

Este projeto usa versionamento semântico adaptado para produto.

## Formato: MAJOR.MINOR.PATCH

- **MAJOR** (`X.0.0`): marco grande e visível. Módulo novo, redesign ou
  mudança estrutural que o cliente percebe.
- **MINOR** (`x.Y.0`): funcionalidade nova entregue, compatível com o que
  já existe.
- **PATCH** (`x.y.Z`): correção de bug ou ajuste pequeno.

## Processo de release (git-flow)

1. Criar `release/vX.Y.Z` a partir de `develop`.
2. Na release branch: bump do `package.json` e atualização do `CHANGELOG.md`.
3. Merge da release em `main` e criação da tag `vX.Y.Z`.
4. Back-merge da release em `develop`.
5. Publicar o release no GitHub com as notas da versão.

## Regras

- O `package.json` SEMPRE acompanha a tag. Um não muda sem o outro.
- Toda versão publicada tem uma entrada no `CHANGELOG.md`.
- Não se cria tag por push. A versão é uma decisão deliberada, não um
  contador automático.

## Histórico

A linha 2.x (v2.0.0 a v2.98.0) foi versionada antes desta política, com
mais de 200 tags incrementais sem changelog. A versão 3.0.0 inicia o
processo correto.
