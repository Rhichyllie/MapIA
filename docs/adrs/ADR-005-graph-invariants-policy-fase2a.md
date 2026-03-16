# ADR-005: Politica de invariantes do grafo no backend do Editor (Fase 2A)

- Status: Aceito
- Data: 2026-02-23

## Contexto

O schema estrutural do snapshot (`GraphSnapshotSchema`) garante formato e tipos, mas nao cobre consistencia semantica do grafo.

Exemplos de inconsistencias que ainda podem passar no schema estrutural:

- IDs duplicados
- edge apontando para node inexistente
- relacao duplicada exata
- labels com espacos/valor vazio apos trim
- coordenadas nao finitas

Sem uma camada explicita de invariantes, o core do editor poderia operar/persistir snapshots inconsistentes.

## Decisao

Centralizar as regras semanticas em `validateGraphSnapshotInvariants(snapshot)`, executada de forma obrigatoria no backend.

Regras adotadas:

- `node.id` unico
- `edge.id` unico
- `edge.sourceNodeId` e `edge.targetNodeId` obrigatorios (nao vazios)
- edge deve referenciar nodes existentes
- posicoes de node e viewport com numeros finitos
- labels normalizadas com `trim`
- label de node nao pode ficar vazia apos `trim`
- edge duplicada exata (`source + target + kind`) bloqueada

Pontos de execucao:

- apos leitura (defensivo)
- apos aplicar command
- antes de persistir snapshot

## Politica de remocao de node / edges orfas

Ao remover um node via command do editor, o backend remove automaticamente todas as edges conectadas ao node (cascade local no snapshot em memoria).

Motivacao:

- evita edges orfas por padrao
- simplifica a logica da UI
- mantem snapshot consistente antes da persistencia

## Consequencias

- Positivas:
  - consistencia semantica padronizada em um unico lugar
  - erros de dominio mais claros (`AppError`) para API/UI
  - reuse da mesma politica no endpoint de save completo e nos commands incrementais
- Negativas:
  - custo extra de validacao em leitura/mutacao (aceitavel para o tamanho atual dos grafos)
  - algumas entradas aceitas pela UI podem passar a falhar no backend (intencional)
