# MapIA

<div align="center">

# MapIA
**Enterprise software for mapping information architecture, processes, and system relationships through a canonical, multi-view model**

[![Product](https://img.shields.io/badge/Product-Enterprise%20Atlas-6F2DBD)](#)
[![Status](https://img.shields.io/badge/Status-Active%20Development-FF7A00)](#)
[![Architecture](https://img.shields.io/badge/Architecture-Canonical%20Multi--View-5B2EFF)](#)
[![Observability](https://img.shields.io/badge/Observability-OTel%20Ready-FF2DA6)](#)

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](#)
[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](#)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](#)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma&logoColor=white)](#)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-336791?logo=postgresql&logoColor=white)](#)
[![Zod](https://img.shields.io/badge/Zod-Validation-3E67B1)](#)
[![OpenTelemetry](https://img.shields.io/badge/OpenTelemetry-Ready-6F2DBD?logo=opentelemetry&logoColor=white)](#)
[![Playwright](https://img.shields.io/badge/Playwright-E2E-2EAD33?logo=playwright&logoColor=white)](#)
[![Vitest](https://img.shields.io/badge/Vitest-Test-6E9F18?logo=vitest&logoColor=white)](#)
[![License](https://img.shields.io/badge/license-Private-informational)](#)

</div>

---

## What is MapIA?

MapIA is not a generic diagram editor.

It is an **enterprise-grade platform** designed to map **information structures, processes, and real system relationships** through multiple views built on top of a **single canonical model**.

The product is being shaped as a **living atlas** for organizations that need more than disconnected diagrams. Instead of creating static drawings with no operational meaning, MapIA aims to provide a structured, extensible, and semantically-aware environment where teams can model, understand, evolve, and eventually synchronize the architecture of their systems.

---

## Product vision

MapIA is being built around a simple but powerful idea:

> **Different views should represent the same underlying reality, not disconnected files.**

That means:

- a process flow should not live separately from the information structure it affects
- a hierarchical map should not be disconnected from the operational logic behind it
- future technical views such as ERD, graph, timeline, API mapping, and system integration should evolve from the same canonical core

The long-term vision is for MapIA to become a **system intelligence layer**, not just a canvas.

---

## Core principles

- **Canonical model first**  
  All views should project the same underlying graph/snapshot model.

- **Enterprise semantics over generic drawing**  
  The platform should understand what the user is modeling, not just render boxes and lines.

- **Creation Assistant over shallow setup flows**  
  The product should guide creation with meaningful context and defaults.

- **Extensible architecture**  
  Domain, application, infrastructure, and UI should evolve without collapsing into spaghetti.

- **Operational readability**  
  The software should feel useful to analysts, architects, process owners, and technical teams.

---

## Current product direction

### First-class views in the current evolution

MapIA is currently prioritizing these views as the first strong product delivery:

- **Flowchart / Process**
- **Mind Map**
- **Tree / Hierarchy**

These are the first views being treated as **first-class product modes**, each with its own:

- semantic rules
- layout behavior
- rendering strategy
- editor behavior
- creation experience
- persistence consistency

### Future views

The platform is also being designed to expand into:

- **ERD**
- **Graph**
- **Timeline**
- **Sitemap**
- **API and system mapping**
- **Data lineage / relationship intelligence**

---

## Why MapIA exists

Most teams still work with documentation and diagrams that become stale almost immediately.

Traditional tools often fail because they are:

- too generic
- visually flexible but semantically empty
- disconnected from real system structure
- hard to evolve into something operational
- useful for workshops, but weak as living architectural products

MapIA exists to move beyond that.

It is being designed to support:

- **information architecture mapping**
- **process modeling**
- **structural decomposition**
- **system-oriented relationships**
- **versioned snapshots**
- **semantic validation**
- **future synchronization with external sources**

---

## Main capabilities

### Already present or being actively consolidated

- multi-view architecture over a canonical graph model
- project creation flow with assisted setup
- editor snapshot persistence
- semantic policy and audit foundations
- versioning and snapshot history
- diagram-specific layout infrastructure
- Prisma/PostgreSQL persistence
- OpenTelemetry-ready observability foundation
- typed contracts and validation with Zod
- E2E and unit testing foundations

### Product-level goals

- first-class view behavior instead of generic diagram behavior
- stronger product language and UX consistency
- more intelligent editing flows
- deeper semantic validation by diagram type
- future real-source import and synchronization
- structured export to JSON and downstream systems

---

## Architecture overview

MapIA is structured to support long-term product evolution.

### High-level layers

- **Domain**  
  Canonical contracts, semantic rules, graph invariants, diagram types

- **Application**  
  Use cases, orchestration, creation flow, editor commands, import flows

- **Infrastructure**  
  Prisma, database access, observability, runtime integrations

- **UI**  
  Dashboard, Creation Assistant, editor, diagram renderers, product workflows

### Architectural goals

- keep raw external formats away from the UI
- preserve canonical graph integrity
- let views evolve without duplicating domain truth
- support stronger semantics over time
- avoid coupling product behavior to ad hoc visual implementations

---

## Tech stack

- **Next.js 16**
- **React 19**
- **TypeScript 5**
- **Prisma**
- **PostgreSQL**
- **Zod**
- **NextAuth**
- **React Flow / XYFlow**
- **OpenTelemetry**
- **Playwright**
- **Vitest**

---

## Repository structure

```text
app/                      # Next.js app router pages and route handlers
docs/                     # Architecture, ADRs, domain notes, product evolution docs
prisma/                   # Prisma schema, migrations, seed
public/                   # Static assets
scripts/                  # Operational and validation scripts
src/
  components/             # UI components, editor, renderer pieces
  domain/                 # Canonical shared contracts
  lib/                    # Shared utilities
  modules/                # Business modules by bounded concern
  server/                 # Server composition, DB, auth, observability
tests/
  e2e/                    # Playwright end-to-end tests
```

---

## Product philosophy

MapIA should feel like **software with structure**, not a collection of screens.

That means every important decision should reinforce:

- product clarity
- semantic coherence
- architectural extensibility
- operational usefulness
- visual identity by mode
- trustworthiness of persisted structure

This repository is not intended to evolve into “just another diagram tool”.
It is intended to become a **serious product for structural understanding and mapping**.

---

## Development setup

### Requirements

- **Node.js 20+**
- **pnpm**
- **Docker**
- **PostgreSQL** via Docker Compose

### Install dependencies

```bash
pnpm install
```

### Start the database

```bash
pnpm db:up
```

### Generate Prisma client

```bash
pnpm prisma:generate
```

### Run migrations

```bash
pnpm prisma:migrate
```

### Seed local database

```bash
pnpm db:seed
```

### Start development server

```bash
pnpm dev
```

If you want to wait for the database before starting:

```bash
pnpm dev:with-db
```

---

## Testing

### Unit tests

```bash
pnpm test
```

### Watch mode

```bash
pnpm test:watch
```

### E2E tests

```bash
pnpm test:e2e
```

### Editor-specific E2E

```bash
pnpm test:e2e:editor
```

---

## Formatting and static checks

### Lint

```bash
pnpm lint
```

### Type check

```bash
pnpm typecheck
```

### Format

```bash
pnpm format
```

### Check formatting

```bash
pnpm format:check
```

---

## Observability

MapIA includes an **OpenTelemetry-ready observability foundation** intended to support enterprise-grade runtime instrumentation over time.

This includes groundwork for:

- runtime bootstrap
- OTLP trace export
- metric export
- operational validation scripts
- import/telemetry evolution
- low-friction future monitoring expansion

Examples:

```bash
pnpm observability:validate
pnpm observability:apply:dry-run
pnpm observability:post-apply:smoke
```

---

## Product status

MapIA is under active evolution toward a stronger enterprise product shape.

### What is currently happening

- consolidating the **Creation Assistant** as the official creation flow
- removing ambiguous legacy naming and product concepts
- promoting **Flowchart**, **Mind Map**, and **Tree** into true first-class views
- strengthening semantic behavior and visual identity per mode
- preparing the platform for richer exports and future real-source integration

### What matters now

The current goal is not to build a shallow MVP.

The goal is to build a product foundation solid enough to support:

- strong product identity
- high-confidence structural modeling
- future integrations
- durable enterprise growth

---

## Roadmap direction

### Near-term priorities

- Creation Assistant consolidation
- Flowchart as a first-class process view
- Mind Map as a first-class ideation/association view
- Tree as a first-class hierarchy/information view
- stronger editor behavior by diagram mode
- clearer product language throughout the platform

### Mid-term priorities

- richer canonical model
- better export structures
- more advanced semantic validation
- source import hardening
- synchronization and drift detection
- governance and operational controls

### Long-term direction

- connected architecture atlas
- live system mapping
- process + information + technical relationship intelligence
- enterprise collaboration and governance
- multi-source structural synchronization

---

## Contributing

This repository is evolving with a strong product and architecture direction.
Contributions and internal changes should follow these principles:

- do not reduce the product to a generic editor
- do not introduce temporary abstractions that weaken the domain
- prefer product coherence over local technical convenience
- keep canonical truth centralized
- design for future expansion without losing clarity

---

## Internal notes

This project values:

- robust modeling
- explicit semantics
- product consistency
- architecture that can grow without losing shape

If a solution is technically clever but weakens product coherence, it is not the right solution.

---

## License

Private repository. All rights reserved.

---

<div align="center">

**MapIA**  
Mapping information with structure, meaning, and product-grade clarity.

</div>
