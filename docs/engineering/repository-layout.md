# Repository layout and ownership

The project lives in this `dailyLIfe` directory. Phase 00 establishes the layout and documentation; placeholder directories are reservations, not delivered packages. Phase 01 creates workspace manifests, pins compatible versions, and makes scripts executable. Generated applications are not included in Phase 00.

```text
dailyLIfe/
  AGENTS.md
  README.md
  CONTRIBUTING.md
  CHANGELOG.md
  apps/
    web/                    # Next.js responsive web UI and browser adapters
    mobile/                 # Expo/React Native Android UI and native adapters
    api/                    # Fastify HTTP API and backend feature modules
    worker/                 # Durable jobs, reminders, scans, exports, integrations
  packages/
    domain/                 # Framework-independent rules and value objects
    contracts/              # Versioned validation schemas, DTOs, events, errors
    api-client/             # Typed transport, auth hooks, retry/cancellation
    sync/                   # Mutation/cursor/conflict protocol and local-store ports
    design-tokens/          # Semantic color, typography, spacing, motion tokens
    ui-web/                 # Accessible web components
    ui-mobile/              # Native accessible components
    config/                 # Strict TS, linting, formatting, test configuration
    test-utils/             # Synthetic factories, clocks, auth contexts, test helpers
  infra/
    supabase/               # Local configuration, reviewed migrations, RLS tests
    deployment/             # Environment templates and deploy/recovery definitions
  tests/
    contract/               # Client/server schema compatibility
    integration/            # Real DB, authorization, jobs, provider adapter boundaries
    e2e/                    # Web/mobile user journeys with synthetic accounts
    security/               # Tenant isolation, revocation, uploads, vault gates
    performance/            # Load, large lists, startup, memory, worker latency
  scripts/                  # Repeatable verification and development tooling
  docs/
    product/                # Requirements, naming, feature boundaries
    design/                 # UX, tokens, accessibility, platform behavior
    architecture/           # Systems, data, sync, security, integrations, operations
    decisions/              # Accepted/provisional/superseded ADRs
    roadmap/                # Phase specs, plan and progress
    phase-reports/          # Evidence for each phase
    engineering/            # Handoff, quality, release gates, ownership, risks
    templates/              # Phase report, ADR and defect templates
    research/               # Dated official source register
```

## Package boundaries

`domain` imports neither UI frameworks, network clients, databases, nor platform SDKs. It expresses invariants such as task deadline semantics, folder ancestry, money values, and routine occurrences. Its tests use deterministic clocks and fixtures.

`contracts` owns externally exchanged shapes and schema validation. It cannot expose database rows as an accidental API or depend on an app. Contract changes include compatibility and migration decisions. `api-client` consumes those contracts and receives credentials through a platform adapter; it does not own user sessions or storage.

`sync` depends on domain rules and contracts and defines ports for local storage, transport, clocks, and connectivity. SQLite and IndexedDB adapters live with their platform clients. Sync cannot import a screen component, provider SDK, or API database repository. Platform encryption and key access remain behind separate vault adapters.

`design-tokens` contains semantic values and theme contracts. `ui-web` and `ui-mobile` consume them without pretending browser controls and native controls share implementation. UI packages expose accessible primitives and states; feature workflows live in apps. `test-utils` never ships real user data or pulls test dependencies into production entrypoints.

The API and worker share domain/contracts, but authorization, persistence and integrations remain backend code. Start with API modules and worker jobs in one deployable backend family; extract a shared backend library only when actual duplication requires it and an ADR identifies its owner. The worker must not import HTTP route registration or receive blanket authorization through a queued user ID.

## Feature structure within apps

Prefer vertical feature directories: `notes`, `tasks`, `routines`, `journal`, `library`, `sections`, `expenses`, `calendar`, `rooms`, and later `assistant`/`vault`. Each feature owns its UI composition or API handlers, application services, repository ports, adapter implementation, and focused tests as appropriate to that app. Cross-feature reads use a defined contract/query service rather than another module's private tables or component internals.

Shared container identity, memberships and folder behavior are documented in the [data model](../architecture/data-model.md). Do not make a universal unvalidated JSON object replace typed feature models. User-created sections compose approved blocks; custom code execution is outside scope.

## Persistence and infrastructure

Keep SQL migration history in `infra/supabase/`. Schema authors review tenant constraints, RLS, indexes, and compatibility together; generated Drizzle artifacts must align with the reviewed SQL source. Pin the schema workflow in Phase 01 or its dedicated database phase and do not maintain competing migration authorities.

Use `.env.example` for names and safe placeholders only. Local secrets, actual exports, audio, uploaded documents, emulator caches, build artifacts, and private screenshots stay ignored. Deployment files distinguish local, staging and production. No production credentials or resources are created as part of this layout.

## Documentation map

Read [system overview](../architecture/system-overview.md) for runtime boundaries, [API conventions](../architecture/api-conventions.md) for public interfaces, and [operations](../architecture/operations-and-scaling.md) for storage, jobs and scaling. [Quality](quality.md) assigns evidence to test layers; [handoff](handoff.md) defines the phase completion workflow. Add ownership and setup instructions to each package's README when it becomes real.
