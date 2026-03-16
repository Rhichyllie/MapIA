# ADR-015: Wizard root node e politica de reaplicacao de layout no Editor

- Status: Aceito
- Data: 2026-03-05

## Contexto

A Fase 5.1 trouxe melhora de UX para Workspace/Wizard/Editor, mas dois controles do wizard estavam inconsistentes com a persistencia e com o comportamento real do editor:

- `Nome do no raiz` era exibido na UI, mas nao persistia no draft e nao influenciava a geracao do snapshot inicial.
- `Permitir reaplicar layout no editor` era exibido como checkbox, mas nao persistia no draft e nao controlava o botao/acao de reaplicar layout no editor.

Isso permitia regressao silenciosa de UX (controle visivel sem efeito), inclusive sem cobertura E2E dedicada para detectar o problema.

## Decisao

Foi adotada modelagem explicita com metadados opcionais no payload do wizard e no snapshot canonico:

1. Wizard draft/config

- `rootNodeName?: string`
- `allowReapplyLayout?: boolean`

2. Snapshot canonico (`GraphSnapshot`)

- `rootNodeName?: string`
- `allowReapplyLayout?: boolean`

3. Regras de geracao/validacao

- Quando `generateRootNode=true`, `rootNodeName` e obrigatorio (apos `trim`) no `WizardReadyPayloadSchema`.
- Valor padrao unificado: `Visao geral`.
- Na geracao do snapshot inicial:
  - o no raiz opcional criado pelo wizard usa `rootNodeName` como label;
  - `allowReapplyLayout` e persistido no snapshot.

4. Regra no Editor

- `Reaplicar layout` agora depende de:
  - tipo de diagrama suportado (`tree|flow|mindmap`), e
  - politica do snapshot (`allowReapplyLayout !== false`).
- Para snapshots legados (`allowReapplyLayout` ausente), o comportamento anterior e mantido.

## Consequencias

### Positivas

- UX consistente: controles do wizard agora influenciam resultado real.
- Persistencia correta no draft com reload do wizard sem perda de dados.
- Politica de layout aplicada de forma deterministica no editor.
- Compatibilidade retroativa preservada para snapshots legados.

### Compatibilidade e migracao

- Sem migracao de banco.
- Campos novos sao opcionais no schema do snapshot.
- Invariantes normalizam metadados opcionais sem quebrar snapshots antigos.

### Testes adicionados/atualizados

- Unit:
  - validacao de `rootNodeName` obrigatorio quando `generateRootNode=true`.
  - schema/invariants aceitando metadados opcionais do snapshot.
- E2E:
  - fluxo wizard com `rootNodeName="Arquitetura Geral"` + `allowReapplyLayout=false`.
  - validacao do label no snapshot final e botao de reaplicar layout desabilitado no editor.

## Alternativas consideradas

- Salvar politica dentro de `layoutOptions`: rejeitado, pois `layoutOptions` e normalizado por tipo e nao representa politica de permissao do editor.
- Criar tabela/entidade separada para politica de layout: rejeitado nesta fase por custo/complexidade sem necessidade funcional.
