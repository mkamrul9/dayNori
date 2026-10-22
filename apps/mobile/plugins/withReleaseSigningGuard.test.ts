import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { neutralizeStaleReleaseSigning, GUARD_MARKER, applyReleaseSigningGuard } =
  require('./withReleaseSigningGuard.js') as {
    neutralizeStaleReleaseSigning: (s: string) => string;
    GUARD_MARKER: string;
    applyReleaseSigningGuard: (source: string) => string;
  };

const STALE_GRADLE = `
android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            if (System.getenv("ANDROID_KEYSTORE_PATH") != null && file(System.getenv("ANDROID_KEYSTORE_PATH")).exists()) {
                storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))
            } else {
                // Local build fallback when release keystore is not externally supplied
                storeFile file('debug.keystore')
                storePassword 'android'
                keyAlias 'androiddebugkey'
                keyPassword 'android'
            }
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
        }
    }
}
`;

describe('withReleaseSigningGuard neutralization', () => {
  it('removes silent debug.keystore fallback from signingConfigs.release', () => {
    const out = neutralizeStaleReleaseSigning(STALE_GRADLE);
    expect(out).not.toMatch(/Local build fallback when release keystore/);
    expect(out).toMatch(/Populated only by daynoriReleaseSigningGuard/);
    expect(out).toMatch(/debug\s*\{[\s\S]*signingConfig\s+signingConfigs\.debug/);
    expect(out).toMatch(/signingConfig assigned by daynoriReleaseSigningGuard whenReady/);
    const releaseCfg = out.match(/signingConfigs\s*\{[\s\S]*\brelease\s*\{([\s\S]*?)\n\s*\}/);
    expect(releaseCfg?.[1] ?? '').not.toMatch(/debug\.keystore/);
  });

  it('exports guard marker constant', () => {
    expect(GUARD_MARKER).toBe('daynoriReleaseSigningGuard');
  });

  it('upgrades a previous guard without duplicating it or removing later native configuration', () => {
    const original =
      STALE_GRADLE +
      '\n// daynoriReleaseSigningGuard\ngradle.taskGraph.whenReady { graph -> throw new GradleException("old guard") }\n// retained native configuration\n';
    const once = applyReleaseSigningGuard(original);
    const twice = applyReleaseSigningGuard(once);
    expect(twice).toBe(once);
    expect(once).toContain('// retained native configuration');
    expect(once).not.toContain('"old guard"');
    expect(once.match(/gradle\.taskGraph\.whenReady/g)).toHaveLength(1);
  });

  it('refuses to overwrite a malformed existing guard', () => {
    expect(() =>
      applyReleaseSigningGuard(STALE_GRADLE + '\n// daynoriReleaseSigningGuard\nmalformed')
    ).toThrow('Malformed existing');
  });

  it('leaves whenReady absent after neutralization so the plugin must append the guard block', () => {
    const neutralized = neutralizeStaleReleaseSigning(STALE_GRADLE);
    expect(neutralized).toContain('daynoriReleaseSigningGuard');
    expect(neutralized).not.toContain('gradle.taskGraph.whenReady');
    // Block anchor is exactly "// daynoriReleaseSigningGuard" — comment text alone must not count.
    expect(neutralized.includes('// daynoriReleaseSigningGuard')).toBe(false);
  });
});
