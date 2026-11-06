# Google Drive OAuth Configuration Guide

This guide documents the exact configuration required in the Google Cloud Console to enable and operate the Daynori Google Drive connector in production or staging environments.

> [!IMPORTANT]
> **Narrow Scope Boundary**: Daynori strictly uses the narrow, approved `https://www.googleapis.com/auth/drive.file` scope. Daynori never requests or accepts broad scopes such as `https://www.googleapis.com/auth/drive`, `https://www.googleapis.com/auth/drive.readonly`, or `https://www.googleapis.com/auth/drive.metadata`. Selecting a folder in Google Drive does **not** grant access to existing unpicked descendants; only explicitly selected files and app-created files are accessible. Encrypted vault contents and recovery keys are strictly excluded.

---

## 1. Google Cloud Project Setup

1. **Create or Select a Project**:
   - Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
   - Create a dedicated project (e.g., `daynori-workspace-prod` or `daynori-workspace-staging`) or select your existing organization project.

2. **Enable Required Google APIs**:
   Under **APIs & Services > Library**, enable:
   - **Google Drive API** (`drive.googleapis.com`): Required for file metadata lookup, byte import/export, and app file uploads.
   - **Google Picker API** (`picker.googleapis.com`): Required for client-side explicit file selection under `drive.file`.

---

## 2. OAuth Consent Screen Configuration

1. **User Type**:
   - For internal/organization testing: Choose **Internal** (Workspace accounts).
   - For public/external deployment: Choose **External** (starts in *Testing* status).

2. **App Information**:
   - **App Name**: `Daynori`
   - **User Support Email**: Select an authorized support contact email (e.g., `support@daynori.com`).
   - **App Logo**: Standard 120x120 PNG Daynori icon (without third-party trademarks).
   - **Application Home Page**: `https://app.daynori.com`
   - **Privacy Policy**: `https://app.daynori.com/privacy`
   - **Terms of Service**: `https://app.daynori.com/terms`
   - **Authorized Domains**: Add `daynori.com` (and your preview/staging domains).

3. **Scopes**:
   - Click **Add or Remove Scopes**.
   - Select strictly:
     - `https://www.googleapis.com/auth/drive.file` (Per-file access for files created or opened by Daynori)
     - `openid` (Authenticate user identity)
     - `https://www.googleapis.com/auth/userinfo.email` (View user email address)
   - **DO NOT SELECT**:
     - `https://www.googleapis.com/auth/drive`
     - `https://www.googleapis.com/auth/drive.readonly`
     - `https://www.googleapis.com/auth/drive.metadata`
     - `https://www.googleapis.com/auth/drive.appdata`

4. **Test Users (Testing Mode)**:
   - While the consent screen is in *Testing* publishing status, add the email addresses of designated testers.
   - Accounts not registered as test users will receive `access_denied (403: org_internal / unapproved_app)` during consent.

---

## 3. OAuth 2.0 Credentials

### A. Web Application Client ID

1. Go to **APIs & Services > Credentials > Create Credentials > OAuth client ID**.
2. **Application Type**: **Web application**.
3. **Name**: `Daynori Web Connector`.
4. **Authorized JavaScript Origins**:
   - Development: `http://localhost:3000` (web app)
   - Staging: `https://staging.daynori.com`
   - Production: `https://app.daynori.com`
5. **Authorized Redirect URIs**:
   - Development: `http://localhost:3001/v1/auth/drive/callback` (API server callback)
   - Staging: `https://api.staging.daynori.com/v1/auth/drive/callback`
   - Production: `https://api.daynori.com/v1/auth/drive/callback`
6. Note the generated **Client ID** and **Client Secret**.

### B. Android Native Client ID (for Google Picker / Android SDK)

1. Under **Credentials**, select **Create Credentials > OAuth client ID**.
2. **Application Type**: **Android**.
3. **Name**: `Daynori Android Connector`.
4. **Package Name**: `com.daynori.app`
5. **SHA-1 Certificate Fingerprint**:
   - Development: Keystore SHA-1 from `debug.keystore`.
   - Release: Play Console App Signing key SHA-1 or release upload key SHA-1.
6. Note: Google authentication on Android uses Custom Tabs brokered through the server HTTPS callback or Google Sign-In with server auth code exchange.

---

