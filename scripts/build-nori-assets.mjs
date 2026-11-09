import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webRequire = createRequire(path.join(root, 'apps/web/package.json'));
const nextRequire = createRequire(webRequire.resolve('next/package.json'));
const sharp = nextRequire('sharp');

const geometry = JSON.parse(
  await fs.readFile(path.join(root, 'assets/brand/nori/nori-geometry.json'), 'utf8')
);

const { palette, geometry: geom } = geometry;
const states = Object.keys(geom.states);

function renderNoriSvg(state, mode = 'light') {
  const p = palette[mode] || palette.light;
  const stateData = geom.states[state] || geom.states.idle;

  const isOffline = state === 'offline';
  const frontFill = isOffline ? p.muted : p.front;
  const leftWingFill = isOffline ? '#3D4D4D' : p.leftWing;
  const rightWingFill = isOffline ? '#4A5C5C' : p.rightWing;
  const crestFill = isOffline ? p.muted : (state === 'error' ? p.alert : p.foldCrest);
  const crestD = state === 'listening' ? stateData.perkedCrest : geom.body.crest;

  let details = '';

  // 1. Eyes
  if (stateData.eyes) {
    for (const eye of stateData.eyes) {
      if (eye.type === 'circle') {
        details += `<circle cx="${eye.cx}" cy="${eye.cy}" r="${eye.r}" fill="${p.ink}"/>`;
      } else if (eye.type === 'path') {
        details += `<path d="${eye.d}" stroke="${p.ink}" stroke-width="${eye.strokeWidth}" fill="none" stroke-linecap="round"/>`;
      }
    }
  }

  // 2. Glints
  if (stateData.glints && mode !== 'static') {
    for (const g of stateData.glints) {
      details += `<circle cx="${g.cx}" cy="${g.cy}" r="${g.r}" fill="${p.white}"/>`;
    }
  }

  // 3. Crease / Smile
  if (stateData.crease) {
    details += `<path d="${stateData.crease.d}" stroke="${p.ink}" stroke-width="${stateData.crease.strokeWidth}" fill="none" stroke-linecap="round"/>`;
  }

  // 4. Wave (Listening)
  if (stateData.wave) {
    details += `<path d="${stateData.wave.d}" stroke="${p.accentWarm}" stroke-width="${stateData.wave.strokeWidth}" fill="none" stroke-linecap="round"/>`;
  }

  // 5. Sparkle (Thinking)
  if (stateData.sparkle) {
    details += `<path d="${stateData.sparkle}" fill="${p.accentWarm}"/>`;
  }

  // 6. Check (Success)
  if (stateData.check) {
    details += `<path d="${stateData.check}" stroke="${p.paper}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  }

  // 7. Warning (Error)
  if (stateData.warning) {
    details += `<path d="${stateData.warning}" fill="${p.alert}"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <!-- Left Wing -->
  <path d="${geom.body.leftWing}" fill="${leftWingFill}"/>
  <!-- Right Wing -->
  <path d="${geom.body.rightWing}" fill="${rightWingFill}"/>
  <!-- Front Body Plane -->
  <path d="${geom.body.front}" fill="${frontFill}"/>
  <!-- Folded Crest Accent -->
  <path d="${crestD}" fill="${crestFill}"/>
  <!-- Shadow Crease -->
  <path d="${geom.body.shadow}" fill="${p.ink}" fill-opacity="0.12"/>
  <!-- State Features -->
  ${details}
</svg>\n`;
}

async function write(relativePath, contents) {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const cleaned = typeof contents === 'string' ? contents.replace(/[ \t]+$/gm, '') : contents;
  await fs.writeFile(target, cleaned);
}

async function png(relativePath, svgSource, size) {
  const bytes = await sharp(Buffer.from(svgSource)).resize(size, size).png().toBuffer();
  await write(relativePath, bytes);
}

console.log('Generating Nori companion brand assets...');

// Generate SVGs for all states in light, dark, and static
for (const state of states) {
  for (const mode of ['light', 'dark', 'static']) {
    const suffix = mode === 'light' ? '' : `-${mode}`;
    const svgContent = renderNoriSvg(state, mode);
    await write(`assets/brand/nori/nori-${state}${suffix}.svg`, svgContent);
    await write(`apps/web/public/brand/nori/nori-${state}${suffix}.svg`, svgContent);
    await write(`apps/mobile/assets/brand/nori/nori-${state}${suffix}.svg`, svgContent);

    // Generate PNGs across sizes (24, 32, 48, 96, 192)
    for (const sz of [24, 32, 48, 96, 192]) {
      await png(`assets/brand/nori/nori-${state}${suffix}-${sz}.png`, svgContent, sz);
      if (state === 'idle') {
        await png(`apps/web/public/brand/nori/nori-${state}${suffix}-${sz}.png`, svgContent, sz);
        await png(`apps/mobile/assets/brand/nori/nori-${state}${suffix}-${sz}.png`, svgContent, sz);
      }
    }
  }
}

// Generate Preview Sheet (showing all states side by side in a grid)
const previewSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 280" fill="#F7F5EF">
  <rect width="540" height="280" fill="#F7F5EF"/>
  <text x="24" y="36" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="640" fill="#172C2C">Daynori Assistant Companion (Nori) — State Showcase</text>
  <text x="24" y="56" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="#526363">Original folded-paper character: teal body, ink features, and warm amber crest</text>
  ${states
    .map((state, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = 32 + col * 128;
      const y = 80 + row * 96;
      return `<g transform="translate(${x} ${y})">
        <rect x="0" y="0" width="80" height="80" rx="12" fill="#FFFFFF" stroke="#D9DFDC" stroke-width="1"/>
        <g transform="translate(8 8) scale(1)">
          ${renderNoriSvg(state, 'light').replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')}
        </g>
        <text x="40" y="74" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="500" fill="#172C2C">${state}</text>
      </g>`;
    })
    .join('')}
</svg>`;

await write('assets/brand/nori/preview.svg', previewSvg);
await png('assets/brand/nori/preview.png', previewSvg, 1080);

console.log('Nori companion brand assets built successfully.');
