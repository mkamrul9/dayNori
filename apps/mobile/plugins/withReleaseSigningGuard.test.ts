import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  neutralizeStaleReleaseSigning,
  GUARD_MARKER,
} = require('./withReleaseSigningGuard.js') as {
  neutralizeStaleReleaseSigning: (s: string) => string;
  GUARD_MARKER: string;
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
});
