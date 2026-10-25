<div align="center">

<img src="assets/brand/daynori-logo.png" alt="Daynori logo" width="320" />

# Daynori

**Your day, gathered.**

A personal organizer for notes, routines, tasks, journals, files, and the things that make up everyday life.

[![License: All Rights Reserved](https://img.shields.io/badge/License-All%20Rights%20Reserved-red.svg)](#license)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Expo](https://img.shields.io/badge/Expo_SDK-52-000020?logo=expo&logoColor=white)](https://expo.dev/)
[![React Native](https://img.shields.io/badge/React_Native-0.76-61DAFB?logo=react&logoColor=black)](https://reactnative.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-Managed-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Node.js](https://img.shields.io/badge/Node.js-24-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)

[Web Preview](https://daynori-web-preview.onrender.com) · [Android APK](https://github.com/mkamrul9/dayNori/releases/download/preview-2026-10-22/daynori-preview-arm64.apk) · [API Health](https://daynori-api-preview.onrender.com/v1/ready) · [Documentation](docs/README.md)

</div>

---

## Overview

Daynori is a cross-platform personal organizer that brings together your notes, tasks, routines, journal entries, calendar events, and files into one unified workspace. Built as a monorepo with shared domain logic, it targets **Android** and **responsive web** first, with iOS gated behind a separate feasibility review.

> **Status:** Active development — testing preview with open release gates. Web, mobile, API, worker, and shared-package implementations exist; their presence does not establish that every function is ready. The [Version 2 roadmap](docs/roadmap/v2/README.md) defines redesign, learning, support, mobile, notifications, and assistant work. Phase 65 published a [function register](docs/roadmap/v2/function-register.json) and [readiness baseline](docs/roadmap/v2/readiness-baseline.md); see the [progress register](docs/roadmap/progress.json) for actual results.

## Features

| Module           | Description                                                                           |
| ---------------- | ------------------------------------------------------------------------------------- |
| 📝 **Notes**     | Rich typed notes with formatting, autosave, offline drafts, and conflict resolution   |
| ✅ **Tasks**     | Prioritized tasks with deadlines, subtasks, timezone-aware due dates, and smart views |
| 🔄 **Routines**  | Daily/weekly recurring checklists with per-occurrence tracking and completion history |
| 📓 **Journal**   | Personal journal entries with mood tracking, templates, and private reflection        |
| 📁 **Files**     | File uploads organized within the workspace folder hierarchy                          |
| 📅 **Calendar**  | Events with timezone-aware scheduling integrated across modules                       |
| 💰 **Expenses**  | Expense tracking and categorization                                                   |
| 🔐 **Vault**     | Encrypted storage for sensitive content _(planned)_                                   |
| 🔍 **Search**    | Cross-module full-text search with filters                                            |
| 🏠 **Sections**  | User-composed dashboard views with customizable block layouts                         |
| 🎙️ **Audio**     | Voice capture and audio attachments                                                   |
| 🔔 **Reminders** | Scheduled notifications across all item types                                         |

## Architecture

```
daynori-monorepo/
├── apps/
│   ├── web/            # Next.js 15 · React 18 · responsive PWA
│   ├── mobile/         # Expo SDK 52 · React Native 0.76 · Android-first
│   ├── api/            # Fastify modular monolith · REST API
│   └── worker/         # Durable background job processor
├── packages/
│   ├── domain/         # Shared business rules and validation
│   ├── contracts/      # API contracts and type-safe schemas
│   ├── api-client/     # Generated type-safe API client
│   ├── sync/           # Offline-first synchronization protocol
│   ├── design-tokens/  # Shared design system tokens
│   ├── config/         # Shared configuration utilities
│   ├── ui-web/         # Web component library
│   ├── ui-mobile/      # Mobile component library
│   └── test-utils/     # Shared test utilities and fixtures
├── docs/               # Product specs, architecture, decisions, roadmap
├── infra/              # Deployment configuration and scripts
├── supabase/           # Database migrations and managed schema
└── tests/              # Integration, contract, security, and performance tests
```

### Design Principles

- **Offline-first** — SQLite on mobile, IndexedDB on web, with a custom sync protocol
- **Strict TypeScript** — No `any` types; validated inputs at every trust boundary
- **Shared domain logic** — Business rules live in `packages/domain`, reused across all platforms
- **Module boundaries** — Platform adapters isolate web and mobile concerns
- **Workspace-scoped** — Every request, object, and query is scoped to the authorized workspace

## Tech Stack

| Layer        | Technology                                                  |
| ------------ | ----------------------------------------------------------- |
| **Web**      | Next.js 15, React 18, responsive PWA with service worker    |
| **Mobile**   | Expo SDK 52, React Native 0.76, Android first               |
| **API**      | Fastify modular monolith with route-level authorization     |
| **Database** | Supabase PostgreSQL with 74-entry managed schema            |
| **Auth**     | Supabase Auth with restricted TLS runtime login             |
| **Storage**  | Supabase private object storage                             |
| **Offline**  | SQLite (mobile), IndexedDB (web), custom sync protocol      |
| **Worker**   | Durable background job processor                            |
| **Language** | Strict TypeScript throughout                                |
| **Monorepo** | pnpm workspaces                                             |
| **Testing**  | Vitest — unit, contract, integration, security, performance |
| **CI/CD**    | GitHub Actions (CI + security workflows)                    |

## Getting Started

### Prerequisites

- **Node.js** ≥ 24.21.0
- **pnpm** ≥ 9.0.0
- **Android Studio** _(for mobile development)_

### Installation

```bash
# Clone the repository
git clone https://github.com/mkamrul9/dayNori.git
cd dayNori

# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env
# Edit .env with your Supabase credentials
```

### Development

```bash
# Start the web app
pnpm dev:web

# Start the API server
pnpm dev:api

# Start the mobile app (requires Android emulator or device)
pnpm dev:mobile

# Start the background worker
pnpm dev:worker
```

### Validation

```bash
pnpm build               # Build all packages and applications
pnpm typecheck            # Strict TypeScript checks across workspaces
pnpm test                 # Unit, contract, integration, security, performance tests
pnpm lint                 # ESLint across all codebases
pnpm format:check         # Prettier formatting check
pnpm audit                # Secret scanning + dependency audit
node scripts/validate-planning.mjs   # Validate planning and documentation
```

## Testing Preview

A **$0 testing preview** is available:

| Platform   | Link                                                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 🌐 Web     | [daynori-web-preview.onrender.com](https://daynori-web-preview.onrender.com)                                                             |
| 📡 API     | [daynori-api-preview.onrender.com/v1/ready](https://daynori-api-preview.onrender.com/v1/ready)                                           |
| 📱 Android | [Download APK](https://github.com/mkamrul9/dayNori/releases/download/preview-2026-10-22/daynori-preview-arm64.apk) _(ARM64, Android 7+)_ |

> The free-tier preview excludes uploads/audio attachments and reminder delivery, with visible in-app limits.

## Documentation

| Document                                                    | Description                                         |
| ----------------------------------------------------------- | --------------------------------------------------- |
| [Documentation Index](docs/README.md)                       | Start here                                          |
| [Product Requirements](docs/product/requirements.md)        | Acceptance criteria for every module                |
| [System Architecture](docs/architecture/system-overview.md) | System design and component boundaries              |
| [Design System](docs/design/design-system.md)               | Visual direction, palette, and typography           |
| [Roadmap](docs/roadmap/README.md)                           | Phased delivery plan                                |
| [Decision Records](docs/decisions/README.md)                | Architectural tradeoffs and rationale               |
| [Contributing](CONTRIBUTING.md)                             | Work cycle and commit format                        |
| [Interactive Blueprint](docs/blueprint.html)                | Explorable architecture diagram _(open in browser)_ |

## Roadmap

Daynori follows a phased delivery model. Each phase has bounded scope, dependencies, acceptance checks, and produces one documented commit after validation. The original **00–63** plan is preserved, including blocked release gates. The [detailed Version 2 roadmap](docs/roadmap/v2/README.md) appends **64–103**; Phase 64 is planning and Phase 65 is the next implementation phase when selected by the owner.

Key phase groups:

- **Phases 01–04** — Foundation, tooling, CI/CD, and quality gates
- **Phases 09–15** — Auth, organization, workspace hierarchy
- **Phases 16–26** — Core modules (notes, tasks, routines, journal, files, calendar)
- **Phases 27–33** — Reminders, personalization, search, knowledge base
- **Phases 34–43** — Quality, accounts, expenses, audio, sections
- **Phases 44–56** — Vault, Drive integration, shared rooms, AI _(planned)_
- **Phases 57–60** — Commercial readiness, release verification

See the full [roadmap](docs/roadmap/README.md) and [progress register](docs/roadmap/progress.json).

## Contributing

This is a proprietary project. External contributions are **not accepted** at this time.

If you're interested in the project or have questions, please reach out through [GitHub Issues](https://github.com/mkamrul9/dayNori/issues).

For internal contributors, see [CONTRIBUTING.md](CONTRIBUTING.md) and [the handoff guide](docs/engineering/handoff.md).

## License

**Copyright © 2026 Md Kamrul Islam. All Rights Reserved.**

This software is proprietary. No license, right, or interest is granted to any person or entity. You may not copy, modify, distribute, sublicense, or use this software in whole or in part without prior written authorization from the copyright holder.

The availability of source code in a public repository does **not** constitute a grant of any license or permission. Public visibility is provided solely for review, transparency, and portfolio purposes.

See [LICENSE](LICENSE) for the full terms.

---

<div align="center">

**Daynori** · Built with care by [Md Kamrul Islam](https://github.com/mkamrul9)

</div>
