# Android and web testing deployment

Selected Phase 60 testing preview. Hosted health/readiness verified 2026-10-22;
signed-in cloud and physical-phone checks remain open. **Not release-ready.**

- Web: https://daynori-web-preview.onrender.com (Render Free, Singapore).
- API readiness: https://daynori-api-preview.onrender.com/v1/ready (Free, Singapore).
- Source: `codex/free-core-preview`; Android source revision `840f147`.
- Android: [download the APK](https://github.com/mkamrul9/dayNori/releases/download/preview-2026-10-22/daynori-preview-arm64.apk)
  or open the [testing prerelease](https://github.com/mkamrul9/dayNori/releases/tag/preview-2026-10-22).
- Successful Android build: [39734872562](https://github.com/mkamrul9/dayNori/actions/runs/39734872562).

The closest fit for the current code is a Node/container host such as Render for
Next.js and Fastify, with Supabase for identity and PostgreSQL. The web app has
server session cookies and API routes, so uploading its assets to a static host
does not deploy the functioning app. Cloudflare Workers would require a separately
verified adapter/build. Browser sign-in to Render and Supabase is confirmed.
The free `Daynori Preview` organization and Singapore `daynori-preview` Supabase
project are provisioned. Both Singapore Render services are deployed on Free.
The owner selected **$0 only**. No paid service or
payment method was added; the existing Render workspace has available free quota.

## Selected free core profile

Set `DAYNORI_CORE_PREVIEW=true` in the API, `NEXT_PUBLIC_DAYNORI_CORE_PREVIEW=true`
when building web, and `EXPO_PUBLIC_DAYNORI_CORE_PREVIEW=true` when building Android.
This rejects new file transfers/attachments and reminder/push mutations, disables
upload/audio controls and displays the limits. Use sample content. The worker,
scanner, storage provider and push credentials stay inactive. Background physical
erasure/backup guarantees are unverified. Request timeouts allow 75 seconds for
the free API to wake up; requests are not automatically duplicated.

The owner created a project-only 24-hour setup token, saved privately in ignored
`artifacts/local/supabase-preview-management-token`. No administrator password is
needed. Run `node --import tsx scripts/provision-free-preview-management.ts` from
the root. On 2026-10-22 all 74 receipts and the restricted TLS runtime login were
verified against the actual project. Immutable source and managed execution
checksums are recorded separately for two core-only adaptations; see
[ADR 0064](../../docs/decisions/0064-managed-core-preview-provisioning.md).
Supabase Storage ownership/RLS remain intact, no buckets exist, and billing/worker
logins remain disabled. The normal migration runner refuses this preview history
until an explicit promotion plan is reviewed. Generated runtime secrets and Render
API configuration remain under ignored `artifacts/local/`; the setup token never
goes to Render or GitHub. The password-based runner is a local-fixture alternative,
not the verified managed-cloud path.

The API env output includes the public Auth origin/key (for password
reauthentication) and a separate generated `REAUTH_SIGNING_SECRET`. Storage
initialization is skipped in the core profile. Missing privileged Auth cleanup
credentials leave account deletion in `processing`; both interfaces disclose
pending cleanup rather than claim full erasure.

Use the filtered Node build commands `corepack enable && pnpm install --frozen-lockfile --prod=false
&& pnpm --filter @daynori/web... build` and the equivalent `@daynori/api...` filter.
Start web with `pnpm --filter @daynori/web start --hostname 0.0.0.0`. Start the API
from the repository root with
`NODE_EXTRA_CA_CERTS="$(pwd)/infra/deployment/supabase-preview-ca.crt" pnpm --filter @daynori/api start`.
The public CA is the certificate linked by the actual project's Database Settings;
SHA-256 `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`.
Keep `PGSSLMODE=verify-full`. Set `NODE_VERSION=24.21.0`. Select Free for
both services. Deploy only a reviewed source checkpoint; do not mark Phase 60
complete or expose a development APK as a standalone download.

[ADR 0063](../../docs/decisions/0063-free-core-testing-preview.md) records this
bounded profile. The wider configuration below is for a separately authorized,
funded environment and is not activated by the free profile.

## Concrete candidate

The root build context and [Dockerfile](Dockerfile) define independent `web`, `api`,
and `worker` targets. From the repository root:

```text
docker build -f infra/deployment/Dockerfile --target web -t daynori-web-preview .
docker build -f infra/deployment/Dockerfile --target api -t daynori-api-preview .
docker build -f infra/deployment/Dockerfile --target worker -t daynori-worker-preview .
```

Docker CLI is installed here, but its Linux daemon is not running; these image
builds are **unverified**. The underlying workspace build is checked separately.
Production images use separately packaged production dependencies, excluding
the mobile/development toolchain. The production API package and its imports
have been exercised locally; Docker images themselves remain unverified.
Images exclude local credentials and artifacts via [.dockerignore](../../.dockerignore).
Do not provision a paid worker or database tier without the owner's cost approval.
Render free web services sleep after inactivity; they do not establish reliable
background reminder delivery. No always-on worker has been provisioned.

## Required connected services and configuration

1. Connect the owner's hosting and Supabase accounts. Use a new disposable test
   project and synthetic content. Do not point migration/test commands at a
   production database. Review the role/bootstrap migrations against the actual
   managed database before applying them; existing local defaults are not cloud
   credentials.
2. Apply the immutable migrations, including `00070` (own-consent deletion grant),
   `00071` (restrictive context-free read guards), `00072` (live cursor index),
   `00073` (API-only private assets) and `00074` (separate application worker).
   Create the least-privilege `daynori_runtime` role with an externally managed
   password; API traffic must not use the database administrator.
3. Configure API runtime `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`,
   `PGSSLMODE=verify-full`, `SUPABASE_JWKS_URL`, `SUPABASE_JWT_ISSUER`, and
   `SUPABASE_JWT_AUDIENCE=authenticated`. The API listens on the host's `PORT`
   and exposes `/v1/health` and `/v1/ready`. Health alone does not prove database,
   storage, or authentication readiness.
4. Configure web runtime `DAYNORI_API_URL`, `DAYNORI_WEB_ORIGIN` (exact HTTPS
   origin), `SUPABASE_AUTH_URL`, and `SUPABASE_ANON_KEY`. Add the actual web
   callback origin to Supabase's redirect allowlist. Keep privileged provider
   keys server-side only.
5. Configure the implemented Supabase transport with `SUPABASE_URL` and
   server-only `SUPABASE_SERVICE_ROLE_KEY`. Set an exact HTTPS `DAYNORI_API_ORIGIN`,
   `DAYNORI_WEB_ORIGIN` and a unique `STORAGE_CAPABILITY_SECRET` of at least 32
   characters. Private objects are transferred through signed API URLs; direct
   authenticated Storage access is intentionally denied. Verify bucket privacy,
   reserve/upload/finalize/download, rejection, cancellation, membership changes
   and deletion against the actual project. Local tests exercise the real
   lifecycle and a concurrent upload/cancel race with a controlled transport.
6. Configure `CLAMAV_HOST`/`CLAMAV_PORT` on the private service network, or the
   existing `MALWARE_SCANNER_URL` HTTP transport. Scanner failures keep files
   unverified. Do not expose raw ClamAV TCP to the internet. Capacity and live
   signature-refresh behavior remain unmeasured; see
   [ClamAV memory requirements](https://docs.clamav.net/).
7. Activate the migration's NOLOGIN `daynori_worker` role using a unique secret
   outside Git and configure `WORKER_DB_USER`/`WORKER_DB_PASSWORD`, or a dedicated
   `WORKER_DATABASE_URL`. Never use the API password or database administrator.
   Verify actual storage deletion retries and account cleanup before enabling
   the hosted worker. Future migrations require explicit worker grants.
8. Configure native Android push with server-only `FCM_SERVICE_ACCOUNT_JSON` and
   the matching Android Firebase configuration. Expo transport instead requires
   explicit `EXPO_PUSH_ENABLED=true` and matching Expo build credentials. Web Push
   uses `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`. Provider
   acceptance is not proof of display. Verify on physical Android hardware.
   Mobile dynamic config reads `DAYNORI_GOOGLE_SERVICES_FILE` (an ignored
   Firebase Android client JSON for `com.daynori.app`) and, for Expo transport,
   `DAYNORI_EXPO_PROJECT_ID`. Never use the server service-account JSON as
   Android client config. The GitHub preview workflow can receive the client
   JSON through `DAYNORI_ANDROID_GOOGLE_SERVICES_JSON`. The selected free profile
   disables reminder delivery regardless; it cannot be presented as push-verified.
9. Verify sign-up/sign-in, workspace provisioning, local capture, reconnect,
   conflict recovery, export/deletion, and whichever optional scope is enabled.
   Vault, rooms/chat, Drive, AI and billing remain behind their existing gates.

The full variable template is [preview.env.example](preview.env.example).
Render free services can support a core preview, with sleep/cold-start limits;
they do not provide an always-on worker or a sufficiently provisioned scanner.
The selected budget is $0. No worker/scanner or paid service was created.

## Install and check the Android preview

1. On an ARM64 Android phone running Android 7 or later, open the APK download
   above in the browser. The file is 34,326,704 bytes (about 33 MiB).
2. Open the downloaded APK. If Android requests permission for that browser to
   install this app, allow it for this installation, then turn it off afterward.
   Review Android's installation prompts; this is a test-signed preview.
3. Launch Daynori. It includes its JavaScript bundle and uses the hosted API;
   Metro and a connection to the developer's PC are not required.
4. Create your test account and confirm its email when requested. Enter your
   password directly in the app or website, keep it out of chat, and sign in to
   both platforms with the same account.
5. Use sample content to check a note/task on both platforms, app restart, an
   offline edit followed by reconnection, and sign-out. These authenticated and
   physical-device checks are still pending; a successful download does not
   establish them. Free services may take time to wake up.

Package `com.daynori.app`, version `0.1.0` (1), minimum SDK 24, target SDK 36,
ABI `arm64-v8a`. APK SHA-256:
`b102674448337eb2b9ccde2f4d5653b022bc837ae9edd212ade52c5a47da1441`.
The attached [SHA256SUMS](https://github.com/mkamrul9/dayNori/releases/download/preview-2026-10-22/SHA256SUMS)
matches both the downloaded build and GitHub's published asset digest.
Local `apksigner verify --verbose --print-certs` passes with one explicit
Android Debug signer and APK Signature Scheme v2. This is not a production
signing identity, Play submission, or completed Phase 60 release.

Anonymous range download returned HTTP 206 and the checksum file returned 200
on 2026-10-22. Static checks confirm the embedded app bundle, actual hosted
API/Auth origins and absence of the known server/setup credentials from that
bundle. See [APK evidence](../../artifacts/release/android-preview-apk-verification.json)
and [published download evidence](../../artifacts/release/android-preview-publication.json).

## Rebuilding the installable Android candidate

The existing `artifacts/release/app-debug-arm64.apk` contains the Expo development
launcher but **no application `assets/index.android.bundle`**. It is not a
standalone phone-testing download; it needs Metro, predates these repairs, and
uses local endpoints. Do not redistribute it as the working app.

After the backend URL is verified, set the public build inputs in
[.env.example](../../.env.example): `EXPO_PUBLIC_DAYNORI_API_URL`,
`EXPO_PUBLIC_SUPABASE_URL`, and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Expo requires
direct dot-notation accesses for these inputs to be embedded. They are public
configuration, never privileged credentials.

[apps/mobile/eas.json](../../apps/mobile/eas.json) defines an internal `preview`
APK with `developmentClient: false`. Once Expo project ownership, signing and
build-service access are configured, run from `apps/mobile`:

```text
eas build --platform android --profile preview
```

No EAS build has been submitted; the published preview uses the GitHub path below.
Verify the resulting APK's embedded application bundle, package/architecture,
signature and SHA-256, install on a physical phone, then verify cold launch with
Metro stopped and exercise the real backend. Label any download offered before
physical testing as an unverified testing preview. An AAB is for store distribution and is
not the directly installable file requested by the owner.

An alternative manual [GitHub preview workflow](../../.github/workflows/android-preview.yml)
uses repository variables `DAYNORI_PREVIEW_API_URL` and
`DAYNORI_PREVIEW_SUPABASE_URL`, plus the public anon key in
`DAYNORI_PREVIEW_SUPABASE_ANON_KEY`. Its configuration check rejects local HTTP
endpoints and privileged keys before building. It makes an ARM64 APK with explicit
test-only debug signing and an embedded application bundle, verifies the
signature and uploads a seven-day artifact with SHA-256. GitHub artifact download
requires repository access/sign-in; it is not an anonymous public download.
The remote workflow passed on revision `840f147` and its verified APK/checksum
were published in the testing prerelease above. It cannot submit a Play release
and does not count as phone validation.

The default branch currently predates this workflow. After hosted URLs and
public build inputs are verified, pushing the reviewed preview revision to
`codex/android-preview-build` triggers the same guarded build without merging
unfinished release work into `main`. Use standard Ubuntu runners only; this
repository is public. An anonymously downloadable APK can be attached to a
clearly labeled GitHub prerelease after its bundle, signature and checksum are
verified. It remains a test build with the free-profile limits and unverified
physical-device behavior; it is not a Play or production release.

## Sources checked 2026-10-21

- [Render service deployment](https://render.com/docs/web-services)
- [Render free-service limitations](https://render.com/docs/free)
- [Expo public build environment](https://docs.expo.dev/guides/environment-variables/)
- [Expo installable APK builds](https://docs.expo.dev/build-reference/apk/)
- [Cloudflare Next.js deployment](https://developers.cloudflare.com/pages/framework-guides/nextjs/)
