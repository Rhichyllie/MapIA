This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project loads Manrope and IBM Plex Mono via [`next/font/local`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts), with the `.woff2` assets stored in `public/fonts` so builds stay offline-friendly and do not depend on Google Fonts.

On Windows, Python subprocess calls may need an explicit pnpm wrapper for observability scripts.
Use `--pnpm-cmd .\pnpm.cmd` when `pnpm` is available in the terminal but not resolvable by `subprocess`.
You can also pass an absolute path to `pnpm.cmd` in CI when the wrapper is outside the default PATH lookup.
For `dev_local`, prefer `pnpm observability:4e9r:run:dev-local:win` to avoid pnpm/Node argument parsing issues on Windows.
If you need extra flags without pnpm forwarding, set `MAPIA_4E9R_DEV_LOCAL_ARGS` and then run the `:win` script.
The `:win` wrapper also creates default local apply destinations automatically, so the preconditions gate does not fail just because the four filesystem destination args were omitted.
For one-off advanced invocations, call `python infra/observability/scripts/run-4e9r-real.py --require-ready-env --environment-scope dev_local --strict-ready-mode skip_in_dev_local --pnpm-cmd .\pnpm.cmd ...` directly.

## Semantic Backend (Fase 5.7)

MapIA now enforces semantic rules on the server using a shared engine (`src/modules/semantics/domain/semantic-engine.ts`) consumed by both backend and frontend.

Core capabilities:

- project-scoped semantic policy (`semantic_policies`) with lazy create and server enforcement flags;
- append-only semantic audit/compliance log (`semantic_event_logs`);
- optimistic concurrency for working snapshot writes via `expectedRevision` + `newRevision`;
- semantic enforcement on edge/node writes, full snapshot save, Prisma import, and snapshot restore.

New API surfaces:

- `GET/PUT /api/projects/:id/semantic/policy`
- `POST /api/projects/:id/semantic/validate`
- `POST /api/projects/:id/semantic/audit`
- `POST /api/projects/:id/edges`
- `PUT /api/projects/:id/edges/:edgeId`
- `PUT /api/projects/:id/nodes/:nodeId`

See architectural rationale in `docs/adrs/ADR-018-fase57-semantic-policy-enforcement-and-audit.md`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
