import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webRequire = createRequire(path.join(root, 'apps/web/package.json'));
const sharp = createRequire(webRequire.resolve('next/package.json'))('sharp');
const mobileRequire = createRequire(path.join(root, 'apps/mobile/package.json'));
const metroRequire = createRequire(mobileRequire.resolve('@expo/metro-config/package.json'));
const { getAssetData } = metroRequire('metro/src/Assets');
const read = (relative) => fs.readFileSync(path.join(root, relative));
const publicDir = 'apps/web/public';
const manifest = JSON.parse(read(`${publicDir}/manifest.json`));
const config = JSON.parse(read('apps/mobile/app.json')).expo;
const publicAssets = [
  '/favicon.ico',
  '/icon.svg',
  '/apple-touch-icon.png',
  '/brand/daynori-logo.svg',
  '/brand/daynori-logo-inverse.svg',
  '/brand/daynori-symbol.svg',
  '/brand/daynori-symbol-inverse.svg',
  ...manifest.icons.map((icon) => icon.src),
];
for (const asset of publicAssets)
  assert.ok(fs.existsSync(path.join(root, publicDir, asset)), asset);
for (const icon of manifest.icons) {
  const metadata = await sharp(read(`${publicDir}${icon.src}`)).metadata();
  assert.equal(`${metadata.width}x${metadata.height}`, icon.sizes);
}
for (const asset of [
  config.icon,
  config.splash.image,
  config.splash.dark.image,
  config.android.adaptiveIcon.foregroundImage,
  config.android.adaptiveIcon.monochromeImage,
]) {
  assert.ok(fs.existsSync(path.join(root, 'apps/mobile', asset)), asset);
}
const adaptive = await sharp(read('apps/mobile/assets/brand/adaptive-foreground.png'))
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const maskable = await sharp(read(`${publicDir}/brand/icon-maskable-512.png`))
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
let adaptiveCount = 0;
for (let y = 0; y < 1024; y++)
  for (let x = 0; x < 1024; x++) {
    const i = (y * 1024 + x) * 4;
    if (adaptive.data[i + 3] > 0) {
      assert.ok(Math.hypot(x - 512, y - 512) <= (1024 * 33) / 108, `Android safe zone ${x},${y}`);
      for (let channel = 0; channel < 3; channel++) assert.equal(adaptive.data[i + channel], 255);
      adaptiveCount++;
    }
  }
assert.ok(adaptiveCount > 10000, 'Adaptive artwork must not be empty');
for (let y = 0; y < 512; y++)
  for (let x = 0; x < 512; x++) {
    const i = (y * 512 + x) * 4;
    assert.equal(maskable.data[i + 3], 255, 'Maskable background must be opaque');
    if (maskable.data[i] > 100)
      assert.ok(Math.hypot(x - 256, y - 256) <= 512 * 0.4, `PWA safe zone ${x},${y}`);
  }
const sandbox = {
  self: { location: { origin: 'https://daynori.test' }, addEventListener() {} },
  URL,
};
vm.createContext(sandbox);
vm.runInContext(read(`${publicDir}/sw.js`).toString(), sandbox);
for (const asset of publicAssets)
  assert.equal(sandbox.isAllowlistedStaticAsset(`https://daynori.test${asset}`), true, asset);
for (const asset of [
  '/api/private',
  '/brand/private.png',
  '/brand/icon-512.png?token=synthetic',
  '/brand/icon-512.png?_rsc=1',
]) {
  assert.equal(sandbox.isAllowlistedStaticAsset(`https://daynori.test${asset}`), false, asset);
}
assert.equal(sandbox.isAllowlistedStaticAsset('https://other.test/brand/icon-512.png'), false);
console.log(
  'PASS: PWA dimensions, native asset references, Android/PWA safe zones, white alpha artwork, public cache allowlist and private/query/origin denials.'
);

const nativeSymbol = await getAssetData(
  path.join(root, 'packages/ui-mobile/assets/daynori-symbol.png'),
  'packages/ui-mobile/assets/daynori-symbol.png',
  [],
  'android',
  '/assets'
);
assert.equal(nativeSymbol.width, 288);
assert.equal(nativeSymbol.height, 288);
console.log(
  'PASS: Metro reads the bundled native PNG through the patched image-size v2 interface.'
);

const baseUrl = process.argv[2];
if (baseUrl) {
  assert.ok(
    ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(baseUrl).hostname),
    'HTTP smoke is local only'
  );
  for (const asset of publicAssets)
    assert.equal((await fetch(new URL(asset, baseUrl))).status, 200, asset);
  const html = await (await fetch(new URL('/today', baseUrl))).text();
  assert.ok(html.includes('/brand/daynori-logo.svg'));
  assert.ok(html.includes('rel="apple-touch-icon"'));
  assert.ok(html.includes('content="#146B63"'));
  console.log(
    `PASS: ${publicAssets.length} public assets served over HTTP; production HTML logo, Apple icon and theme metadata.`
  );
}
