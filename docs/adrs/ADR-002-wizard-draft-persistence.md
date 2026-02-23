# ADR-002: Persistencia de rascunho do Wizard

- Status: Aceito
- Data: 2026-02-23

## Contexto

O wizard da Fase 1 precisa persistir estado parcial com steps, branching e status sem inflar `Project` com campos temporarios.

## Decisao

Criar tabela dedicada `WizardDraft` (relacao 1:1 opcional com `Project`) contendo:

- `status`
- `currentStep`
- `payload` JSON (validado por Zod)
- `lastError`

## Consequencias

- Positivas: evolucao do wizard desacoplada de `Project`, branching mais simples.
- Negativas: camada adicional de repositorio/mapeamento Prisma.
