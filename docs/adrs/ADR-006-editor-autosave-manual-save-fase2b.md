# ADR-006: Autosave com debounce + save manual no Editor (Fase 2B)

- Status: Aceito
- Data: 2026-02-23

## Contexto

Na Fase 2A o backend do editor passou a expor comandos/queries separados e validacao forte no servidor.

Na Fase 2B o frontend precisava melhorar UX sem quebrar o fluxo existente:

- reduzir perda de alteracoes (autosave)
- manter controle explicito pelo usuario (botao salvar)
- evitar flood de requests durante edicao
- preservar compatibilidade com endpoint legado de save completo

## Decisao

Adotar coexistencia de autosave e save manual no `EditorShell`:

- Autosave com debounce (`1000ms`) e fila local de commands
- Mutacoes de grafo da UI usam `POST /api/projects/[projectId]/editor-commands` com payload novo `{ command }`
- Save manual continua com `PUT /api/projects/[projectId]/working-snapshot`
- Estado de persistencia explicito e separado do estado do grafo:
  - `saved`
  - `dirty`
  - `saving`
  - `error`
- `beforeunload` quando houver alteracoes pendentes (`dirty`/`saving`)

Tambem foi adotado um `requestId` local para evitar regressao do estado de save por respostas obsoletas.

## Consequencias

- Positivas:
  - UX mais segura (autosave) sem remover o botao de salvar
  - menor acoplamento entre estado visual do grafo e estado de persistencia
  - integracao direta com CQRS leve da Fase 2A
  - falhas de rede/backend ficam visiveis e com retry manual
- Negativas:
  - maior complexidade local no `EditorShell` (fila + debounce + estado de save)
  - viewport ainda depende de save manual para persistencia completa (na ausencia de command de viewport)

## Trade-offs e limites atuais

- O frontend reaproveita command processor compartilhado para validar/aplicar mutacao localmente antes do autosave.
- Isso reduz divergencia com o backend, mas nao substitui a validacao do servidor.
- Nao foi introduzido state manager global; a solucao permanece local ao editor por simplicidade.
