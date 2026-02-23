# ADR-001: Arquitetura base do MVP

- Status: Aceito
- Data: 2026-02-23

## Contexto

O MapIA precisa evoluir rapidamente (wizard + editor + importadores + versionamento), sem acoplar UI ao formato das integracoes externas e sem duplicar modelos por view.

## Decisao

Adotar:

- Next.js App Router + TypeScript para web app.
- Modelo canonico unico (`Node`, `Edge`, `ExternalRef`) como contrato central.
- Estrutura modular por dominio com camadas `domain`, `application`, `infrastructure`.
- Prisma + PostgreSQL para persistencia do MVP.
- NextAuth com credenciais de desenvolvimento (JWT) na Fase 0, sem adapter Prisma.

## Consequencias

### Positivas

- Menor risco de acoplamento acidental entre UI e importadores.
- Base pronta para multiplas views sobre o mesmo grafo.
- Entregas incrementais com menor retrabalho.

### Negativas

- Fase 0 nao persiste login/usuarios em banco.
- Alguns modulos de `application/infrastructure` permanecem como placeholders estruturais.

## Alternativas consideradas

- Modelos separados por view (rejeitado): aumenta inconsistencias e custo de sincronizacao.
- UI dirigindo schema de importador (rejeitado): alto acoplamento e baixa evolutividade.
- NextAuth com adapter Prisma ja na Fase 0 (adiado): aumenta escopo inicial sem beneficio imediato para bootstrap.
