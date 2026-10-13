import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Secret patterns to flag
export const PATTERNS = [
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

export const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  '.next',
  '.expo',
  'dist',
  'build',
  'coverage',
  '.turbo',
  'apps/mobile/android',
  'apps/mobile/ios',
]);

export const IGNORED_FILES = new Set([
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'scripts/scan-secrets.mjs',
]);

export function walk(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    const relative = path.relative(root, fullPath).replace(/\\/g, '/');
    if (IGNORED_DIRS.has(relative)) continue;

    if (entry.isDirectory()) {
      results.push(...walk(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

export function scanFiles(fileList, exceptions = []) {
  const violations = [];
  const readErrors = [];

  for (const file of fileList) {
    const relative = path.relative(root, file).replace(/\\/g, '/');
    if (IGNORED_FILES.has(relative) || relative.startsWith('artifacts/')) continue;

    // Skip binary files and images
    if (
      /\.(png|jpg|jpeg|gif|webp|ico|svg|woff|woff2|ttf|eot|pdf|hbc|apk|keystore|jks)$/i.test(file)
    )
      continue;

    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch (err) {
      readErrors.push({ file: relative, message: err.message });
      continue;
    }

    const lines = content.split('\n');
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      for (const pattern of PATTERNS) {
        if (pattern.regex.test(line)) {
          const isExcepted = exceptions.some(
            (ex) =>
              ex.file === relative && (ex.line === lineIndex + 1 || ex.pattern === pattern.name)
          );
          if (!isExcepted) {
            // CRITICAL: Redact secret value; report ONLY file, line, and rule name
            violations.push({
              file: relative,
              line: lineIndex + 1,
              rule: pattern.name,
            });
          }
        }
      }
    }
  }

  return { violations, readErrors };
}

// CLI execution entrypoint
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  let exceptions = [];
  const exceptionsPath = path.join(root, '.security-exceptions.json');
  if (fs.existsSync(exceptionsPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(exceptionsPath, 'utf8'));
      if (!raw || typeof raw !== 'object' || !Array.isArray(raw.allowedSecretPatterns)) {
        console.error(
          'Error: .security-exceptions.json must contain an "allowedSecretPatterns" array.'
        );
        process.exit(1);
      }
      exceptions = raw.allowedSecretPatterns;
    } catch (err) {
      console.error('Error: Failed to parse .security-exceptions.json:', err.message);
      process.exit(1);
    }
  }

  const files = walk(root);
  const { violations, readErrors } = scanFiles(files, exceptions);

  if (readErrors.length > 0) {
    console.error(`Failed to read ${readErrors.length} file(s) during secret scan:`);
    for (const r of readErrors) {
      console.error(`  - ${r.file}: ${r.message}`);
    }
    process.exit(1);
  }

  if (violations.length > 0) {
    console.error(
      `Found ${violations.length} potential secret(s) or sensitive credential(s) (values redacted):`
    );
    for (const v of violations) {
      console.error(`  - ${v.file}:${v.line} [${v.rule}]`);
    }
    process.exit(1);
  } else {
    console.log(
      `Secret scanning passed: checked ${files.length} files without detecting unapproved secrets.`
    );
  }
}
