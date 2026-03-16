# ADR-019: Deprecacao Progressiva de `project.template` no Novo Modo de Criacao

- Status: Accepted
- Data: 2026-03-12
- Dono: Time MapIA

## Contexto

O Assistente de criacao passou a usar `creationSettings` como fonte semantica principal
(`profile`, `initialView`, `layout`, `automation`, `context`, origem e estrategia).
Projetos legados ainda dependem de `project.template`.

## Decisao

1. `creationSettings` continua como fonte efetiva principal no runtime.
2. `project.template` permanece apenas como fallback de compatibilidade.
3. O resolvedor central (`resolve-project-creation-context`) define prioridade:
   - `creationSettings`
   - `snapshot.diagramType`
   - `project.template`
4. Novo rascunho server-side passa a ser versionado em `project_creation_settings`
   (`draftPayload`, `draftVersion`, `draftUpdatedAt`), reduzindo dependencia de campos legados.

## Plano de Migracao em Fases

1. Fase A (atual):
   - escrita dual: salvar `creationSettings` como verdade e manter `template` para legado.
   - leitura com prioridade por contexto resolvido.
2. Fase B:
   - backfill em lote: gerar `creationSettings` para projetos legados ativos com base em snapshot/template.
   - observabilidade: medir taxa de leituras que ainda caem em fallback `template`.
3. Fase C:
   - congelar escrita direta de `template` em fluxos novos.
   - manter leitura fallback somente para projetos historicos.
4. Fase D:
   - remover fallback de `template` quando cobertura de backfill atingir alvo operacional.
   - marcar coluna/enum como candidato a remocao com janela de rollback documentada.

## Consequencias

- Beneficio: semantica unica do produto no novo modo de criacao.
- Beneficio: menos conflito entre template legado e configuracao real do assistente.
- Risco: projetos antigos sem `creationSettings` dependem do fallback ate migracao completa.
- Mitigacao: fallback controlado + telemetria + migracao faseada.
