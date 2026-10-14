# Phase 01: Toolchain and executable workspace

Status: complete. Report date: 2026-10-13 (Asia/Dhaka). Contributor: Antigravity.

## Identity and scope

- Specification: [Phase 01 — Toolchain and executable workspace](../roadmap/phases/01-toolchain-and-executable-workspace.md).
- Status: `complete`.
- Base revision: `fedafa729b3f74727a50a1e7f6f33cd6a36bfda6` on `main`.
- Initial phase commit: `1043f8d891fc179486ad7b627801eb021c4660e9`.
- Prerequisites: [Phase 00 report](phase-00.md) verified and planning baseline validated.
- Included scope:
  - Root `package.json`, `pnpm-workspace.yaml`, `.npmrc`, `.nvmrc`, `.node-version`, `.prettierrc`, `.prettierignore`, and strict shared TypeScript configurations in `packages/config/`.
  - Replaced reserved directory placeholders with minimal runnable workspaces: `apps/api`, `apps/worker`, `apps/web`, `apps/mobile`.
  - Scaffolding of shared libraries: `packages/design-tokens`, `packages/domain`, `packages/contracts`, `packages/api-client`, `packages/sync`, `packages/ui-web`, `packages/ui-mobile`, and `packages/test-utils`.
  - Fastify health and smoke routes, Next.js web application shell, Expo mobile entrypoint with Metro monorepo configuration, and typed API client.
  - Root verification scripts: `build`, `typecheck`, `test`, `test:contract`, `test:integration`, `test:security`, `test:performance`, `lint`, `format`, `format:check`.
- Excluded scope: product feature screens, database migrations (Phase 07), cloud infrastructure (Phase 07+). Note: Android development build compilation is now verified and included in Phase 01 scope.

## Result

Delivered an executable typed monorepo toolchain spanning 14 workspace projects (root + 4 applications + 9 packages). React 18.3.1 is pinned across the monorepo to maintain binary, bundler, and type compatibility across Expo SDK 52, React Native 0.76.7, and Next.js 14. Node LTS is pinned to `20.18.3` in `.nvmrc`, `.node-version`, and root `package.json` `engines`.

Fastify API exposes typed health and smoke endpoints validated against `@daynori/contracts`. The Next.js web application builds production artifacts with static page generation. The mobile application shell integrates with Metro monorepo resolution, exports Android Hermes bundles, and successfully compiles a full native Android development build APK with `expo-dev-client`. The typed API client interacts with the backend with contract validation.

## Acceptance evidence

1. **Clean workspace installation**:
   - Command: `pnpm install --frozen-lockfile`
   - Exit code: 0
   - Result: All 14 workspace projects resolved, downloaded, and linked without peer dependency errors using `pnpm-lock.yaml`.

2. **Full workspace build**:
   - Command: `pnpm run build`
   - Exit code: 0
   - Result: Exactly 8 shared packages compiled with `tsc -b` (`packages/config` contains shared tsconfig presets and has no build script). Fastify API and background worker compiled to `dist/`. Next.js web application generated production bundles and static routes (`/`, `/_not-found`, `/api/health`). Mobile shell exported Android Hermes bundle (`dist/_expo/static/js/android/index-*.hbc`, 1.55 MB, 547 modules) via `expo export -p android`. Exactly 12 child workspaces execute `build` (Scope: 13 of 14 workspace projects including root).

3. **Strict typechecking**:
   - Command: `pnpm typecheck`
   - Exit code: 0
   - Result: Strict TypeScript typechecking (`noImplicitAny`, `strictNullChecks`, `noUnusedLocals`, `noUnusedParameters`) passed cleanly across all 12 child TypeScript workspaces with typecheck scripts (4 apps + 8 packages; `packages/config` exports only JSON presets). Monorepo scope: 13 of 14 workspace projects.

4. **Compiled Expo Android development build**:
   - Workflow: Configured `expo-dev-client` (~5.0.20) and `expo-modules-autolinking` (~2.0.8) in `apps/mobile/package.json`. Generated native project with `pnpm --filter @daynori/mobile run prebuild`. Compiled debug APK with `./gradlew.bat assembleDebug`.
   - Command: `.\gradlew.bat assembleDebug --stacktrace` in `apps/mobile/android`
   - Exit code: 0 (BUILD SUCCESSFUL, 517 tasks: 222 executed, 295 up-to-date)
   - Artifact: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk` (128,444,244 bytes / ~122.5 MB)
   - Host toolchain: Eclipse Adoptium OpenJDK 17.0.20.1, Android SDK Platform 34/35, Build-Tools 35.0.0, CMake 3.22.1, NDK 26.1.10909125.

5. **Unit, contract, integration, security, and performance test suites**:
   - Command: `pnpm test`
   - Exit code: 0
   - Result: 16 test files passed, 29 tests passed (0 failures).
   - Additional test scripts:
     - `pnpm test:contract`: exit 0 (2 tests passed)
     - `pnpm test:integration`: exit 0 (1 test passed)
     - `pnpm test:security`: exit 0 (1 test passed)
     - `pnpm test:performance`: exit 0 (1 test passed)

6. **Lint and formatting verification**:
   - Command: `pnpm lint` (ESLint 9 with typescript-eslint rules; ignoring generated mobile native build artifacts): exit 0.
   - Command: `pnpm format:check` (Prettier code style check): exit 0.

7. **Development startup and live smoke routes**:
   - Web development: `pnpm dev:web` launched Next.js dev server on `http://localhost:3000`. Live `GET /api/health` returned HTTP 200 with valid `HealthResponse` schema.
   - API development: `pnpm dev:api` launched Fastify using `tsx watch` on `http://127.0.0.1:3001`. Live `GET /health` and `GET /api/v1/smoke` returned HTTP 200 with matching contract schemas.
   - Worker development: `pnpm dev:worker` launched background worker loop using `tsx watch`.
   - Mobile development: `pnpm dev:mobile` successfully runs `expo start` and boots Metro on `http://localhost:8081`.

