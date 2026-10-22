# Daynori

**Your day, gathered.** A customizable home for notes, routines, tasks, journals, files, and the things that make up everyday life.

Daynori is a **provisional working name**. Brand, domain, trademark, and store clearance remain open. See [naming](docs/product/naming.md).

## Current state

The repository contains the Next.js web app, Expo mobile app, Fastify API, durable worker, shared domain/sync packages, and substantial organizer functionality. **It is not a fully verified or deployed product.** Phase 60 Android/web verification is active; hardware, live providers, security/dependency findings, and release evidence remain open. Read the [progress register](docs/roadmap/progress.json) and [current verification report](docs/phase-reports/phase-60.md) for actual results.

The initial target is a responsive web application and an Android application. iOS follows a separate feasibility and release gate. A focused personal organizer ships before the encrypted vault, Drive integration, shared rooms, and AI.

The owner selected a **$0 testing preview**. Its Supabase project and 74-entry
managed schema are verified, including the restricted TLS runtime login;
The [web preview](https://daynori-web-preview.onrender.com) and
[API readiness endpoint](https://daynori-api-preview.onrender.com/v1/ready) are
live on Render Free. Signed-in cloud journeys, the standalone Android download
and physical-phone verification remain pending. The free
profile excludes uploads/audio attachments and reminder delivery, with visible
in-app limits. Follow the [deployment handoff](infra/deployment/README.md).

## Start here

1. Read the [documentation index](docs/README.md) and [product requirements](docs/product/requirements.md).
2. Review the [system architecture](docs/architecture/system-overview.md) and [design direction](docs/design/design-system.md).
3. Use the [roadmap](docs/roadmap/README.md) and the individual phase instructions. Continue the active **Phase 60** audit and [testing deployment handoff](infra/deployment/README.md); do not infer completion from implemented scaffolding or begin Phase 63.
4. Follow [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md). A handoff recipe is in [the contributor handoff](docs/engineering/handoff.md).

Open [the interactive blueprint](docs/blueprint.html) in a browser to explore the architecture and phase groups. It is a self-contained planning aid, not an application prototype.

## Established stack

- Mobile: Expo SDK 52 and React Native 0.76, targeting Android first (`apps/mobile`).
- Web: Next.js 15 and React 18, with responsive browser interfaces (`apps/web`).
- Shared: TypeScript domain rules, contracts, API client, sync protocol, and design tokens (`packages/*`).
- Backend: Fastify modular monolith (`apps/api`) and background worker lifecycle scaffold (`apps/worker`; durable queue processing and persistence scheduled for later phases).
- Managed foundation: Supabase Auth, PostgreSQL, and private object storage planned for database phases.
- Offline: SQLite on mobile, IndexedDB in the web client, and an application-owned synchronization protocol.

See the [decision records](docs/decisions/README.md) for tradeoffs and the [source register](docs/research/sources.md) for official references.

## Delivery discipline

Each phase has a bounded scope, dependencies, acceptance checks, a documentation report, and one professional local commit after validation. Never call an unchecked phase complete. Failed checks and prerequisites are recorded before work proceeds. GitHub can be connected when the owner provides the remote URL.

Available workspace commands:

```powershell
pnpm install             # Install all workspace dependencies cleanly
pnpm build               # Build all packages and applications
pnpm typecheck           # Run strict TypeScript checks across workspaces
pnpm test                # Run unit, contract, integration, security, and performance tests
pnpm lint                # Run ESLint across codebases
pnpm format:check        # Check formatting with Prettier
node scripts/validate-planning.mjs  # Validate planning, roadmap, and documentation links
```
