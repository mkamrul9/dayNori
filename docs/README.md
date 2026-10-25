# Documentation index

Read [the product brief](product/product-brief.md), [requirements](product/requirements.md), [system overview](architecture/system-overview.md), and [the roadmap](roadmap/README.md) first. These describe planned work; the [progress register](roadmap/progress.json) and [phase reports](phase-reports/README.md) establish actual delivery.

[The interactive blueprint](blueprint.html) offers a browser-readable architecture and phase explorer with all plan data included locally. Rebuild it from the canonical plan with node scripts/build-blueprint.mjs when phase specifications change. It is a planning aid, not a running product.

## Product and experience

- [Product overview](product/README.md), [product brief](product/product-brief.md), and [testable requirements](product/requirements.md).
- [Provisional name and clearance](product/naming.md).
- [Information architecture](design/information-architecture.md) and [user journeys](design/journeys.md).
- [Design system direction](design/design-system.md) and [accessibility acceptance](design/accessibility.md).

## System and data

- [Architecture index](architecture/README.md) and [system overview](architecture/system-overview.md).
- [Logical data model](architecture/data-model.md), [API conventions](architecture/api-conventions.md), and [offline synchronization](architecture/sync-and-offline.md).
- [Security and encrypted vault](architecture/security-and-vault.md).
- [Files, Drive, notifications and AI integration boundaries](architecture/integrations-and-reminders.md).
- [Operations and scaling](architecture/operations-and-scaling.md) and [decision records](decisions/README.md).

## Delivery and verification

- [Version 2 roadmap](roadmap/v2/README.md): complete redesign, mobile layouts, action-based tours, feedback/support, notifications, and grounded text/voice assistant; planning first, then individually selected phases 65–103.
- [Roadmap and feature traceability](roadmap/README.md), [canonical machine-readable plan](roadmap/plan.json), and [progress](roadmap/progress.json).
- [Repository ownership](engineering/repository-layout.md), [contributor handoff](engineering/handoff.md), and [quality strategy](engineering/quality.md).
- [Release gates](engineering/release-gates.md), [risks and open decisions](engineering/risks-and-decisions.md), and [official source register](research/sources.md).
- [Phase evidence template](templates/phase-report.md), [ADR template](templates/adr.md), and [defect template](templates/defect.md).

## Keeping the docs truthful

Phase 00 is a specification baseline. It does not demonstrate runtime functionality, encryption correctness, scalability, policy acceptance, or store readiness. Phase reports record what was actually built and tested. Recheck dated external policy/platform sources when implementing the feature and before release. Refine the plan through documented decisions rather than silently changing completed phase history.
