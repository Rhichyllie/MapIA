# ADR-018: ERD Semantico enterprise (Rodada 1/2)

- Status: Aceito
- Data: 2026-03-11

## Contexto

O editor ERD tinha modelagem parcial:

- relacao sem payload formal min/max;
- inspector de aresta focado em rename;
- import Prisma com payload de relacao fraco;
- validacao sem niveis reais para Draft/Guided/Strict;
- fluxo de criacao sem "quick relate" com presets.

Objetivo da rodada: entregar base de produto usavel para modelagem rapida, inferencia, autofix e strict gating no export.

## Decisao

Implementar dominio ERD dedicado e integrar no editor/server:

1. Payload ERD formal

- `entity.data.fields` com `id`, `name`, `type`, `flags[]`, `references`.
- `references edge.data` com `cardinality` formal, `roles`, `materialization`, `referentialActions`.
- normalizacao back-compat para payload legado.

2. Niveis de validacao reais

- politica em `customRulesJson.erd.validationLevel = draft|guided|strict`.
- dropdown "Validacao ERD" no editor.
- strict nao bloqueia edicao; bloqueia apenas `export-preview`.

3. UX acelerada

- quick relate popover com presets `1:1`, `1:N`, `N:1`, `N:N`.
- inspector de relacao ERD completo (cardinalidade, papeis, materializacao, integridade).
- inspector de entidade com grid inline de campos, atalhos e reorder.
- badges leves no card ERD no canvas.

4. Autofix e audit

- fixes seguros por diagnostico (PK, FK, UNIQUE 1:1, conversao N:N associativa).
- acao "Corrigir tudo seguro" no painel de verificacao.

5. Export strict-aware

- endpoint `POST /api/projects/:id/erd/export-preview`.
- em strict com erros: `409 REPAIR_REQUIRED` com `repairPlan` e `suggestedFixes`.

6. Import Prisma enriquecido

- cardinalidade formal min/max inferida por lado.
- materializacao FK quando `fields/references` existem.
- `unique` em 1:1 quando FK tem `@unique`.
- `onDelete`/`onUpdate` mapeados para payload ERD.

## Exemplo de payload

### Entidade

```json
{
  "tableName": "users",
  "fields": [
    { "id": "f_user_id", "name": "id", "type": "uuid", "flags": ["PK", "NOT_NULL"] },
    { "id": "f_user_email", "name": "email", "type": "string", "flags": ["UQ", "NOT_NULL"] }
  ],
  "semantic": { "normalizedName": "User", "pkKind": "single", "hasPk": true }
}
```

### Relacao (1:N com FK)

```json
{
  "name": "userPosts",
  "cardinality": { "minSource": 1, "maxSource": 1, "minTarget": 0, "maxTarget": "N" },
  "roles": { "sourceRole": "hasMany", "targetRole": "belongsTo" },
  "materialization": {
    "mode": "fk",
    "dependentSide": "target",
    "fk": {
      "dependentEntityId": "post",
      "fkFieldIds": ["post_user_id"],
      "referencesEntityId": "user",
      "referencesFieldIds": ["user_id"]
    }
  },
  "referentialActions": { "onDelete": "cascade", "onUpdate": "noAction" }
}
```

## Matriz de validacao

| Regra | Draft | Guided | Strict (edicao) | Strict (export-preview) |
|---|---|---|---|---|
| Entidade sem nome | info | warning | permitido | erro bloqueante |
| Entidade sem PK | info | warning | permitido | erro bloqueante (se `requirePrimaryKeyInStrict=true`) |
| Campo sem tipo | info | warning | permitido | erro bloqueante |
| Relacao sem cardinalidade | info | warning | permitido | erro bloqueante |
| 1:N sem FK | info | warning + fix | permitido | erro bloqueante |
| 1:1 sem UNIQUE no FK | info | warning + fix | permitido | erro bloqueante |
| N:N direta | suggestion | suggestion + fix | permitido | erro (ou warning se conceitual permitido por policy) |

## Consequencias

### Positivas

- modelagem ERD muito mais rapida no editor;
- payload pronto para export consistente e para rodadas seguintes de geracao;
- audit com diagnosticos acionaveis e correcoes em 1 clique.

### Custos

- maior complexidade no `editor-shell` por fluxo ERD especializado;
- necessidade de evoluir UX (rodada 2) para refinamento visual e produtividade de massa.
