# Creation Assistant Transition Backlog (operacional)

- Status: ativo
- Atualizado em: 2026-03-12
- Escopo: executar a deprecacao de aliases e fallback legado sem drift semantico.

## Itens por marco

1. `CA-DEP-001` - Freeze de novos consumidores do alias de escrita
   - Dono: Backend Platform (owner: `@backend-platform`)
   - Data alvo: 2026-03-29
   - Gate: 100% dos novos PRs sem `PUT /creation-settings` para escrita
   - Evidencia: review de PR + busca estaticas por rota alias

2. `CA-DEP-002` - Runtime warning para alias legado
   - Dono: API Core (owner: `@api-core`)
   - Data alvo: 2026-04-05
   - Gate: evento `creation_settings_alias_put` emitindo warning de deprecacao
   - Evidencia: logs estruturados e snapshot do endpoint interno

3. `CA-DEP-003` - Gate de dependencia legado (template)
   - Dono: Product Engineering (owner: `@product-eng`)
   - Data alvo: 2026-06-07
   - Gate: `% dependencia template <= 10%` no endpoint interno
   - Evidencia: `GET /api/internal/observability/creation-transition`

4. `CA-DEP-004` - Remocao da escrita no alias `PUT /creation-settings`
   - Dono: API Core (owner: `@api-core`)
   - Data alvo: 2026-06-07 (release `2026.06`)
   - Gate: uso do alias < 5% por 14 dias
   - Evidencia: contadores `creation_settings_alias_put` e `creation_settings_alias_payload_settings`

5. `CA-DEP-005` - Freeze de colunas transitorias em `project_creation_settings`
   - Dono: Data Platform (owner: `@data-platform`)
   - Data alvo: 2026-05-03
   - Gate: sem novas escritas em `draftPayload`, `draftVersion`, `draftUpdatedAt`
   - Evidencia: auditoria de queries + testes de regressao

6. `CA-DEP-006` - Remocao fisica das colunas transitorias
   - Dono: Data Platform (owner: `@data-platform`)
   - Data alvo: 2026-07-05
   - Gate: janela de rollback validada em 2 releases
   - Evidencia: migration aplicada em staging + smoke tests

7. `CA-DEP-007` - Fallback `project.template` somente para legado residual
   - Dono: Product Engineering (owner: `@product-eng`)
   - Data alvo: 2026-07-19
   - Gate: dependencia de template < 2% por 14 dias
   - Evidencia: topologia de fallback no endpoint interno

8. `CA-DEP-008` - Remocao do template como fonte de runtime
   - Dono: Architecture Council (owner: `@arch-council`)
   - Data alvo: 2026-08-16
   - Gate: 0 regressao em criacao/aplicacao + dependencia estabilizada abaixo do limite
   - Evidencia: e2e estavel + metricas operacionais

## Rotina semanal (operacao)

1. Rodar coleta de snapshot interno:
   - `GET /api/internal/observability/creation-transition`
2. Publicar resumo:
   - hits de alias
   - projetos com dependencia de template
   - top fallback reasons
3. Abrir incidentes de transicao quando gate violado.
4. Executar resposta operacional conforme runbook:
   - `docs/operations/creation-transition-runbook.md`
