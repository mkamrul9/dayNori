# Nori Companion & Assistant Launcher Guide

Phase 96 introduces **Nori**, Daynori’s original folded-paper notebook companion character and assistant launcher. This guide covers Nori's brand identity, geometric artwork construction, state presentation engine, accessibility requirements, and technical integration across web and mobile surfaces.

---

## 1. Character Identity & Brand Direction

### 1.1 Name & Heritage
- **Name:** Nori (diminutive of Daynori).
- **Theme:** Folded-paper / origami notebook companion.
- **Personality:** Attentive, calm, truthful, respectful of privacy, and quietly encouraging.
- **Palette:** Daynori Teal front body, deep teal shadow facets, warm amber crest accent, and dark ink linework.

### 1.2 Provenance & Intellectual Property
- **100% Original Vector Drafting:** Created strictly via geometric coordinate specifications in `assets/brand/nori/nori-geometry.json`.
- **Zero Generative AI:** No generative AI image tools were used in character concept or asset rendering.
- **Zero Third-Party Clipart:** No stock illustrations, clip art, or licensed vector libraries were imported.
- **License:** MIT License under the core Daynori repository.
- **Screening:** Screened for application store naming conflicts in productivity and personal organization; no conflicting companion mascots identified.

---

## 2. Geometric Construction & Color Palette

### 2.1 Origami Geometry (`viewBox="0 0 64 64"`)
Nori's anatomy consists of 5 primary folded facets:
1. **Front Body Plane (`M32 8 L48 24 L32 56 L16 24 Z`):** Central origami kite shape that defines the primary face and body.
2. **Left Wing Facet (`M16 24 L32 56 L10 38 Z`):** Shaded side wing providing geometric depth.
3. **Right Wing Facet (`M48 24 L32 56 L54 38 Z`):** Highlighted side wing balancing the origami symmetry.
4. **Folded Crest Accent (`M26 8 L32 2 L38 8 L32 14 Z`):** Crown fold at the peak of the character, perking upward during active listening.
5. **Shadow Crease (`M32 24 L48 24 L32 56 Z`):** Subtle ink overlay providing paper crease realism.

### 2.2 Palette Specifications

| Token | Light Theme | Dark Theme | Static / High Contrast | Semantic Role |
| :--- | :--- | :--- | :--- | :--- |
| `front` | `#146B63` | `#2FA89A` | `#146B63` | Front kite facet |
| `leftWing` | `#0E524C` | `#146B63` | `#0E524C` | Shaded depth facet |
| `rightWing` | `#1D7F76` | `#38BDB0` | `#146B63` | Illuminated depth facet |
| `foldCrest` | `#D9A441` | `#E5B55A` | `#172C2C` | Folded crown fold |
| `ink` | `#172C2C` | `#FFFFFF` | `#172C2C` | Eyes, creases, details |
| `paper` | `#F7F5EF` | `#172C2C` | `#FFFFFF` | Eye backgrounds, checks |
| `accentWarm` | `#D9A441` | `#E5B55A` | `#172C2C` | Sound waves, sparkles |
| `alert` | `#B3261E` | `#F5C2C0` | `#B3261E` | Error warnings |
| `muted` | `#526363` | `#8A9B9B` | `#526363` | Offline status |

---

## 3. Truthful State Derivation Engine

Nori’s visual expression is derived strictly from real application conditions via `resolveNoriState()`:

```
[ Application Conditions ]
         │
         ├── Microphone recording active?  ──> LISTENING  (Perked crest, warm sound wave)
         ├── Request or stream in flight?  ──> THINKING   (Focused eyes, amber sparkle)
         ├── Action confirmed/succeeded?   ──> SUCCESS    (Happy curved eyes, green check)
         ├── Capability or network error?  ──> ERROR      (Alert crest, warning glyph)
         ├── Device offline?               ──> OFFLINE    (Muted slate, sleeping eyes)
         ├── Quiet hours active?           ──> SLEEPING   (Closed curved eyes, gentle resting)
         ├── Hover, focus, or panel open?  ──> GREETING   (Friendly open eyes, gentle smile)
         └── Default state?                ──> IDLE       (Calm open eyes, resting fold)
```

### 3.1 Strict Microphone Invariant
- **Inviolable Rule:** Simply hovering, clicking, focusing, or displaying the Nori launcher **NEVER** activates the microphone or records audio.
- The `listening` state requires an active, user-initiated audio capture session (`isListening === true`).

---

## 4. Layout, Positioning & Collision Avoidance

### 4.1 Corner Placement Options
Users can configure Nori's corner location via right-click context menu (web) or settings (mobile):
- `bottom-right` (default)
- `bottom-left`
- `top-right`
- `top-left`

### 4.2 Inset Calculation & Collision Prevention
Coordinates are calculated via `calculateNoriSafeCoordinates(position, insets)`:
- **Bottom Navigation Offset:** Automatically adds `bottomNavHeight` (64px) + margin (16px) to bottom-aligned positions, ensuring bottom tabs and Floating Action Buttons are never covered.
- **Top Bar Offset:** Automatically adds system status bar and banner height to top-aligned positions.
- **Editor & Soft Keyboard:** Floating position adapts when virtual keyboards or bottom formatting bars are displayed.

---

## 5. Accessibility & Reduced-Motion Guarantees

### 5.1 Reduced-Motion Support
- Respects system `prefers-reduced-motion: reduce` and user in-app preference `noriCompanion.reducedMotion`.
- When active, all animation durations are set to `0ms` (`allowAnimation: false`). Ambient floating and breathing animations are suppressed.
- Nori is presented as a clean, crisp, static origami vector.

### 5.2 Background Tab & Resource Conservation
- Visibility change listeners (`document.visibilityState`) immediately halt animation render loops when browser tabs or apps are backgrounded.

### 5.3 Keyboard Navigation & Screen Readers
- **Touch Target:** Minimum 52px (web) / 52dp (mobile), exceeding the 48dp WCAG AA standard.
- **Keyboard Access:** Focusable via `Tab`, activatable via `Enter` or `Space`.
- **Focus Restoration:** Closing the assistant dialog automatically restores focus to the launcher button.
- **Live Announcements:** Screen readers announce truthful state descriptions (e.g. *"Nori: Assistant is listening"*, *"Nori: Assistant is offline"*).

---

## 6. Asset Build Pipeline

Brand assets are compiled using `scripts/build-nori-assets.mjs`:
- SVGs for all 8 states in light, dark, and static modes.
- Scaled PNG rasters across 5 standard dimensions: 24px, 32px, 48px, 96px, 192px.
- Output destinations:
  - `assets/brand/nori/`: Master brand assets and preview sheets.
  - `apps/web/public/brand/nori/`: Web application public assets.
  - `apps/mobile/assets/brand/nori/`: React Native mobile bundle assets.
  - `packages/ui-mobile/assets/icons/nori.png`: Native icon raster asset.
