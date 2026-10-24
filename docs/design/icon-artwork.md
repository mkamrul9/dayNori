# Daynori interface icon artwork

Date: 2026-10-21.

## Provenance and license

Daynori UI icons are **original project artwork**: vector path data authored in `packages/design-tokens/src/icons.ts`. Mobile PNGs under `packages/ui-mobile/assets/icons/` are generated from those paths by `scripts/build-icon-assets.mjs` using Sharp already present via Next.js — no external icon font, CDN, or stock pack is shipped.

They are distinct from the Daynori logo/identity kit in [`assets/brand/`](../../assets/brand/README.md) (ADR 0059). Logo geometry stays under the brand kit; UI icons stay in the design-tokens registry.

No third-party icon license applies. Trademark/brand clearance for the logo remains the separate naming gate.

## Regeneration

```bash
node scripts/build-icon-assets.mjs
node scripts/check-ui-icons.mjs
```

Edit path data in `icons.ts`, then regenerate native PNGs. Do not hand-edit generated `iconImages.ts` or PNGs except by regenerating.
