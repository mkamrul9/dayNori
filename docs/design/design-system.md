# Design system direction

Status: proposed visual specification aligned to **Warm notebook** (Phase 67 owner selection 2026-10-25, ADR 0069). These values are not alone proof of accessibility. Implement and validate shared semantic tokens and complete components in Phase 68. Interactive prototypes: [v2/phase67](v2/phase67/README.md).

## Visual character

The local application logo and platform exports are in the [Daynori logo kit](../../assets/brand/README.md). The folded D and custom vector wordmark implement this palette; [ADR 0059](../decisions/0059-daynori-vector-identity-and-platform-assets.md) records the asset and platform ownership. Public brand clearance remains pending.

The app should feel like a well-made personal notebook with the clarity of a dependable tool: warm paper, dark ink, deep teal actions and small amber emphasis. Use generous spacing, clear alignment and modest rounded corners. Keep backgrounds quiet so notes, deadlines and personal writing are prominent.

Avoid large decorative gradients, glass layers behind essential text, arbitrary violet accents and a different bright color for every module. A polished product comes from hierarchy and consistent states, not from filling every surface with brand color.

## Proposed semantic palette

Light theme:

- `background`: warm paper `#F7F5EF`.
- `surface`: white `#FFFFFF`; raised cards use subtle borders instead of heavy shadow.
- `text.primary`: ink `#172C2C`.
- `text.secondary`: slate `#526363`.
- `action.primary`: deep teal `#146B63`, with white label `#FFFFFF`.
- `accent.warm`: amber `#D9A441`, with ink label `#172C2C`; use for a small highlight or priority marker, not body text on paper.
- `border.strong`: muted sage `#81918A` for essential field boundaries on paper; decorative dividers may be lighter.
- `danger`, `success`, `warning`, `info`: finalize paired foreground/background tokens after component contrast validation. Status always also has text/icon.

Dark theme:

- `background`: deep ink `#0D1919`.
- `surface`: dark teal-gray `#132323`.
- `text.primary`: pale paper `#E9F0ED`.
- `text.secondary`: pale slate `#AEC0BB`.
- `action.primary`: soft teal `#73C2B6`, with dark ink label `#102020`.
- `accent.warm`: soft amber `#E6B85A`, with the approved dark label.
- `border.strong`: choose after verification against both dark surface levels; never simply reuse the light token.

A local calculation using the WCAG sRGB relative-luminance formula gives these **opaque color-pair** contrast ratios, rounded to two decimals:

- Ink on paper: 13.44:1.
- Secondary slate on paper: 5.80:1.
- White on primary teal: 6.34:1.
- Ink on amber: 6.52:1.
- Dark primary text on dark surface: 14.05:1.
- Dark secondary text on dark surface: 8.56:1.
- Dark ink on soft teal: 8.10:1.
- Strong light border on paper: 3.03:1.

