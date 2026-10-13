# Architecture index

Status: Phase 00 design baseline. Last reviewed: 2026-10-13 (Asia/Dhaka).

These documents specify the intended system. They do not certify implemented security, availability, regulatory compliance, or store approval. Dependency versions and vendor capabilities must be verified during the relevant implementation phase and recorded in its completion report.

Read in this order:

1. [System overview](system-overview.md): deployment units, dependency rules, platform differences.
2. [Data model](data-model.md): tenant ownership, folder rules, domain entities, time and money.
3. [Sync and offline](sync-and-offline.md): operation receipts, version conflicts, commit-ordered cursors, deletion.
4. [Security and vault](security-and-vault.md): authorization, storage access, encryption, recovery, abuse.
5. [API conventions](api-conventions.md): requests, responses, authentication, limits, compatibility.
6. [Integrations and reminders](integrations-and-reminders.md): notifications, calendar, Drive, AI, rooms.
7. [Operations and scaling](operations-and-scaling.md): jobs, recovery, observability, budgets and capacity gates.
8. [Decision records](../decisions/README.md): why the major choices were made and when to revisit them.

## Authority and change control

- Product scope and the phased roadmap determine what to build next. An architectural provision for a future feature is not authorization to build it early.
- Keep implementation and contract details in the phase that introduces them. Update these documents when a phase changes a boundary or invariant; record major changes in an ADR.
- A phase is incomplete when its data isolation, recovery, accessibility, or migration checks have only been described rather than exercised.
- Do not provision vendors, purchase plans, create cloud projects, enable paid AI, or publish an app during the planning phase.

## Required proof before selecting the native dependency set

The first executable foundation must prove Expo development builds on a physical Android device, encrypted SQLite/key lifecycle, typed domain adapters on Next.js and Expo, private upload/download, an API transaction under the restricted database role, and restart-safe local scheduling. Pin compatible versions only after this proof. Use development builds for native capabilities; Expo Go is not the release acceptance environment.

Vault cryptography, arbitrary Drive folder mirroring, exact Android alarms, and room live collaboration each require their own later decision gate. Unsupported capabilities must be visible in the UI and release documentation.
