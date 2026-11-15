import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const releaseDir = path.join(root, 'artifacts', 'release');
fs.mkdirSync(releaseDir, { recursive: true });

const webTar = path.join(releaseDir, 'daynori-web-v2.0.0-rc5.tar.gz');
console.log('Packaging Web rc5 tarball...');
execSync(`tar --exclude=.next/cache -czf "${webTar}" -C "${path.join(root, 'apps', 'web')}" .next public package.json next.config.mjs`, {
  stdio: 'inherit',
});

const apiTar = path.join(releaseDir, 'daynori-api-v2.0.0-rc5.tar.gz');
console.log('Packaging API rc5 tarball...');
execSync(`tar -czf "${apiTar}" -C "${path.join(root, 'apps', 'api')}" dist package.json`, {
  stdio: 'inherit',
});

function hashFile(file) {
  const content = fs.readFileSync(file);
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  const size = fs.statSync(file).size;
  return { file: path.basename(file), hash, size };
}

const webInfo = hashFile(webTar);
const apiInfo = hashFile(apiTar);

console.log('Packaging Complete:');
console.log('Web:', JSON.stringify(webInfo, null, 2));
console.log('API:', JSON.stringify(apiInfo, null, 2));
