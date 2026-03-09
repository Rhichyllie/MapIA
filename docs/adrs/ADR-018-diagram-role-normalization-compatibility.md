# ADR-018: DiagramRole e normalizacao backward-compatible

## Status
Aceito

## Contexto
Os snapshots historicos misturam `NodeKind` de sistema (`project`, `page`, `flow-step`, etc.) com o comportamento esperado por tipo de diagrama. Isso gerava sintomas de UX:
- `project` em Flow aparecia como "Etapa".
- validações e highlights usavam apenas `kind` bruto.
- QuickAdd e inspetor expunham tipos globais sem contexto.

## Decisao
1. Introduzir `DiagramRole` como papel contextual do nó (`flow-start`, `mindmap-root`, `erd-entity`, etc.).
2. Resolver role de forma determinística por:
   - tipo de diagrama;
   - `NodeKind`;
   - payload (`node.data.__mapia.role`) quando presente.
3. Normalizar snapshot em tempo de leitura do editor:
   - ocultar meta nodes (`workspace`/`project`) em flow/mindmap/erd sem deletar do snapshot;
   - gerar nó mínimo "real" quando só existirem meta nodes;
   - calcular `computedRootNodeId` estável para mindmap.
4. Tornar o engine semântico role-aware com mapeamento `role -> semantic kind` e ignorar meta nodes no audit quando aplicável.

## Compatibilidade
- Snapshot canônico não foi quebrado.
- `__mapia.role` é opcional e backward-compatible.
- Nodes meta continuam persistidos; apenas ficam ocultos no canvas quando necessário.
- IDs existentes permanecem válidos; nós mínimos gerados seguem formato UUID.

## Consequencias
- Diagramas passam a ter comportamento coerente por contexto sem migrar dados legados.
- Renderização, QuickAdd e semântica convergem para a mesma fonte de verdade (`DiagramRole`).
- Fluxos legados continuam abrindo sem intervenção manual.
