# ADR 0005 — Daytona branches launch from a pre-baked Docker snapshot

- **Status:** Accepted
- **Date:** 2026-08-29

## Context

Three sandboxes must go from "create" to "loading in an iframe" fast enough to
carry a two-minute demo, and reliably enough that a flaky npm registry does not
end the presentation. The PRD names cold-start pressure and slow preview builds
as two separate risks with the same mitigation.

## Decision

Build a Docker image containing the branch starter **with `node_modules` already
installed**, publish it to Docker Hub, and register it as a Daytona **Snapshot**.
The Branch Manager creates all three sandboxes from that snapshot in parallel,
writes only the generated source files, and starts the dev server on one fixed
port.

## Rationale

The alternative — a default image that installs dependencies at boot — makes
every branch pay a 60–90 second install, three times, concurrently, over a
network we do not control, at the exact moment a judge is watching. Moving that
cost to build time removes it from the critical path entirely and makes the
demo's timing a property of our infrastructure rather than of npm's.

Pre-baking also makes the dependency set *auditable*. The snapshot is the
enforcement point for "one primitive stack, no Radix alongside Base UI, no
network libraries": if a package is not in the image, generated code cannot
import it, no matter what the model writes.

## Structure

- The image is built from `packages/branch-template/package.json`, which per
  ADR 0001 is the sole declaration of what a branch may depend on.
- The snapshot tag should embed a hash of that `package.json`, so operators can
  identify dependency drift before updating `DAYTONA_SNAPSHOT`. The preflight
  verifies that a snapshot is configured; branch startup remains the live
  compatibility check.
- One fixed preview port for all branches (`DAYTONA_PREVIEW_PORT`), so the
  starter's Vite config, the sandbox run command, and the preview-URL lookup all
  agree by construction.

## Consequences

- Docker and a Docker Hub login are required human setup for a first run and for
  any dependency change. Documented in `README.md`.
- Adding a dependency to generated branches is a deliberate, versioned act:
  edit the starter's `package.json`, rebuild, re-register, update `.env`. This
  friction is the point.
- Vite's host check will reject a proxied preview domain unless
  `server.allowedHosts` is configured; the starter sets this, and it is part of
  the snapshot rather than something generated code can get wrong.
- Sandbox lifecycle is explicit: auto-stop on inactivity to protect quota,
  champion retained on selection, non-champions stopped and archived.
- If a branch fails to start, its card surfaces the sandbox state and the dev
  server's log tail. Failures are shown, not swallowed.

## Alternatives rejected

- **Default image + runtime install.** Simpler setup, unacceptable demo risk.
- **Daytona declarative image build from a Dockerfile.** Removes the local
  Docker and registry requirement, but the build is remote and less inspectable,
  and the same image is needed on Docker Hub for reuse anyway. Kept as a
  documented fallback for a machine without Docker.
