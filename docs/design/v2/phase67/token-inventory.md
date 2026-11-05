# Proposed token and component inventory (Phase 68 input)

**Status:** Phase 68 implemented Warm notebook tokens/primitives in `packages/design-tokens`, `ui-web`, and `ui-mobile` (2026-10-25). This file remains the inventory reference.

## Token roles

| Role | Warm light | Crisp light | Notes |
| --- | --- | --- | --- |
| background | `#F7F5EF` | `#F3F5F4` | Paper vs cool paper |
| surface | `#FFFFFF` | `#FFFFFF` | |
| text.primary | `#172C2C` | `#142424` | Ink |
| text.secondary | `#526363` | `#445555` | |
| action.primary | `#146B63` | `#0F5F58` | Teal |
| accent.warm | `#D9A441` | `#C9922E` | Amber emphasis only |
| border.strong | `#758680` | `#5F716C` | Essential fields ≥3:1 |
| radius.sm/md/lg | 10/14/18 | 6/8/10 | Density difference |
| space scale | 4–48 | same scale, tighter padding vars | |

Dark roles: see `css/directions.css` and existing `packages/design-tokens`.

## Components to implement in Phase 68

Button · icon button · text field · textarea · checkbox · segmented control · list row · badge/sync status · card · dialog/sheet · sidebar · bottom nav · empty/loading/error · breadcrumb · Create menu · focus ring.

Icons: existing semantic registry only — no emoji chrome.

## Motion

120–200ms opacity/transform for sheet open and route emphasis. Honor `prefers-reduced-motion`. No autoplay sound or constant animation.
