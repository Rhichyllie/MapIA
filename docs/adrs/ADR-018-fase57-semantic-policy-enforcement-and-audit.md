# ADR-018: Fase 5.7 - semantic policy persistida, enforcement backend e auditoria

- Status: Aceito
- Data: 2026-03-09

## Contexto

Antes da Fase 5.7, as regras semanticas existiam principalmente no frontend, o que permitia inconsistencias quando comandos eram aplicados por APIs ou fluxos indiretos (import/restore).

Limites identificados:

- ausencia de uma fonte unica de regras consumida por client e server;
- falta de politica por projeto para controlar strict mode e override tecnico;
- baixa rastreabilidade de violacoes, overrides e reparos;
- risco de perda de atualizacao em concorrencia de edicao.

## Decisao

Adotar enforcement semantico server-side com politica persistida e auditoria append-only:

1. Engine unico compartilhado

- modulo canonico: `src/modules/semantics/domain/semantic-engine.ts`;
- frontend e backend consomem o mesmo conjunto de funcoes puras.

2. Politica semantica por projeto

- nova tabela/model `semantic_policies`;
- criacao lazy quando nao existir, derivando `diagramType` do snapshot atual.

3. Enforcement no backend em fluxos de escrita

- create edge, update edge, update node, save full snapshot, import Prisma e restore version;
- contratos de erro padronizados para `SEMANTIC_VIOLATION` (422), `REPAIR_REQUIRED` (409) e `CONFLICT` (409).

4. Auditoria/compliance append-only

- nova tabela/model `semantic_event_logs`;
- registro de bloqueios, overrides, repairs aplicados, auditorias e imports.

5. Concorrencia otimista

- `revision` no working snapshot persistido;
- writes aceitam `expectedRevision` e retornam `newRevision`;
- mismatch retorna `409 CONFLICT` com revisao atual.

## Consequencias

### Positivas

- consistencia semantica protegida no backend;
- regras centralizadas e reutilizadas sem duplicacao;
- trilha auditavel para operacao e compliance;
- reducao de overwrite silencioso em edicao concorrente.

### Custos e riscos

- aumento de complexidade em use-cases e contratos de API;
- necessidade de manter policy/versioning alinhados com UX do editor;
- maior acoplamento entre fluxos de import/restore e validacao semantica.
