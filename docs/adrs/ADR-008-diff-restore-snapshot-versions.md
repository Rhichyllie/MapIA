# ADR-008: Diff e restore de versoes de snapshot com backend como fonte de verdade

- Status: Aceito
- Data: 2026-02-23

## Contexto

A Fase 3B separou:

- `working snapshot` mutavel (fluxo operacional do editor)
- versoes imutaveis em `editor_snapshot_versions`

Faltava implementar `diff` e `restore` sem quebrar:

- autosave por commands
- save manual do snapshot completo
- endpoints existentes do editor e de versoes (create/list/detail)

Tambem era importante manter a regra de negocio no backend para evitar divergencias entre clientes.

## Decisao

Foi implementado na Fase 3C:

- `GET /api/projects/[projectId]/snapshot-versions/[versionId]/diff`
- `POST /api/projects/[projectId]/snapshot-versions/[versionId]/restore`

Com as seguintes regras:

- Diff e calculado no backend por helper puro de dominio (`computeGraphSnapshotDiff`)
- Endpoint de diff retorna `version` (summary) + `diff` estrutural para a UI exibir contexto sem carregar o snapshot completo
- Diff usa semantica:
  - `Base = versao imutavel`
  - `Target = working snapshot`
  - `added/removed/changed` por `id` + comparacao estrutural normalizada
- Restore sobrescreve o `working snapshot` com o snapshot da versao selecionada
- A versao restaurada permanece imutavel (nenhuma alteracao em `editor_snapshot_versions`)

## Por que o diff foi implementado no backend

- Backend ja e a fonte de verdade do `working snapshot` persistido e das versoes imutaveis.
- Evita duplicar regras de comparacao entre frontend(s) e API.
- Permite manter validacao/autorizacao/ownership em um fluxo unico.
- Prepara evolucao futura para diffs mais ricos (visual, semantico, com politicas de filtro) sem acoplar UI ao algoritmo.

## Por que o restore sobrescreve o working snapshot (e nao altera a versao)

- Preserve a imutabilidade do historico: uma versao criada continua sendo checkpoint auditavel.
- Mantem semantica clara:
  - versao = registro historico
  - working snapshot = estado operacional mutavel do editor
- Reaproveita o fluxo atual do editor (autosave/manual save) sem redefinir a arquitetura.
- Reduz risco de regressao porque o editor continua lendo/escrevendo o mesmo conceito de snapshot de trabalho.

## Por que o diff MVP e estrutural (e nao visual)

- Objetivo da 3C era habilitar comparacao e restore funcionais com baixo risco.
- Diff visual no canvas exige UX/IA adicional (layout, destaque, agrupamento, navegacao de mudancas).
- O diff estrutural ja atende o backend/API e permite feedback textual simples na UI.
- A implementacao estrutural e mais facil de testar de forma deterministica (IDs + objetos normalizados).

## Trade-offs

- Positivos:
  - baixo impacto no fluxo atual do editor
  - endpoints simples e testaveis
  - regra de negocio centralizada no backend
  - prepara E2E futuro com `data-testid` estaveis
- Negativos:
  - diff textual/estrutural e menos amigavel que um diff visual
  - restore atual sobrescreve direto o `working snapshot` sem checkpoint automatico pre-restore
  - comparacao/restore refletem o snapshot persistido no backend (nao mutacoes locais ainda nao salvas)

## Como prepara fases futuras

- Timeline/historico de versoes no editor (lista, filtros, agrupamento por origem)
- Diff visual no canvas (highlights por node/edge, viewport/fit, navegação de mudanças)
- Restore com checkpoint previo automatico ("safety checkpoint" antes de sobrescrever)
- Audit trail de restore (ator, timestamp, motivo)
- Politicas de diff mais semanticas (ignorar campos cosmeticos, comparar payloads com regras por tipo)
