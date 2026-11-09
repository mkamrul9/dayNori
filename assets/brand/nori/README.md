# Daynori Assistant Companion (Nori) Asset Provenance & Design Guide

## 1. Overview & Concept

**Nori** is Daynori's original daily assistant companion and optional launcher character.
- **Direction:** An original folded-paper / origami notebook companion.
- **Color Palette:** Daynori's established brand palette:
  - Body planes: Deep teal (`#146B63`), dark shadow wing (`#0E524C`), and bright facet (`#1D7F76`).
  - Folded crest / ear fold: Warm notebook amber (`#D9A441`) in light mode; luminous amber (`#E5B55A`) in dark mode. Echoes the detached triangle fold of the Daynori logo `D`.
  - Facial features: Minimalist dark ink (`#172C2C`) in light mode, clean white (`#FFFFFF`) in dark mode.
- **Differentiation:**
  - Nori is **original Daynori artwork**. It is NOT an emoji, a borrowed character, or a derivative of OpenAI/ChatGPT Pets or Codex mascots.
  - Geometry is drafted cleanly in an editable vector coordinate system (`assets/brand/nori/nori-geometry.json`).

---

## 2. Name Review & Brand Clearance Scope

- **Proposed Name:** **Nori** (short, memorable, friendly).
- **Brand Relationship:** Directly derived as the natural diminutive and root syllable of **Daynori** ("Day-Nori").
- **Connotations & Semantics:**
  - Evokes "notebook", "organize", and "origin" within the Daynori coined naming scheme.
  - Distinct from unrelated dietary terms (Japanese *nori* seaweed); evokes lightness, attention, and folded origami paper.
- **Search Screen:**
  - Screened against mobile app stores and software registries for personal organizer / notebook assistant characters.
  - No trademark or brand conflicts found in productivity / daily assistant categories.
- **Clearance Scope & Limits:**
  - This review confirms local distinctiveness and lack of category collision for software preview and development.
  - Formal nationwide/international trademark clearance remains pending final commercial launch gate before paid store releases.

---

## 3. Asset Authorship & Provenance

- **Authorship:** Handcrafted vector coordinates authored by the Daynori Core Team.
- **Source Files:**
  - Master Geometry: `assets/brand/nori/nori-geometry.json`
  - Generator Script: `scripts/build-nori-assets.mjs`
  - SVG Masters: `assets/brand/nori/nori-*.svg`
  - PNG Masters: `assets/brand/nori/nori-*-48.png`, `nori-*-96.png`, etc.
  - Web Public Distribution: `apps/web/public/brand/nori/`
  - Native Mobile Distribution: `apps/mobile/assets/brand/nori/`
- **License:** MIT (same as Daynori repository).
- **Third-Party & Generation Inputs:**
  - **Zero AI Image Generation:** Created entirely by vector mathematics and SVG path coordinates.
  - **Zero Third-Party Clipart / Stock:** Handcrafted geometric facets.

---

## 4. State Matrix & Semantics

Nori presents 8 purposeful, truthful states driven by real application conditions:

| State | Semantic Meaning | Visual Presentation | Trigger Condition |
| :--- | :--- | :--- | :--- |
| `idle` | Quiet, attentive resting posture | Calm origami kite with friendly circular ink eyes | Default state when assistant is closed and system is idle |
| `greeting` | Welcoming, polite readiness | Subtle smiling curved eye creases and beak crease | User hovers or keyboard-focuses the launcher, or opens assistant |
| `listening` | Active microphone audio capture | Perked alert crest fold and concentric wave indicator below | **Strict Invariant:** ONLY active during explicit microphone capture |
| `thinking` | Model retrieval / generation in-flight | Eyes looking upward with geometric sparkle facet at crest | Active streaming or request processing |
| `success` | Result acknowledged / proposal confirmed | Cheerful closed-eye creases with mini checkmark crease on chest | Action confirmed or successfully completed (persists ~2-3s) |
| `error` | Failure / network rejection | Tilted ear fold with amber warning triangle on chest | Request failed; keeps Help and manual options reachable |
| `offline` | Disconnected or 503 unavailable | Muted slate facets with horizontal slit eyes | Network offline or server 503 unavailable |
| `sleeping` | Resting / quiet hours | Peaceful horizontal closed-eye lines | Quiet hours active or extended inactivity |

---

## 5. Small-Size Legibility & Accessibility

- **Small-Size Scaling:**
  - Tested at **16px, 24px, 32px, 48px, and 96px**.
  - Strong triangular silhouette and high-contrast ink features maintain recognizability even at compact launcher dimensions.
- **Theme Support:**
  - **Light Theme:** Deep teal (`#146B63`) on warm paper (`#F7F5EF`) or clean surface (`#FFFFFF`). Contrast >= 4.5:1.
  - **Dark Theme:** Luminous teal (`#2FA89A`) on dark surface (`#172C2C`). Contrast >= 4.5:1.
  - **Static Variant:** Zero animation, high-contrast monochrome creases for reduced-motion and high-contrast environments.
- **Motion & Invariants:**
  - Animation is brief (<= 180ms) and quiet.
  - Completely halts and zeroes durations when `prefers-reduced-motion` is active or user enables in-app `noriCompanion.reducedMotion`.
  - Zero background animation or timers when unmounted, hidden, or backgrounded.
