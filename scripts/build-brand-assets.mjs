import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Reuse the rasterizer already pinned by Next.js; no remote fonts or artwork are fetched.
const webRequire = createRequire(path.join(root, 'apps/web/package.json'));
const nextRequire = createRequire(webRequire.resolve('next/package.json'));
const sharp = nextRequire('sharp');
const geometry = JSON.parse(
  await fs.readFile(path.join(root, 'assets/brand/geometry.json'), 'utf8')
);
const { colors, symbol, wordmark } = geometry;
const outputs = [];

const svg = (viewBox, content) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none">${content}</svg>\n`;
const mark = (color) =>
  `<g fill="${color}" fill-rule="evenodd"><path d="${symbol.body}"/><path d="${symbol.fold}"/></g>`;
const lettering = (color) =>
  `<g fill="${color}"><path fill-rule="evenodd" d="${wordmark.d}"/><circle cx="${wordmark.dot.cx}" cy="${wordmark.dot.cy}" r="${wordmark.dot.r}"/></g>` +
  `<path d="${wordmark.strokes}" fill="none" stroke="${color}" stroke-width="6.4" stroke-linecap="round" stroke-linejoin="round"/>`;
const lockup = (symbolColor, textColor) =>
  `<g transform="translate(0 -1)">${mark(symbolColor)}</g>` +
  `<g transform="translate(108 17) scale(1.03)">${lettering(textColor)}</g>`;
const tile = (rounded = false) =>
  svg(
    '0 0 1024 1024',
    `<rect width="1024" height="1024" rx="${rounded ? 224 : 0}" fill="${colors.teal}"/><g transform="translate(112 120) scale(8)">${mark(colors.white)}</g>`
  );
const foreground = svg(
  '0 0 1024 1024',
  `<g transform="translate(212 218) scale(6)">${mark(colors.white)}</g>`
);

async function write(relativePath, contents) {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, contents);
  outputs.push(relativePath);
}
async function png(relativePath, source, size) {
  const bytes = await sharp(Buffer.from(source)).resize(size, size).png().toBuffer();
  await write(relativePath, bytes);
}

for (const [name, symbolColor, textColor] of [
  ['logo', colors.teal, colors.ink],
  ['logo-inverse', colors.paper, colors.paper],
  ['logo-monochrome', '#000000', '#000000'],
]) {
  const source = svg('0 0 332 96', lockup(symbolColor, textColor));
  await write(`assets/brand/daynori-${name}.svg`, source);
  await write(
    `assets/brand/daynori-${name}.png`,
    await sharp(Buffer.from(source)).resize(1328, 384).png().toBuffer()
  );
  if (name !== 'logo-monochrome') await write(`apps/web/public/brand/daynori-${name}.svg`, source);
}
const symbolSvg = svg(symbol.viewBox, mark(colors.teal));
await write('assets/brand/daynori-symbol.svg', symbolSvg);
await write('apps/web/public/brand/daynori-symbol.svg', symbolSvg);
await write(
  'apps/web/public/brand/daynori-symbol-inverse.svg',
  svg(symbol.viewBox, mark(colors.paper))
);
await write('assets/brand/daynori-symbol-inverse.svg', svg(symbol.viewBox, mark(colors.white)));
await write('assets/brand/daynori-app-icon.svg', tile());
await png('assets/brand/daynori-app-icon-1024.png', tile(), 1024);
await png('apps/mobile/assets/brand/icon.png', tile(), 1024);
await png('apps/mobile/assets/brand/adaptive-foreground.png', foreground, 1024);
await png('apps/mobile/assets/brand/adaptive-monochrome.png', foreground, 1024);
await png(
  'apps/mobile/assets/brand/notification-icon.png',
  svg(symbol.viewBox, mark(colors.white)),
  96
);
await png('apps/mobile/assets/brand/splash.png', symbolSvg, 512);
await png(
  'apps/mobile/assets/brand/splash-inverse.png',
  svg(symbol.viewBox, mark(colors.paper)),
  512
);
await png('packages/ui-mobile/assets/daynori-symbol.png', symbolSvg, 288);
await png('apps/web/public/brand/icon-192.png', tile(true), 192);
await png('apps/web/public/brand/icon-512.png', tile(true), 512);
await png('apps/web/public/brand/icon-maskable-512.png', tile(), 512);
await png('apps/web/public/apple-touch-icon.png', tile(), 180);
await write('apps/web/public/icon.svg', tile(true));

// PNG-compressed ICO entries preserve sharp small-size browser icons without another tool.
const sizes = [16, 32, 48];
const entries = await Promise.all(
  sizes.map((size) =>
    sharp(Buffer.from(tile(true)))
      .resize(size)
      .png()
      .toBuffer()
  )
);
const header = Buffer.alloc(6 + entries.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(entries.length, 4);
let offset = header.length;
entries.forEach((entry, index) => {
  const start = 6 + index * 16;
  header[start] = sizes[index];
  header[start + 1] = sizes[index];
  header.writeUInt16LE(1, start + 4);
  header.writeUInt16LE(32, start + 6);
  header.writeUInt32LE(entry.length, start + 8);
  header.writeUInt32LE(offset, start + 12);
  offset += entry.length;
});
await write('apps/web/public/favicon.ico', Buffer.concat([header, ...entries]));

// The preview is a presentation of the actual masters, never a separate approximation.
const preview = svg(
  '0 0 1440 960',
  `
  <rect width="1440" height="960" fill="${colors.paper}"/>
  <g font-family="Segoe UI, sans-serif" fill="${colors.ink}">
    <text x="80" y="78" font-size="16" letter-spacing="4">DAYNORI / VISUAL IDENTITY</text>
    <text x="1360" y="78" font-size="14" text-anchor="end">01</text>
    <g transform="translate(335 197) scale(2.3)">${lockup(colors.teal, colors.ink)}</g>
    <text x="720" y="484" font-size="24" text-anchor="middle" fill="#526363">Your day, gathered.</text>
    <path d="M80 555H1360" stroke="#D9DFDC"/>
    <text x="80" y="605" font-size="13" letter-spacing="2">THE FOLDED D</text>
    <g transform="translate(105 652) scale(1.8)">${mark(colors.teal)}</g>
    <rect x="438" y="637" width="228" height="228" rx="50" fill="${colors.teal}"/>
    <g transform="translate(466.5 665.5) scale(1.78125)">${mark(colors.white)}</g>
    <text x="438" y="605" font-size="13" letter-spacing="2">APP ICON</text>
    <rect x="746" y="637" width="614" height="228" rx="20" fill="${colors.ink}"/>
    <g transform="translate(806 679) scale(1.48)">${lockup(colors.paper, colors.paper)}</g>
    <text x="746" y="605" font-size="13" letter-spacing="2">REVERSED</text>
    <text x="80" y="922" font-size="14" fill="#526363">Custom vector geometry. One color. Built to work small.</text>
  </g>`
);
await write('assets/brand/preview.svg', preview);
await write('assets/brand/preview.png', await sharp(Buffer.from(preview)).png().toBuffer());
console.log(`Generated ${outputs.length} local brand assets from assets/brand/geometry.json.`);