These calculations do not cover opacity, disabled/hover/focus states, imagery, browser rendering or user-selected accents. Audit rendered tokens with tooling and human review. The ratio method and contrast criterion are defined in [WCAG 2.2](https://www.w3.org/TR/WCAG22/#contrast-minimum). No app-wide compliance claim follows from a palette.

## Typography and content density

- Prefer system-native sans-serif UI type initially for performance and broad script support. Evaluate a small licensed display serif for journal headings only after readability, fallback and bundle-cost tests.
- Web proposed scale: 12 metadata, 14 supporting labels, 16 body, 20 section heading, 24 page title and 32 occasional welcome title. Essential instructions never depend on the smallest size.
- Mobile uses scalable native text equivalents with dynamic type/font scaling. Do not fix heights around text.
- Body line height approximately 1.5; editing/reading measure around 60-75 Latin characters. Bangla text needs its own line-height/readability test.
- Compact and comfortable list density may be optional later. Comfortable is the default; a dense mode cannot reduce interactive hit areas below the accepted minimum.

## Spacing, shape and elevation

- Base spacing units: 4, 8, 12, 16, 24, 32 and 48.
- Mobile content inset proposed at 16; desktop 24-32 depending on layout.
- Radius proposed at 8 for small controls, 12 for cards, 16 for sheets. Use pill shapes only for tags/filters where appropriate.
- Borders define surfaces. Use a single small elevation for menus/sheets, with solid backgrounds. Sticky bars must not cover focused fields or the last list row.
- Motion communicates state in approximately 120-200 ms for simple transitions. Respect reduced motion; avoid bouncing editors or animated backgrounds.

## Core component inventory

Before feature UI work, build documented states and platform behavior for:

1. Button, icon button, text link and overflow menu.
2. Text field, multiline editor shell, checkbox, radio, switch and segmented control.
3. Date/time/timezone picker and priority selector with text labels.
4. Canonical workspace folder breadcrumb, folder picker, type filter and move dialog, including a mixed-item folder view with clear type labels.
5. Task row, routine occurrence row, note card, journal timeline row and file row.
6. Empty state, loading/skeleton, error/retry, permission notice and sync-status badge.
7. Dialog/sheet, toast with optional Undo, contextual confirmation and selection toolbar.
8. Sidebar, bottom navigation, search/filter panel and creation menu.
9. Upload progress, quota notice, file-preview fallback and attachment chip.
10. Accessible reorder controls with drag handles as an additional option.

Use shared tokens, schemas and content vocabulary across clients. Web and native implementations may use different layout/primitives when that improves their platform behavior. Do not force one DOM/native component abstraction to solve every platform interaction.

## Journal quality bar

- The writing surface is the focal point; formatting and date metadata are secondary.
- Opening Write focuses the editor without an unnecessary intermediate modal.
- Draft/sync status is present but does not interrupt typing or announce every keystroke.
- Optional prompts have a clear dismiss action. No mood, title, streak or folder is required before writing.
- Reading has comfortable line length and space between entries; dates and original creation metadata are distinguishable.
- Hide body previews when requested. Show neutral timeline titles when an entry has no title.
- Mobile keyboard, long entries, rotation and text enlargement cannot hide the save state, editing position or navigation.

## Copy and iconography

Use familiar labels: Note, Task, Routine, Journal, File, Folder, Priority, Reminder. Do not expose database terms, job queues, object-store paths or provider token failures to the user. Label the action the user needs to take and retain a support diagnostic ID only when useful.

### No-emoji application chrome

Application-authored interface chrome must not use emoji or improvised Unicode pictograms as icons. Use the shared semantic icon registry in `packages/design-tokens/src/icons.ts` with the web (`packages/ui-web`) and mobile (`packages/ui-mobile`) `Icon` components.

Requirements:

- One coherent 24-unit stroke family (about 1.75 stroke, round caps/joins); size and color come from tokens / `currentColor` / theme tint.
- Prefer semantic names in source (`name="folder"`), not emoji string props. Legacy glyph→name mapping exists only for previously saved folder display metadata.
- Keep recognizable text labels beside icons. Icon-only controls need accessible names, keyboard support, adequate touch targets, and tooltips where the platform affords them.
- Decorative icons use `aria-hidden` / no accessibility label so they do not duplicate announcements.
- Do **not** rewrite user notes, journal bodies, filenames, chat messages, imports, or exports that contain emoji.
- Light/dark themes tint icons from semantic text/action/status colors; selected/disabled/error states follow the same token roles as neighboring controls.

Artwork provenance: Daynori line icons are original project vectors generated into mobile PNGs by `scripts/build-icon-assets.mjs` (no third-party icon font). The Daynori logo/identity remains separate under `assets/brand/` (ADR 0059).

Regression check: `node scripts/check-ui-icons.mjs`.

Use one coherent icon family with consistent stroke/weight. Pair unfamiliar icons with text. Priority uses text and a recognizable marker; color is supplementary. Biometric, vault and encryption language must match the security implementation, not imply assurances that have not been verified.

## Handoff deliverables

The design-system phase must produce a token source, component state gallery, responsive screen prototypes, source/license notes for fonts/icons, rendered light/dark contrast evidence and recorded user findings. Show at least Today, task/routine creation, journal editor, folder/file organization and offline/error recovery before coding those screens.