## 4. Server Environment Variables Configuration

Configure the following secrets and settings in your API deployment environment (e.g., Kubernetes Secrets, AWS Secrets Manager, or `.env.local` for local development):

```bash
# Google OAuth Client Credentials
DAYNORI_DRIVE_OAUTH_CLIENT_ID="<your-google-client-id>.apps.googleusercontent.com"
DAYNORI_DRIVE_OAUTH_CLIENT_SECRET="GOCSPX-<your-google-client-secret>"

# Production enablement gate (must be set to 'true' after credentials are confirmed)
DAYNORI_DRIVE_PRODUCTION_ENABLED="true"

# AES-256-GCM Token Encryption Key at Rest (32 bytes base64-encoded)
# Generate with: openssl rand -base64 32
DAYNORI_DRIVE_TOKEN_ENCRYPTION_KEY="<base64-encoded-32-byte-secret-key>"
DAYNORI_DRIVE_TOKEN_KEY_VERSION="v1"

# Provider Mode:
# 'google_production' for real Google OAuth; 'fake' for tests and offline harnesses
DAYNORI_DRIVE_PROVIDER="google_production"
```

> [!CAUTION]
> Never commit `DAYNORI_DRIVE_OAUTH_CLIENT_SECRET` or `DAYNORI_DRIVE_TOKEN_ENCRYPTION_KEY` to Git repositories or build logs. Stored tokens are sealed with AES-256-GCM authenticated encryption bound to `workspaceId`, `connectionId`, and `accountId`. Rotating the encryption key requires incrementing `DAYNORI_DRIVE_TOKEN_KEY_VERSION` and having users re-authenticate.

---

## 5. Verification Checklist

| Step | Verification Criteria | Expected Outcome |
| :--- | :--- | :--- |
| **1. Intent Creation** | Call `POST /v1/workspaces/:wsId/drive/connect/start` | Returns authorization URL with `state` and `code_challenge`. Provider kind indicates `google_production`. |
| **2. Consent UI** | Open authorization URL in system browser | Google consent screen clearly displays request for `drive.file` scope only. |
| **3. Exchange** | Callback received with Google `code` and `state` | Server exchanges code via PKCE; refresh token is sealed with AES-256-GCM in `app.drive_connections`. |
| **4. Picker Token** | Call `GET /v1/workspaces/:wsId/drive/picker-token` | Returns short-lived access token with `cacheControl: 'no-store'`. No refresh token is exposed. |
| **5. Selection & Ingest** | Pick file via Google Picker and submit `selectDriveFile` | For `import_copy`, bytes download and scan for malware; persisted locally with SHA-256 checksum. For `link_reference`, provider file metadata is recorded. |
| **6. Disconnect** | Call `POST /v1/workspaces/:wsId/drive/disconnect` | Stored tokens are wiped (`NULL`), generation increments, pending jobs are cancelled. Imported copies remain in Daynori; remote originals in Google Drive are not touched. |

---

## 6. Common Error Codes and Remediation

- `invalid_grant`:
  - **Cause**: The authorization code expired, was already used, or the refresh token was revoked in Google Account settings.
  - **Remediation**: Daynori marks the connection `revoked` and removes stored tokens. User must click "Reconnect Google Drive".

- `rateLimitExceeded` / `userRateLimitExceeded`:
  - **Cause**: Google Drive API rate limits (1000 requests per 100 seconds per user).
  - **Remediation**: Daynori background worker uses exponential backoff and jittered retries up to 5 attempts before marking the job failed.

- `storageQuotaExceeded`:
  - **Cause**: User's Google Drive storage quota is exhausted.
  - **Remediation**: Daynori flags `drive_quota_exceeded` without retrying. User is notified to free space in Google Drive.

- `redirect_uri_mismatch`:
  - **Cause**: The `redirect_uri` in the request does not match the URI configured in Google Cloud Console.
  - **Remediation**: Ensure the API server's public base URL matches the entry under **Authorized Redirect URIs**.

- `fake_provider_forbidden_in_production`:
  - **Cause**: `DAYNORI_DRIVE_PROVIDER=fake` was set in a production environment (`NODE_ENV=production`).
  - **Remediation**: Daynori strictly fails closed. Set `DAYNORI_DRIVE_PROVIDER=google_production` and supply valid Google Cloud credentials.
