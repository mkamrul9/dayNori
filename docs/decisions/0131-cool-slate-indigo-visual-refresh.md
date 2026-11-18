# ADR 0131: Day Path visual identity and core interface refresh

- Status: Accepted by owner direction, revised after the owner requested a more creative logo and color treatment on 2026-11-18.
- Scope: Bounded Web/PWA core visual design and shared mobile identity.

## Context

The owner rejected the warm paper and green palette and found the navigation, boxed surfaces, and dark mode visually dated. The prior direction in ADR 0069 and `docs/design/design-system.md` is superseded for current UI work.

## Decision

Use cool lilac surfaces, ink text, violet actions, and coral accents in light mode; use midnight surfaces, lavender actions, and soft coral accents in dark mode. Generate one rounded D with a rising path and sun into web, PWA, and native assets. The mark remains readable in one color for notification and accessibility contexts. Shared semantic tokens remain the source of truth for both platforms. Core navigation uses fewer visible boundaries, a subtle violet-to-coral selected state, and a quiet ambient background; the main Create action uses a contrast-checked violet-to-coral gradient. Today cards use tonal separation and tighter padding. Motion remains short and is disabled for reduced-motion users.

The visual hierarchy draws on documented patterns: Todoist keeps Today and upcoming work close to the primary navigation ([Today view](https://www.todoist.com/help/todoist/get-started/plan-your-day-with-the-today-view-UVUXaiSs)); Linear's refresh describes softer boundaries and improved scanning ([design refresh](https://linear.app/now/behind-the-latest-design-refresh)); Amie combines tasks with time planning ([tasks](https://amie.so/documentation/features/tasks)). No logos, illustrations, layouts, or source assets are copied.

## Consequences

Existing screenshots and the Phase 67 warm palette specification are historical. The current palette needs rendered desktop/mobile visual review, Bangla readability review, and a rebuilt release candidate. This change does not clear the Phase 130 staging, operational, or owner launch gates.
