/**
 * Expo config plugin — fail-closed release signing without breaking debug/configure.
 *
 * - Ordinary debug builds and harmless Gradle configuration tasks do not require credentials.
 * - Distributable release assemble/bundle tasks fail closed without complete owner credentials.
 * - Explicit DAYNORI_ALLOW_DEBUG_RELEASE_SIGNING=true produces a clearly labeled local-test
 *   debug-signed artifact that release-eligibility checks must reject.
 * - Accepts DAYNORI_RELEASE_* (preferred) or ANDROID_KEYSTORE_* (beta docs alias).
 * - Removes Expo/stale silent debug.keystore fallbacks from signingConfigs.release.
 */
const { withAppBuildGradle } = require('@expo/config-plugins');

const GUARD_MARKER = 'daynoriReleaseSigningGuard';

/**
 * Find a balanced `{ ... }` block starting at openBraceIndex (index of `{`).
 * @returns {{ end: number, inner: string } | null}
 */
function balancedBlock(source, openBraceIndex) {
  if (source[openBraceIndex] !== '{') return null;
  let depth = 0;
  for (let i = openBraceIndex; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return { end: i, inner: source.slice(openBraceIndex + 1, i) };
      }
    }
  }
  return null;
}

/**
 * Locate `release { ... }` nested inside the first `signingConfigs { ... }` block.
 */
