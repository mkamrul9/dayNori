# ADR-0059: Daynori vector identity and platform assets

- Status: accepted for local application identity; public brand clearance pending.
- Date: 2026-10-21.
- Owner/reviewer: owner-requested logo work; implemented by Codex.
- Related scope: [Phase 60 local consolidation](../phase-reports/phase-60.md), [design direction](../design/design-system.md), [naming](../product/naming.md).

## Context

The application had text-only header branding, no supplied favicon file, a PWA manifest pointing at that missing file, and no custom native icon. The owner requested a simple professional identity across application types. The existing paper/ink/teal palette and folded-page direction provide the visual constraints.

## Options

Raster-only artwork makes small-icon adjustments and monochrome reproduction harder. A font-only wordmark cannot identify the app in a launcher or browser tab. A custom vector symbol with vector lettering supports those placements and keeps the shipped wordmark independent of installed fonts.

## Decision

Keep the editable source in `assets/brand/geometry.json`. The folded D uses two filled paths and a counter; the custom lettering uses paths and one circular dot. A local generator exports SVG/PNG masters, fixed-size browser/PWA assets and native icon/splash/notification assets. Use the full logo in the desktop web header, the compact symbol on narrow web screens, and a theme-tinted bundled symbol beside native page titles. Header branding is decorative where a page title already supplies the accessible heading; the web home link retains the accessible name Daynori.

The mobile UI package owns its bundled header image; it does not import application-owned assets. Native Expo configuration and public web metadata own platform integrations. PWA cache version v3 includes only explicit public asset paths, preserving origin/query/private-data exclusions. The themed Android foreground is white artwork with alpha, padded inside the adaptive icon safe area; the PWA maskable icon has an opaque background and fits its safe circle.

## Consequences

The generator must run whenever geometry changes so platform copies remain aligned. It reuses Sharp from the pinned Next.js dependency and downloads no artwork or fonts. PNG wordmarks provide transparent exports for external use. The presentation preview uses a system font for annotations only; all logo lettering is vector geometry.

Existing installed native binaries need a new native build to receive launcher/splash changes. Generating assets and exporting a bundle do not demonstrate launcher appearance, physical-device accessibility or trademark clearance. No production deployment or store submission is part of this work.

The first static native image exposed an existing incompatibility between Metro 0.81.5's callable/file-path `image-size` usage and the repository override to image-size 2.0.4. A version-pinned Metro patch imports the named `imageSize` function and reads file inputs as bytes. It preserves the existing image-size version. This follows the observed [Metro 0.81.5 source](https://github.com/react/metro/blob/v0.81.5/packages/metro/src/Assets.js) and the installed image-size 2.0.4 exports; the check script exercises Metro's actual PNG metadata path. Remove the patch when the selected Expo/Metro version supports this interface directly.

## Verification and revisit

See the [Phase 60 logo evidence](../phase-reports/phase-60.md#owner-requested-logo-follow-up-2026-10-21) for build/check results and environment limitations. Revisit if small-size legibility, platform masking, future theme changes or brand screening reveal a problem. Keep prior release and hardware gates unchanged.
