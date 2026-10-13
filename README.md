# Daynori

**Your day, gathered.** A customizable home for notes, routines, tasks, journals, files, and the things that make up everyday life.

Daynori is a **provisional working name**. Brand, domain, trademark, and store clearance remain open. See [naming](docs/product/naming.md).

## Current state

Phase 00 establishes the product specification, architecture, design direction, repository layout, and delivery roadmap. **There is no runnable application yet.** No cloud accounts, subscriptions, credentials, or deployments are configured by this phase.

The initial target is a responsive web application and an Android application. iOS follows a separate feasibility and release gate. A focused personal organizer ships before the encrypted vault, Drive integration, shared rooms, and AI.

## Start here

1. Read the [documentation index](docs/README.md) and [product requirements](docs/product/requirements.md).
2. Review the [system architecture](docs/architecture/system-overview.md) and [design direction](docs/design/design-system.md).
3. Use the [roadmap](docs/roadmap/README.md) and the individual phase instructions. The next phase is **01: Toolchain and workspace**.
4. Follow [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md). A handoff recipe is in [the contributor handoff](docs/engineering/handoff.md).

Open [the interactive blueprint](docs/blueprint.html) in a browser to explore the architecture and phase groups. It is a self-contained planning aid, not an application prototype.

## Proposed stack

- Mobile: Expo and React Native, with Android first.
- Web: Next.js and React, with dedicated responsive browser interfaces.
- Shared: TypeScript domain rules, contracts, API client, sync protocol, and design tokens.
- Backend: a Fastify modular monolith and a separate durable background worker.
- Managed foundation: Supabase Auth, PostgreSQL, and private object storage; application authorization remains explicit.
- Offline: SQLite on mobile, IndexedDB in the web client, and an application-owned synchronization protocol.

These are project decisions, not installed packages. Phase 01 pins supported versions after compatibility checks; feasibility phases validate higher-risk choices. See the [decision records](docs/decisions/README.md) for tradeoffs and the [source register](docs/research/sources.md) for official references.

## Delivery discipline

Each phase has a bounded scope, dependencies, acceptance checks, a documentation report, and one professional local commit after validation. Never call an unchecked phase complete. Failed checks and prerequisites are recorded before work proceeds. GitHub can be connected when the owner provides the remote URL.

Validate the planning repository with:

```powershell
node scripts/validate-planning.mjs
```

Application build/test commands become executable in Phase 01. [Verification](docs/engineering/quality.md) defines the later checks.
