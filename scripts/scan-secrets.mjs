import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Secret patterns to flag
const PATTERNS = [
  { name: 'RSA/EC Private Key', regex: /-----BEGIN [A-Z]+ PRIVATE KEY-----/ },
  { name: 'AWS Access Key ID', regex: /\b(AKIA|ABIA|ACCA)[0-9A-Z]{16}\b/ },
  { name: 'GitHub Personal Access Token', regex: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36}\b/ },
  { name: 'Generic Private Key', regex: /PRIVATE_KEY\s*=\s*['"][^'"]{20,}['"]/i },
  {
    name: 'High-entropy Password assignment',
    regex: /(?:password|secret|api_key)\s*[:=]\s*['"][A-Za-z0-9+/=_-]{24,}['"]/i,
  },
  { name: 'Slack Bot Token', regex: /\bxox[baprs]-[0-9A-Za-z]{10,48}\b/ },
  { name: 'Stripe Secret Key', regex: /\b(?:sk|rk)_(?:live|test)_[0-9a-zA-Z]{24,}\b/ },
];

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  '.next',
  '.expo',
  'dist',
  'build',
  'coverage',
  '.turbo',
]);

const IGNORED_FILES = new Set([
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'scripts/scan-secrets.mjs',
]);

function walk(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

let exceptions = [];
const exceptionsPath = path.join(root, '.security-exceptions.json');
if (fs.existsSync(exceptionsPath)) {
  try {
    const raw = JSON.parse(fs.readFileSync(exceptionsPath, 'utf8'));
    exceptions = raw.allowedSecretPatterns ?? [];
  } catch (err) {
    console.error('Warning: Failed to parse .security-exceptions.json:', err.message);
  }
}

const files = walk(root);
const violations = [];

for (const file of files) {
  const relative = path.relative(root, file).replace(/\\/g, '/');
  if (IGNORED_FILES.has(relative) || relative.startsWith('artifacts/')) continue;

  // Skip binary files and images
  if (/\.(png|jpg|jpeg|gif|webp|ico|svg|woff|woff2|ttf|eot|pdf|hbc)$/i.test(file)) continue;

  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  const lines = content.split('\n');
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    for (const pattern of PATTERNS) {
      if (pattern.regex.test(line)) {
        const isExcepted = exceptions.some(
          (ex) => ex.file === relative && (ex.line === lineIndex + 1 || ex.pattern === pattern.name)
        );
        if (!isExcepted) {
          violations.push({
            file: relative,
            line: lineIndex + 1,
            rule: pattern.name,
            snippet: line.trim().slice(0, 80),
          });
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error(`Found ${violations.length} potential secret(s) or sensitive credential(s):`);
  for (const v of violations) {
    console.error(`  - ${v.file}:${v.line} [${v.rule}]: ${v.snippet}`);
  }
  process.exit(1);
} else {
  console.log(
    `Secret scanning passed: checked ${files.length} files without detecting unapproved secrets.`
  );
}
