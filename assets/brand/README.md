# Daynori logo kit

The rounded D holds a coral path rising toward a sun. It ties the name to the idea of moving through a day while keeping the silhouette readable at app-icon size. The wordmark is custom vector lettering; it contains no font dependency or stock artwork.

Start with `daynori-logo.svg` for the primary horizontal logo and `daynori-symbol.svg` for compact placements. The matching PNG wordmarks are 1328 × 384 with transparent backgrounds. `daynori-logo-inverse` is for dark surfaces; `daynori-logo-monochrome` is black for one-color reproduction. `daynori-app-icon-1024.png` is the opaque square master; platforms apply their own icon masks. `preview.png` shows the identity together.

Keep the logo's proportions. Leave at least one stem-width of clear space around the visible artwork. Use the symbol below a 120 px-wide wordmark placement, and avoid displaying the symbol below 16 px. Use violet `#623DE8`, coral `#FF799D`, and ink `#1C2142` on light surfaces, or cool white `#F7F7FF` and soft coral `#FF9DBB` on dark surfaces. The rising-path mark is original project geometry. The monochrome version preserves the full silhouette for one-color reproduction.

Edit [geometry.json](geometry.json), then run from the repository root:

```powershell
node scripts/build-brand-assets.mjs
node scripts/check-brand-assets.mjs
```

The generator uses Sharp already installed with the pinned Next.js dependency. It writes the masters and the web/native copies together. Browser assets include ICO, SVG, Apple touch, PWA 192/512 and a separate opaque maskable icon. Native assets include a 1024 px icon, transparent adaptive/themed foregrounds, a white notification icon, and light/dark splash artwork. The mobile header receives a bundled transparent symbol and applies its theme color.

When changing deployed artwork, also advance `CACHE_VERSION` in `apps/web/public/sw.js` so existing PWA installations refresh their cached public assets. Launcher and splash changes require rebuilding the native application.

The logo is original project artwork, with editable geometry committed here. Similarity/trademark clearance remains the separate [naming gate](../../docs/product/naming.md); this delivery does not establish exclusivity or approve public publication. No font files or external image assets are included.
