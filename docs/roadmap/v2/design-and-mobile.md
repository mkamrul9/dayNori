# V2 design and mobile specification

Status: proposed direction for Phases 66–76; research reviewed 2026-10-25. Phase 67 complete: owner selected **Warm notebook** (2026-10-25, ADR 0069 accepted). Prototypes: [docs/design/v2/phase67/](../../design/v2/phase67/README.md). Five-participant prototype sessions deferred to Phase 99 (did not occur). This file extends the existing [design system](../../design/design-system.md) and [information architecture](../../design/information-architecture.md). Phase 68 implements tokens/primitives; rendered production UI is not certified here.

## References and what to learn

These are product patterns to evaluate, not permission to copy branding, assets, or exact screens. The recommendations below are Daynori design judgments drawn from the sources.

- [Linear's UI redesign](https://linear.app/now/how-we-redesigned-the-linear-ui): hierarchy between sidebar, page header, view controls, and content; fewer competing visual elements. Apply consistent alignment and quieter secondary controls. Avoid importing issue-tracker density into a personal journal.
- [Todoist navigation customization](https://www.todoist.com/help/todoist/features/customize-the-sidebar-and-navigation-menu-in-todoist-S9JLTYqZV): users can show or hide navigation views. Apply reversible module visibility and favorites with a reliable All features route.
- [Things](https://culturedcode.com/things/): study its official cross-device screenshots for a focused daily list and restrained metadata. Apply a strong Today hierarchy while testing Daynori's larger mixed-content scope separately.
- [Day One's navigation update](https://dayoneapp.com/releases/major-navigation-update-with-journals-more-tab/): dedicated journals and a secondary feature hub, with layouts adapted to device size. Apply a quiet writing space and platform-specific composition.
- [Notion AI](https://www.notion.com/help/notion-ai-faqs) and [Day One conversational journaling](https://dayoneapp.com/guides/ai-features/ai-features/): useful references for generating content from conversation. Daynori retains its own privacy and explicit-write confirmation contract.

Official Things and Day One screen images were opened during research. Linear's article and descriptions were inspected; its full-size image fetch failed. No authenticated competitor app was tested and no proprietary assets are copied. Phase 67 must assemble dated screen references and original prototypes from accessible public sources.

## Visual system

- Explore two coherent directions using the current identity: warm notebook and crisp utility. Select one after testing Today, sign-in, Journal, a task editor, Help/tour, and assistant on desktop and 360px mobile. Include light and dark examples. Do not deliver a palette-only redesign.
- Starting light roles: paper `#F7F5EF`, white surfaces, ink `#172C2C`, teal actions `#146B63`, restrained amber `#D9A441`. Start dark roles from the existing tokens. Final values require rendered state and contrast checks.
- Default body text around 16px, supporting text around 14px, clear 20–28px headings where appropriate, and comfortable reading measure. Prefer system fonts with tested Bangla fallback. Loading fonts must not block useful content.
- Use a consistent 4/8px spacing rhythm, aligned list rows, modest radii, clear selected states, and semantic status colors paired with text/icons. Avoid a grid of oversized identical cards, decorative gradients, glass effects, and status colors used as decoration.
- Use the existing semantic icon registry and web/mobile Icon adapters. Match stroke, optical size, baseline, and active-state treatment. No emoji or Unicode substitutes in app-authored chrome. Icon-only controls need accessible names; unfamiliar actions need visible text. User notes, journal entries, file names, and imported content retain their original characters.
- Specify empty, loading, offline, denied, error, retry, disabled, conflict, and success states for every primary component. Preview limitations use a compact contextual message, not a wall of infrastructure copy.
- Motion generally lasts 120–200ms and explains navigation or state. Welcome and companion animations may be slightly longer if skippable and measured. Reduced motion gets equivalent static feedback; backgrounded/hidden animations stop. No artificial startup delay, autoplay sound, flashing, or constant attention-seeking pet movement.

## Placement and disclosure

- Desktop: narrow persistent sidebar; Today/Plan/Library/Journal first, then user pins. A compact page header contains contextual search and one Create action. Detail metadata can use a side panel on wide screens.
- Today: date, the next useful action, today's tasks/routines, then a small optional journal prompt. Target three useful groups in the initial viewport; collapse completed and overdue history. Avoid repeating the same navigation as tabs, chips, and cards on one screen.
- Plan: Tasks/Routines/Calendar segmented views with clear labels. Start editors with required fields; optional folder, priority, reminders, and advanced options expand under Details.
- Library: folders, Inbox, recent or pinned content, and type filters when needed. Notes, guides, files, and mixed folders share canonical IDs. Do not show storage diagnostics, developer samples, or every import option on entry.
- Journal: dominant editor and date navigation; formatting and metadata secondary. No mandatory mood, streak, or title. Privacy settings suppress snippets consistently.
- All features: reachable within two navigation actions from the main shell. Search, Help, Settings, account controls, and the directory remain available after personalization. Common creation should be at most one menu plus the form.
- Settings: Account; Appearance & accessibility; Notifications; Workspace & visible features; Privacy & data; Help & feedback. Put genuine user controls such as text size, language, and reduced motion here. Move galleries, synthetic-provider panels, test seeders, token/queue inspectors, and vault harnesses into a separate restricted developer area.
- A hidden module disappears from ordinary shortcuts and optional Today content. Search excludes its content by default when the user chooses that privacy/visibility behavior, with an explicit Include hidden option. Hiding does not stop existing reminders; offer a separate reminder preference and explain it.
- Release capability, authorization, and personal visibility are separate inputs to a shared feature registry. The registry drives shell, Create, directory, Help, and tour eligibility. A hidden admin menu is not an access-control boundary. Ordinary users cannot enable provisional capabilities through Developer settings.

## Mobile web/PWA composition

- Support 320, 360, 390, 412, 768 CSS-pixel widths and landscape. Use content-driven breakpoint decisions rather than device-name detection. Keep four labeled bottom tabs initially; no horizontal strip of ten modules.
- Use one compact top row, a reachable Create action, and account/menu access. Full-screen editors replace cramped nested desktop dialogs. Use sheets for short choices and full screens for long forms/settings.
- On narrow screens Settings becomes a grouped list and dedicated subpages. Calendar defaults to agenda where a month grid would make dates unusable; keep a reachable month option.
- Test dynamic viewport units, safe-area insets, browser chrome expansion, on-screen keyboard, scrolling to invalid fields, textarea growth, fixed banners, and last-row reachability. Never hide overflow globally to conceal a broken layout.
- Primary touch areas target at least 44 CSS pixels; native targets follow platform guidance, with 48dp as Android's starting target. Text can scale to 200% without clipping essential controls. Dragging has move-up/down or destination controls.
- Preserve browser Back, deep links, focus restoration, draft recovery, and touch selection. Detect install/notification support at runtime; instructions reflect actual browser capability.

## Native Android and iPhone scope

Android uses native navigation, hardware Back, sheets, keyboard avoidance, screen reader roles, and scalable text. Adapt the visual system through `packages/ui-mobile`; do not embed the web app as a redesign shortcut. Domain rules, contracts, feature eligibility, and tour semantics remain shared.

iPhone Safari and installed-PWA flows belong to responsive-web validation, including install instructions and permitted push support. Native iOS still requires the separate Mac/build/device/store evidence in Phases 61–62. No Android result proves native iOS readiness.

## Design sign-off evidence

Phase 67 produced original screen flows and a state inventory; Warm notebook is selected. The Phase 67 five-participant prototype review was owner-deferred to Phase 99 before V2 release (sessions did not occur in Phase 67). Phase 99 still runs a fresh-user review on the implemented app. Use synthetic data only. Keep before/after screenshots with viewport, theme, commit, and platform identifiers; do not label historical screenshots as current builds.
