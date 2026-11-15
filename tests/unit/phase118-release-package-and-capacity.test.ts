import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Phase 118: Daynori Web-Core Release Packaging & Capacity Planning Unit Tests', () => {
  const artifactsReleaseDir = path.join(repoRoot, 'artifacts/release');
  const phase118Dir = path.join(repoRoot, 'artifacts/phase118');
  const manifestPath = path.join(phase118Dir, 'release-candidate-manifest.json');
  const configPath = path.join(phase118Dir, 'configuration-inventory.json');
  const hostingMatrixPath = path.join(phase118Dir, 'costed-hosting-matrix.json');
  const rollbackRunbookPath = path.join(phase118Dir, 'rollback-package-runbook.md');
  const architectureDocPath = path.join(phase118Dir, 'production-architecture-and-capacity-plan.md');

  it('verifies Candidate 2.0.0-rc4 Web and API immutable release archives exist and match exact SHA-256 digests', () => {
    const webTarballPath = path.join(artifactsReleaseDir, 'daynori-web-v2.0.0-rc4.tar.gz');
    const apiTarballPath = path.join(artifactsReleaseDir, 'daynori-api-v2.0.0-rc4.tar.gz');

    expect(fs.existsSync(webTarballPath)).toBe(true);
    expect(fs.existsSync(apiTarballPath)).toBe(true);

    const webBytes = fs.readFileSync(webTarballPath);
    const webSha256 = crypto.createHash('sha256').update(webBytes).digest('hex');
    expect(webSha256).toBe('9c67b4009a802c9a60ac96731b43dae55d0c126503ea624d99975e6d691eb280');
    expect(webBytes.length).toBe(1825996);

    const apiBytes = fs.readFileSync(apiTarballPath);
    const apiSha256 = crypto.createHash('sha256').update(apiBytes).digest('hex');
    expect(apiSha256).toBe('42b5f7222422796847f3987ae95ce58fb65aaa13be2bd9e484555a0c0dc43d37');
    expect(apiBytes.length).toBe(559223);
  });

  it('verifies release candidate manifest records build SHA, git revision, and toolchain Node v24.21.0', () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    expect(manifest.manifestVersion).toBe('2.0.0-rc4');
    expect(manifest.gitRevision).toBe('3aebd74ac55b53d57ce7ab1274a0c9022c07422c');
    expect(manifest.toolchain.node).toBe('v24.21.0');
    expect(manifest.build.webBuildId).toBe('6BXhesAWPN88FbHwp-Q4g');
    expect(manifest.build.compiledRoutesCount).toBe(32);

    // Verify historical baseline comparisons
    expect(manifest.historicalBaselines.rc3.sha256).toBe(
      '508adab6404b31d51ddbce59a517ed6df017a5a707781f2432e9682006452830'
    );
    expect(manifest.historicalBaselines.rc3.toolchainNode).toBe('v24.11.1');
    expect(manifest.historicalBaselines.rc3.gitRevision).toBe('e71842f');

    // Verify client asset hashes
    expect(manifest.individualClientAssetHashes.manifestJson).toBe(
      '417faac1bd5c0d083657a7a69c645a2387c797e1ac60500f462d9db3d280cf40'
    );
    expect(manifest.individualClientAssetHashes.serviceWorkerJs).toBe(
      '6e243130bed7d29e51c330a378380805f87539798692abe5c4f8127bb1f70cb3'
    );
    expect(manifest.individualClientAssetHashes.offlineShellHtml).toBe(
      '1b0bf5f65c8d7330d0560fe41acc73a6a9806e9b7aff5cb60daacfc0fbd009cc'
    );
  });

  it('verifies configuration inventory strictly excludes secret values and enforces fail-closed barriers', () => {
    expect(fs.existsSync(configPath)).toBe(true);
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    expect(config.securityPolicy.credentialsInGit).toBe('STRICTLY_PROHIBITED');
    expect(config.securityPolicy.credentialsInLogs).toBe('STRICTLY_PROHIBITED');
    expect(config.securityPolicy.unreleasedModules).toBe('FAIL_CLOSED_GATED');

    const apiVars = config.environments.api.variables;
    const dbVar = apiVars.find((v: any) => v.name === 'DATABASE_URL');
    expect(dbVar.isSecret).toBe(true);
    expect(dbVar.value).toBeUndefined(); // Must never contain a literal secret value

    const serviceRoleVar = apiVars.find((v: any) => v.name === 'SUPABASE_SERVICE_ROLE_KEY');
    expect(serviceRoleVar.isSecret).toBe(true);
    expect(serviceRoleVar.value).toBeUndefined();

    // Verify unreleased feature flags default to false
    const webVars = config.environments.web.variables;
    const vaultFlag = webVars.find((v: any) => v.name === 'NEXT_PUBLIC_FEATURE_VAULT');
    expect(vaultFlag.default).toBe('false');
    const aiFlag = webVars.find((v: any) => v.name === 'NEXT_PUBLIC_FEATURE_AI');
    expect(aiFlag.default).toBe('false');
  });

  it('verifies costed hosting matrix models 1,000-10,000 MAU and audits Render free-tier failure modes', () => {
    expect(fs.existsSync(hostingMatrixPath)).toBe(true);
    const matrix = JSON.parse(fs.readFileSync(hostingMatrixPath, 'utf8'));

    expect(matrix.targetAudience).toContain('1,000 to 10,000 Monthly Active Users');
    expect(matrix.currentFreeTierAudit.monthlyCost).toBe('$0.00/month');

    // Verify failure modes include instance hours and sleep
    const limits = matrix.currentFreeTierAudit.limitations.map((l: any) => l.component);
    expect(limits).toContain('Render Web/API Compute');
    expect(limits).toContain('Render Inactivity Sleep');
    expect(limits).toContain('Supabase Database Storage');
    expect(limits).toContain('Supabase Connection Pool');

    // Verify recommended option is Option 1 (Managed PaaS)
    expect(matrix.recommendation.selectedOption).toBe('option-1-managed-paas');
    expect(matrix.recommendation.budgetEnvelope).toContain('$80.00 - $120.00 / month');
  });

  it('verifies rollback runbook defines non-destructive additive schema and automated triggers', () => {
    expect(fs.existsSync(rollbackRunbookPath)).toBe(true);
    const content = fs.readFileSync(rollbackRunbookPath, 'utf8');

    expect(content).toContain('TRG-01');
    expect(content).toContain('TRG-02');
    expect(content).toContain('TRG-03');
    expect(content).toContain('offline-shell.html');
    expect(content).toContain('1b0bf5f65c8d7330d0560fe41acc73a6a9806e9b7aff5cb60daacfc0fbd009cc');
    expect(content).toContain('additive');
  });

  it('verifies public architecture document covers all 10 core service dimensions', () => {
    expect(fs.existsSync(architectureDocPath)).toBe(true);
    const content = fs.readFileSync(architectureDocPath, 'utf8');

    expect(content).toContain('2.1 Web Frontend Service');
    expect(content).toContain('2.2 Backend API Service');
    expect(content).toContain('2.3 Database & Data Persistence');
    expect(content).toContain('2.4 Authentication & Identity Provider');
    expect(content).toContain('2.5 Object & Attachment Storage');
    expect(content).toContain('2.6 Background Job Processing');
    expect(content).toContain('2.7 DNS, TLS & Edge Security');
    expect(content).toContain('2.8 Backup & Disaster Recovery');
    expect(content).toContain('2.9 Monitoring, Observability & Telemetry');
    expect(content).toContain('2.10 Customer Support & Operational Delivery');
  });

  it('verifies all 80 database migrations are present and additive SQL files', () => {
    const migrationsDir = path.join(repoRoot, 'infra/supabase/migrations');
    expect(fs.existsSync(migrationsDir)).toBe(true);

    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
    expect(files.length).toBe(80);
    expect(files[0]).toContain('00001_initial_schema.sql');
    expect(files[79]).toContain('00080_ai_transcriptions.sql');
  });
});
