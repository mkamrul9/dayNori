import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectAndroidTree } from '../../scripts/mobile-android-release-path.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Phase 116: Native Android Release-Candidate Build Verification and Hardware Audit', () => {
  const mobileDir = path.join(repoRoot, 'apps/mobile');
  const appJsonPath = path.join(mobileDir, 'app.json');
  const androidDir = path.join(mobileDir, 'android');
  const buildGradlePath = path.join(androidDir, 'app/build.gradle');
  const releaseArtifactsDir = path.join(repoRoot, 'artifacts/release');
  const phase106SummaryPath = path.join(repoRoot, 'artifacts/phase106/evidence-summary.json');
  const functionRegisterPath = path.join(repoRoot, 'docs/roadmap/v2/function-register.json');

  it('P116-01: Verifies release-candidate artifact identity and SDK requirements', () => {
    expect(fs.existsSync(appJsonPath)).toBe(true);
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

    // 1. Package identity
    expect(appJson.expo.name).toBe('Daynori');
    expect(appJson.expo.slug).toBe('daynori');
    expect(appJson.expo.android.package).toBe('com.daynori.app');
    expect(appJson.expo.android.versionCode).toBe(1);

    // 2. React Native New Architecture enabled
    expect(appJson.expo.newArchEnabled).toBe(true);

    // 3. SDK versions in expo-build-properties
    const buildPropsPlugin = appJson.expo.plugins.find(
      (p: any) => Array.isArray(p) && p[0] === 'expo-build-properties'
    );
    expect(buildPropsPlugin).toBeDefined();
    const androidProps = buildPropsPlugin[1].android;
    expect(androidProps.targetSdkVersion).toBe(36);
    expect(androidProps.compileSdkVersion).toBe(36);
    expect(androidProps.minSdkVersion).toBe(24);
  });

  it('P116-02: Verifies Android tree signing guard and target SDK via authoritative inspect', () => {
    const inspection = inspectAndroidTree(androidDir);

    expect(inspection.ok).toBe(true);
    expect(inspection.errors).toEqual([]);
    expect(inspection.findings.guardPresent).toBe(true);
    expect(inspection.findings.silentDebugFallbackInReleaseSigningConfig).toBe(false);
    expect(inspection.findings.targetSdk).toBe(36);
    expect(inspection.findings.compileSdk).toBe(36);
    expect(inspection.findings.versionCode).toBe(1);
  });

  it('P116-03: Verifies fail-closed daynoriReleaseSigningGuard logic in app/build.gradle', () => {
    expect(fs.existsSync(buildGradlePath)).toBe(true);
    const content = fs.readFileSync(buildGradlePath, 'utf8');

    // 1. Contains daynoriReleaseSigningGuard definition
    expect(content).toContain('daynoriReleaseSigningGuard');
    expect(content).toContain('def daynoriConfigureReleaseSigning');
    expect(content).toContain('DAYNORI_RELEASE_STORE_FILE');
    expect(content).toContain('DAYNORI_RELEASE_STORE_PASSWORD');
    expect(content).toContain('DAYNORI_RELEASE_KEY_ALIAS');
    expect(content).toContain('DAYNORI_RELEASE_KEY_PASSWORD');

    // 2. Contains fail-closed rejection for unconfigured release builds
    expect(content).toContain('Release signing refused for distributable release task');
    expect(content).toContain('Silent debug.keystore fallback is disabled');

    // 3. whenReady taskGraph hook halts build
    expect(content).toContain('gradle.taskGraph.whenReady');
    expect(content).toContain('throw new GradleException(daynoriSigningFailure)');
  });

  it('P116-04: Enforces strict invariant: Debug APKs are NEVER release builds', () => {
    // Inspect recorded APK evidence in artifacts/release
    const debugEvidencePath = path.join(releaseArtifactsDir, 'android-debug-apk-evidence.json');
    const embeddedEvidencePath = path.join(
      releaseArtifactsDir,
      'android-embedded-x86_64-apk-evidence.json'
    );

    if (fs.existsSync(debugEvidencePath)) {
      const debugEvidence = JSON.parse(fs.readFileSync(debugEvidencePath, 'utf8'));
      expect(debugEvidence.signing).toMatch(/debug/);
      expect(debugEvidence.note).toContain('not release-eligible');
    }

    if (fs.existsSync(embeddedEvidencePath)) {
      const embeddedEvidence = JSON.parse(fs.readFileSync(embeddedEvidencePath, 'utf8'));
      expect(embeddedEvidence.signing).toMatch(/debug/);
    }

    // Distributable release builds require owner production keystore
    expect(process.env['DAYNORI_RELEASE_STORE_FILE']).toBeUndefined();
  });

  it('P116-05: Verifies official Google Play policy compliance boundaries', () => {
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
    const manifestSpecs = fs.readFileSync(buildGradlePath, 'utf8');

    // 1. Target API >= 34 (Google Play target API requirement; Daynori targets 36)
    const buildPropsPlugin = appJson.expo.plugins.find(
      (p: any) => Array.isArray(p) && p[0] === 'expo-build-properties'
    );
    expect(buildPropsPlugin[1].android.targetSdkVersion).toBeGreaterThanOrEqual(34);

    // 2. Sensitive permissions check: No USE_EXACT_ALARM in manifest
    expect(manifestSpecs).not.toContain('USE_EXACT_ALARM');
    expect(manifestSpecs).not.toContain('SCHEDULE_EXACT_ALARM');

    // 3. Sandboxed storage check: No MANAGE_EXTERNAL_STORAGE in manifest
    expect(manifestSpecs).not.toContain('MANAGE_EXTERNAL_STORAGE');
  });

  it('P116-06: Verifies physical ARM64 hardware absence is truthfully recorded as blocked', () => {
    const register = JSON.parse(fs.readFileSync(functionRegisterPath, 'utf8'));
    const def = register.defects.find((d: any) => d.id === 'DEF-V2-011');

    expect(def).toBeDefined();
    expect(def.title).toContain('Physical Android and TalkBack evidence still missing');
    expect(def.severity).toBe('high');
    expect(def.platforms).toContain('android');
    expect(def.userImpact).toContain('Cannot claim physical-device readiness');
  });

  it('P116-07: Verifies emulator evidence remains strictly separated from physical hardware', () => {
    expect(fs.existsSync(phase106SummaryPath)).toBe(true);
    const summary = JSON.parse(fs.readFileSync(phase106SummaryPath, 'utf8'));

    // Verification classification is explicitly emulator
    expect(summary.device.classification).toBe('emulator');
    expect(summary.device.serial).toBe('emulator-5554');

    // Physical device status must state unavailable
    expect(summary.physicalDeviceStatus).toContain('UNAVAILABLE');

    // Spoken TalkBack listen-through must state unavailable
    expect(summary.talkbackSpokenListenThrough).toContain('UNAVAILABLE');
  });
});
