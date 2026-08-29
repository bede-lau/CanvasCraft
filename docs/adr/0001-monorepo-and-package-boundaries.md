# ADR 0001 — pnpm workspace monorepo, with the branch template outside it

- **Status:** Accepted
- **Date:** 2026-08-29

## Context

CanvasCraft has five distinct deliverables that must share type contracts:
a browser client, a credential-holding orchestrator, a schema package, a
component registry, and a Vite starter that is *copied into a remote sandbox*
rather than executed locally. Node 24 and pnpm 10 are already installed.

The starter is the awkward one. It is source code we author, but it never runs
in this repo — it runs inside a Daytona sandbox with its own `node_modules`
baked into a Docker image.

## Decision

Use a pnpm workspace with `apps/*`, `packages/schema`, and `packages/registry`
as members.

**Exclude `packages/branch-template` from the workspace.** It keeps its own
`package.json` with real (non-`workspace:`) version ranges and is never linked
into the root `node_modules`.

## Rationale

If the starter were a workspace member, pnpm would hoist and symlink its
dependencies into the root store. The copy that reaches the sandbox would then
have a `package.json` whose dependencies resolve only through symlinks that do
not exist there, and the pre-baked snapshot's `node_modules` would drift from
what the starter declares. Excluding it makes the starter's dependency list the
literal, verifiable input to the Docker snapshot build.

## Consequences

- The snapshot Dockerfile can `COPY packages/branch-template/package.json` and
  `npm ci` against it with no workspace awareness. That file is the single
  source of truth for what the snapshot contains.
- Changing a starter dependency requires rebuilding the Daytona snapshot.
  `scripts/build-daytona-snapshot.mjs` hashes the starter's `package.json` into
  the snapshot tag so a drifted snapshot is detectable rather than silently wrong.
- The starter cannot import `@canvascraft/schema`. Any type it needs is
  duplicated as a plain interface in the starter. This is intentional: the
  generated app must have zero coupling to CanvasCraft.
- Root scripts must name filters explicitly (`pnpm --filter @canvascraft/web`)
  rather than relying on `-r` reaching the starter.

## Alternatives rejected

- **Single flat Vite app with an Express server bolted on.** Loses the type
  contract between client and orchestrator, which is the part most likely to
  break under AI-generated payloads.
- **Turborepo/Nx.** Real caching value at larger scale, but adds a config
  surface and a daemon for a five-package repo. pnpm filters are sufficient.
- **Including the starter in the workspace and stripping symlinks at copy time.**
  A repair step that hides a category error; the snapshot would still be built
  from a resolution graph the sandbox does not have.