8. **Negative error verification**:
   - Injected intentional type error into `packages/domain/src/invariants.ts`.
   - Command: `pnpm typecheck`
   - Exit code: 2 (failed as expected with `TS2322`). Reverted cleanly.

## Limitations and recovery

- Physical device biometric testing and cloud background push notification delivery remain gated for dedicated integration phases (Phase 03 feasibility spikes / Phase 06 navigation).
- Hosted CI execution remains local until an authorized Git remote is supplied by the repository owner.

## Documentation and Git review

- Updated workspace READMEs across `apps/` and `packages/` documenting exported modules, statuses, build workflows, and commands.
- Updated root `README.md`, `CONTRIBUTING.md`, `docs/engineering/handoff.md`, and `docs/engineering/repository-layout.md` to reflect the executable repository state.
- Updated `CHANGELOG.md` and `docs/roadmap/progress.json`.
- Ran `node scripts/validate-planning.mjs` (exit 0).
- Initial commit: `1043f8d` (`chore(workspace): establish typed application and package toolchains`).
- Corrective commit 1: `d41f13b` (`fix(workspace): repair mobile build workflow and development startup`).
- Corrective commit 2: `fix(mobile): configure expo development build and update runtime baseline`.

## Handoff

Next eligible phase: [Phase 02 — Continuous checks and contributor automation](../roadmap/phases/02-continuous-checks-and-contributor-automation.md).
Prerequisites satisfied: Phase 01 complete with verified runnable workspaces, package manifests, passing test/typecheck/build/dev commands, and compiled Expo Android development build APK.

## Corrective revision — 2026-10-14

Re-verified by the Phase 04 prerequisite review. Earlier statements above are superseded where they conflict.

- **Runtime**: the `20.18.3` baseline is replaced by Node `24.21.0` (Active LTS "Krypton"; latest LTS entry in the nodejs.org release index checked 2026-10-14). `.nvmrc`, `.node-version`, root `package.json` `engines` (`^24.21.0`) and `contributor-automation.md` agree; CI reads `.nvmrc`. This machine's installed Node is `24.11.1`, so pnpm prints an unsupported-engine warning. All checks below were run with a `24.21.0` binary (`npx node@24.21.0`) placed first on `PATH`.
- **Framework**: `apps/web` now uses Next.js `^15.5.27` (Next 14 has no patched release for current critical advisories); React stays `18.3.1` for Expo SDK 52. Production `next build` succeeded.
- **Commands run under Node 24.21.0** (exit 0 each): `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` (20 files, 63 tests), `pnpm build` (web production build and `expo export -p android`).
- **APK evidence level**: `apps/mobile/android/` is gitignored, so the APK is not reproducible from a clean clone without `pnpm --filter @daynori/mobile run prebuild` and Gradle. The existing file (128,444,244 bytes, written 2026-10-13 23:43 local) is _compilation_ evidence only. No adb device or emulator is available here (`adb devices` empty, no emulator binary), so there is **no device-launch evidence** for Phase 01.
- **Not re-run**: the Gradle build was not repeated in this revision, and a clean-clone frozen-lockfile install plus dev startup has not yet been re-verified on the committed state.

## Corrective revision — 2026-10-14 (Finding F01 Remediation)

Re-verified in response to the Phase 01–04 audit report (`docs/reviews/phase-01-04-audit-2026-10-14.md`).

- **Expo CLI / Tar Compatibility (F01)**:
  - Repaired incompatibility between `@expo/cli` (Babel CommonJS default-import helper) and patched `tar@7.5.22` (which previously exported ES module metadata without a default export, crashing with `Cannot read properties of undefined (reading 'extract')`).
  - Added `patches/tar@7.5.22.patch` via `pnpm.patchedDependencies` in `package.json` to assign `exports.default = exports` on the CommonJS output. Preserved security patch without reverting to vulnerable tar releases.
  - Hardened `apps/mobile/package.json` `"prebuild"` script to assert existence of `android/build.gradle` on completion (`expo prebuild --no-install -p android && node -e "if (!require('fs').existsSync('android/build.gradle')) { console.error('Native android generation failed'); process.exit(1); }"`), ensuring native project generation failures exit non-zero and fail contributor validation.
  - Verified clean native generation: deleting `apps/mobile/android` and running `pnpm --filter @daynori/mobile run prebuild` successfully generates the native Android directory and all Gradle assets.
  - Executed native Android compilation: `.\gradlew.bat assembleDebug` succeeded with exit code 0 (517 tasks: 236 executed, 281 up-to-date), producing `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk` (128,444,244 bytes).
- **Worker Documentation Reconciliation**:
  - Reconciled `README.md` to accurately describe `apps/worker` as an executable lifecycle scaffold. Replaced claims of an established "durable worker" with explicit documentation that durable polling loops, leases, persistence, and retry mechanisms belong to later database and sync phases.
- **Evidence & Gate Boundaries**:
  - Native build compilation is verified. Device execution remains gated on physical hardware or emulator availability (`adb devices` empty).