function replaceSigningConfigsRelease(gradleContents) {
  const scMatch = /signingConfigs\s*\{/.exec(gradleContents);
  if (!scMatch) return gradleContents;
  const scOpen = scMatch.index + scMatch[0].length - 1;
  const scBlock = balancedBlock(gradleContents, scOpen);
  if (!scBlock) return gradleContents;

  const inner = scBlock.inner;
  const relMatch = /\brelease\s*\{/.exec(inner);
  if (!relMatch) return gradleContents;

  const relOpenInInner = relMatch.index + relMatch[0].length - 1;
  const relBlock = balancedBlock(inner, relOpenInInner);
  if (!relBlock) return gradleContents;

  const absoluteRelOpen = scOpen + 1 + relOpenInInner;
  const absoluteRelEnd = scOpen + 1 + relBlock.end;
  const replacement = `{
            // Populated only by ${GUARD_MARKER} whenReady for distributable release tasks.
        }`;

  return (
    gradleContents.slice(0, absoluteRelOpen) + replacement + gradleContents.slice(absoluteRelEnd + 1)
  );
}

/**
 * Inside buildTypes.release, detach eager signingConfig assignments.
 */
function detachReleaseBuildTypeSigning(gradleContents) {
  const btMatch = /buildTypes\s*\{/.exec(gradleContents);
  if (!btMatch) return gradleContents;
  const btOpen = btMatch.index + btMatch[0].length - 1;
  const btBlock = balancedBlock(gradleContents, btOpen);
  if (!btBlock) return gradleContents;

  const inner = btBlock.inner;
  const relMatch = /\brelease\s*\{/.exec(inner);
  if (!relMatch) return gradleContents;

  const relOpenInInner = relMatch.index + relMatch[0].length - 1;
  const relBlock = balancedBlock(inner, relOpenInInner);
  if (!relBlock) return gradleContents;

  let body = relBlock.inner;
  body = body.replace(/^[ \t]*signingConfig\s+signingConfigs\.debug[ \t]*\r?\n?/gm, '');
  body = body.replace(
    /^[ \t]*signingConfig\s+signingConfigs\.release[ \t]*\r?\n?/gm,
    '            // signingConfig assigned by daynoriReleaseSigningGuard whenReady\n'
  );

  const absoluteRelOpen = btOpen + 1 + relOpenInInner;
  const absoluteRelEnd = btOpen + 1 + relBlock.end;
  return (
    gradleContents.slice(0, absoluteRelOpen + 1) + body + gradleContents.slice(absoluteRelEnd)
  );
}

function neutralizeStaleReleaseSigning(gradleContents) {
  let contents = replaceSigningConfigsRelease(gradleContents);
  contents = detachReleaseBuildTypeSigning(contents);
  contents = contents.replace(
    /[ \t]*\/\/[ \t]*Local build fallback when release keystore is not externally supplied\r?\n/g,
    ''
  );
  return contents;
}

const GUARD_BLOCK = `
// ${GUARD_MARKER}
// Credentials are resolved at task-graph ready time so debug/configure stay usable.
ext.daynoriReleaseSigning = [
    storeFileEnv: System.getenv("DAYNORI_RELEASE_STORE_FILE") ?: System.getenv("ANDROID_KEYSTORE_PATH"),
    storePassEnv: System.getenv("DAYNORI_RELEASE_STORE_PASSWORD") ?: System.getenv("ANDROID_KEYSTORE_PASSWORD"),
    keyAliasEnv: System.getenv("DAYNORI_RELEASE_KEY_ALIAS") ?: System.getenv("ANDROID_KEY_ALIAS"),
    keyPassEnv: System.getenv("DAYNORI_RELEASE_KEY_PASSWORD") ?: System.getenv("ANDROID_KEY_PASSWORD"),
    allowDebugRelease: (System.getenv("DAYNORI_ALLOW_DEBUG_RELEASE_SIGNING") == "true")
]

def daynoriIsDistributableReleaseTask = { task ->
    def n = task.name.toLowerCase()
    def releaseish = n.contains("release")
    def packaging = n.contains("assemble") || n.contains("bundle") || n.contains("package") || n.contains("install")
    return releaseish && packaging
}

gradle.taskGraph.whenReady { graph ->
    def releasing = graph.allTasks.any { daynoriIsDistributableReleaseTask(it) }
    if (!releasing) {
        return
    }

    def storePath = ext.daynoriReleaseSigning.storeFileEnv
    def storePass = ext.daynoriReleaseSigning.storePassEnv
    def keyAlias = ext.daynoriReleaseSigning.keyAliasEnv
    def keyPass = ext.daynoriReleaseSigning.keyPassEnv
    def allowDebug = ext.daynoriReleaseSigning.allowDebugRelease

    def hasComplete = storePath && storePath.toString().trim() &&
        storePass && storePass.toString().trim() &&
        keyAlias && keyAlias.toString().trim() &&
        keyPass && keyPass.toString().trim()

    if (hasComplete) {
        def kf = file(storePath)
        if (!kf.exists()) {
            throw new GradleException("Release signing refused: keystore file does not exist (path redacted).")
        }
        android.signingConfigs.release.storeFile = kf
        android.signingConfigs.release.storePassword = storePass
        android.signingConfigs.release.keyAlias = keyAlias
        android.signingConfigs.release.keyPassword = keyPass
        android.buildTypes.release.signingConfig = android.signingConfigs.release
        return
    }

    if (allowDebug) {
        def debugKs = file("\${System.getProperty('user.home')}/.android/debug.keystore")
        if (!debugKs.exists()) {
            debugKs = file("\${project.projectDir}/debug.keystore")
        }
        if (!debugKs.exists()) {
            throw new GradleException("DAYNORI_ALLOW_DEBUG_RELEASE_SIGNING set but debug.keystore is missing.")
        }
        android.signingConfigs.release.storeFile = debugKs
        android.signingConfigs.release.storePassword = "android"
        android.signingConfigs.release.keyAlias = "androiddebugkey"
        android.signingConfigs.release.keyPassword = "android"
        android.buildTypes.release.signingConfig = android.signingConfigs.release
        logger.warn("DAYNORI_ALLOW_DEBUG_RELEASE_SIGNING: producing DEBUG-SIGNED local-test artifact only — not release-eligible")
        return
    }

    throw new GradleException("Release signing refused for distributable release task: set complete DAYNORI_RELEASE_STORE_* (or ANDROID_KEYSTORE_*) credentials, or explicitly DAYNORI_ALLOW_DEBUG_RELEASE_SIGNING=true for local-test-only debug signing. Silent debug.keystore fallback is disabled.")
}
`;

function withReleaseSigningGuard(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      return cfg;
    }
    let contents = neutralizeStaleReleaseSigning(cfg.modResults.contents);
    if (!contents.includes(GUARD_MARKER)) {
      contents = `${contents}\n${GUARD_BLOCK}\n`;
    }
    cfg.modResults.contents = contents;
    return cfg;
  });
}

module.exports = withReleaseSigningGuard;
module.exports.neutralizeStaleReleaseSigning = neutralizeStaleReleaseSigning;
module.exports.GUARD_MARKER = GUARD_MARKER;
