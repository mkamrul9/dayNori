/**
 * Expo config plugin — refuse silent debug.keystore use on the distributable release path.
 * Local test signing must set DAYNORI_ALLOW_DEBUG_RELEASE_SIGNING=true explicitly.
 */
const { withAppBuildGradle } = require('@expo/config-plugins');

const GUARD_MARKER = 'daynoriReleaseSigningGuard';

const GUARD_BLOCK = `
// ${GUARD_MARKER}: fail closed unless owner release keystore env is set.
def daynoriStorePath = System.getenv("DAYNORI_RELEASE_STORE_FILE")
def daynoriStorePass = System.getenv("DAYNORI_RELEASE_STORE_PASSWORD")
def daynoriKeyAlias = System.getenv("DAYNORI_RELEASE_KEY_ALIAS")
def daynoriKeyPass = System.getenv("DAYNORI_RELEASE_KEY_PASSWORD")
def daynoriAllowDebugRelease = System.getenv("DAYNORI_ALLOW_DEBUG_RELEASE_SIGNING") == "true"
android {
    signingConfigs {
        release {
            if (daynoriStorePath != null && daynoriStorePass != null && daynoriKeyAlias != null && daynoriKeyPass != null) {
                storeFile file(daynoriStorePath)
                storePassword daynoriStorePass
                keyAlias daynoriKeyAlias
                keyPassword daynoriKeyPass
            } else if (daynoriAllowDebugRelease) {
                // Explicit LOCAL TEST profile — never an approved release candidate.
                storeFile file("\${System.getProperty("user.home")}/.android/debug.keystore")
                storePassword "android"
                keyAlias "androiddebugkey"
                keyPassword "android"
                logger.warn("DAYNORI_ALLOW_DEBUG_RELEASE_SIGNING: debug-signed test artifact only")
            } else {
                throw new GradleException("Release signing refused: set DAYNORI_RELEASE_STORE_* credentials, or explicitly DAYNORI_ALLOW_DEBUG_RELEASE_SIGNING=true for local test-only builds. Silent debug.keystore fallback is disabled.")
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
`;

function withReleaseSigningGuard(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      return cfg;
    }
    if (cfg.modResults.contents.includes(GUARD_MARKER)) {
      return cfg;
    }
    cfg.modResults.contents = `${cfg.modResults.contents}\n${GUARD_BLOCK}\n`;
    return cfg;
  });
}

module.exports = withReleaseSigningGuard;
