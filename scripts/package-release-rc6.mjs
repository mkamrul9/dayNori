import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const releaseDir = path.join(root, 'artifacts', 'release');
fs.mkdirSync(releaseDir, { recursive: true });

const webTar = path.join(releaseDir, 'daynori-web-v2.0.0-rc6.tar.gz');
console.log('Packaging Web rc6 tarball...');
execSync(`tar --exclude=.next/cache -czf "${webTar}" -C "${path.join(root, 'apps', 'web')}" .next public package.json next.config.mjs`, {
  stdio: 'inherit',
});

const apiTar = path.join(releaseDir, 'daynori-api-v2.0.0-rc6.tar.gz');
console.log('Packaging API rc6 tarball...');
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

const manifest = {
  candidate: '2.0.0-rc6',
  packagedAt: new Date().toISOString(),
  gitCommit: execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim(),
  buildId: fs.readFileSync(path.join(root, 'apps', 'web', '.next', 'BUILD_ID'), 'utf8').trim(),
  nodeEngineRequirement: '^24.21.0',
  artifacts: [webInfo, apiInfo],
};

const manifestPath = path.join(releaseDir, 'candidate-2.0.0-rc6-manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

console.log('\nPackaging Complete:');
console.log(JSON.stringify(manifest, null, 2));
