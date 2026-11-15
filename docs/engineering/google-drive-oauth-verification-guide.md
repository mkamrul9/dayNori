# Google Drive OAuth Configuration and Synthetic Test Account Verification Guide

- **Target Audience:** Project Owner & QA Evaluators
- **Version:** 2.0.0 (Phase 113)
- **Status:** Owner Review Package — Live Provider Verification Requirements
- **Related:** [ADR 0087](../decisions/0087-google-drive-connection-and-scope-readiness.md), [ADR 0107](../decisions/0107-bounded-google-drive-folder-authorization-and-scope-boundary.md), [ADR 0113](../decisions/0113-google-drive-provider-verification-and-scope-boundary-audit.md), [Release Gates](../engineering/release-gates.md).

---

## 1. Executive Summary

This guide sets out the exact Google Cloud Console OAuth 2.0 configuration, Google Picker API setup, and synthetic test account requirements needed for owner review and live interactive verification of the Daynori Google Drive integration.

> [!CAUTION]
> **No Credentials in Git:** In strict adherence to `AGENTS.md` and repository security policy, credentials, client secrets, API keys, and test account passwords must **never** be committed to Git, staged in working trees, or output in build logs. Local execution relies on the gitignored `tests/spikes/drive/config.local.env` file.

---

## 2. Google Cloud Console Setup Specification

### 2.1 Project Creation & Required APIs
1. Log in to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a dedicated testing project:
   - **Project Name:** `daynori-drive-audit` (or dedicated staging project).
3. Navigate to **APIs & Services > Library** and enable the following two APIs:
   - **Google Drive API** (`drive.googleapis.com`): For file metadata retrieval, byte upload/download, and folder traversal.
   - **Google Picker API** (`picker.googleapis.com`): For secure in-browser user selection of specific files and folders under `drive.file`.

---

### 2.2 OAuth Consent Screen Configuration
Navigate to **APIs & Services > OAuth consent screen**:

1. **User Type:** Select **External** (the application starts in *Testing* status).
2. **App Information:**
   - **App Name:** `Daynori`
   - **User Support Email:** Owner designated contact email.
   - **Developer Contact Information:** Owner technical email.
3. **Scopes Selection:**
   Click **Add or Remove Scopes** and select strictly:
   - `https://www.googleapis.com/auth/drive.file` — *View and manage Google Drive files and folders that you have opened or created with this app* (Narrow non-sensitive scope).
   - `openid` — *Associate you with your personal info on Google*
   - `https://www.googleapis.com/auth/userinfo.email` — *See your primary Google Account email address*
   
   > [!IMPORTANT]
   > **DO NOT REQUEST BROAD SCOPES:**
   > - Do **not** select `https://www.googleapis.com/auth/drive` (Full Drive sync).
   > - Do **not** select `https://www.googleapis.com/auth/drive.readonly` (Full Drive read).
   > - Do **not** select `https://www.googleapis.com/auth/drive.metadata`.
   > Requesting broad scopes invalidates the narrow `drive.file` least-privilege boundary and requires Tier 2 CASA security assessment and Google restricted scope review.

4. **Test Users (Crucial for Testing Status):**
   - Under **Test users**, click **Add Users**.
   - Enter the email address of the dedicated synthetic test Google account (e.g., `daynori-test-audit@gmail.com`).
   - *Note:* In External Testing mode, any account not explicitly added here will be rejected by Google with `403: access_denied (org_internal / unapproved_app)`.

---

### 2.3 OAuth 2.0 Client ID Configuration
Navigate to **APIs & Services > Credentials > Create Credentials > OAuth client ID**:

1. **Application Type:** **Web application**
2. **Name:** `Daynori Drive Verification Client`
3. **Authorized JavaScript Origins:**
   - `http://localhost:3000` (Local Web Next.js dev)
   - `http://127.0.0.1:3116` (Staging production PWA port)
   - `http://127.0.0.1:8765` (Live spike runner port)
4. **Authorized Redirect URIs:**
   - `http://127.0.0.1:8765/oauth2callback` (Interactive live spike callback)
   - `http://localhost:3001/v1/auth/drive/callback` (Local API dev server callback)
   - `http://127.0.0.1:3114/v1/auth/drive/callback` (Local staging API server callback)
5. Copy the generated **Client ID** and **Client Secret**.

---

### 2.4 Google Picker API Key Configuration
Navigate to **APIs & Services > Credentials > Create Credentials > API Key**:

1. Note the generated API key (starts with `AIzaSy...`).
2. Click **Edit API Key**:
   - **Name:** `Daynori Picker Key`
   - **API Restrictions:** Restrict key to **Google Picker API** and **Google Drive API**.
   - **Application Restrictions:** Set HTTP referrers to `http://localhost:3000/*`, `http://127.0.0.1:3116/*`, and `http://127.0.0.1:8765/*`.

---

## 3. Dedicated Synthetic Test Account Requirements

To guarantee zero contamination of personal files or production data, the test must be executed against a dedicated synthetic test account conforming to the following layout:

### 3.1 Account Hygiene
- **Account Type:** Dedicated Google account created exclusively for automated/interactive testing (e.g., `daynori-test-audit@...`).
- **No Real User Fixtures:** Zero personal emails, real user spreadsheets, confidential documents, or financial information.

### 3.2 Required Test Drive Directory Topology
Prepare the following test objects inside the synthetic account's Google Drive (`drive.google.com`):

```text
Google Drive Root /
├── Daynori Test Root /                   [Folder: Selected via Google Picker]
│   ├── pre-existing-doc.txt              [File: Pre-existing before folder selection]
│   ├── Nested Subfolder /                [Folder: Nested subfolder inside selected root]
│   │   └── nested-file.txt               [File: File inside nested subfolder]
│   └── Daynori App Uploads /             [Folder: Empty destination for app-created uploads]
├── external-addition-doc.txt             [File: Ready to be moved/dropped into Test Root after selection]
└── never-picked-confidential.txt         [File: In root Drive; must NEVER be accessed or listed]
```

---

## 4. Local Execution Protocol (Owner Review)

When the owner is ready to execute live verification:

1. Copy the template to the gitignored configuration file:
   ```bash
   cp tests/spikes/drive/config.local.env.example tests/spikes/drive/config.local.env
   ```
2. Populate `config.local.env` with the values from Google Cloud Console:
   ```ini
   DAYNORI_DRIVE_CLIENT_ID="<your-client-id>.apps.googleusercontent.com"
   DAYNORI_DRIVE_CLIENT_SECRET="GOCSPX-<your-client-secret>"
   DAYNORI_DRIVE_CLIENT_TYPE="web"
   DAYNORI_DRIVE_REDIRECT_URI="http://127.0.0.1:8765/oauth2callback"
   DAYNORI_DRIVE_REQUESTED_SCOPE="https://www.googleapis.com/auth/drive.file"
   DAYNORI_DRIVE_API_KEY="AIzaSy<your-picker-api-key>"
   DAYNORI_DRIVE_PICKER_ENABLED="true"
   DAYNORI_DRIVE_LOGIN_HINT="daynori-test-audit@gmail.com"
   ```
3. Run the live verification runner:
   ```bash
   node tests/spikes/drive/run-spike.mjs --mode=live
   ```
4. **Interactive Browser Steps:**
   - The runner launches the system browser to Google's OAuth 2.0 consent page.
   - Sign in as the synthetic test account.
   - Verify that the consent screen requests strictly: *"See, create, and delete its own configuration data and files in Google Drive"* (`drive.file`).
   - Grant permission; Google redirects to `http://127.0.0.1:8765/oauth2callback`.
   - The runner opens the Google Picker dialog: select `Daynori Test Root` and `pre-existing-doc.txt`.
5. **Observation Capture:**
   - The runner executes the live probe matrix against Google Drive API v3.
   - Results are written to `tests/spikes/drive/results/live-observation.json`.

---

## 5. Summary of `drive.file` Observed Exclusions

| Action / File Target | OAuth Status under `drive.file` | Technical Explanation |
| :--- | :---: | :--- |
| **Folder container itself** | **Authorized** | User selected the folder in Picker; Google authorizes folder ID metadata. |
| **Pre-existing files inside folder** | **Denied (404)** | Google Drive does NOT cascade grants to children existing prior to selection. |
| **External files added later** | **Denied (404)** | Dropped files via `drive.google.com` lack Daynori per-file authorization. |
| **Individually picked children** | **Authorized** | User explicitly picked the child file in Picker. |
| **App-created children** | **Authorized** | Daynori uploaded the file into the folder via API. |
| **Root Drive / Unrelated folders** | **Denied (404)** | Outside authorized per-file boundary; enumeration prohibited. |

---

## 6. Broader Restricted Scope Decision Matrix (Recursive Mirroring)

If product requirements demand automatic discovery of pre-existing and externally added files inside folders, Daynori must transition to restricted scope:

- **Required Scope:** `https://www.googleapis.com/auth/drive.readonly` or `https://www.googleapis.com/auth/drive`.
- **CASA Requirement:** Mandatory Cloud Application Security Assessment (CASA Tier 2 / AL2) by an authorized independent lab (e.g. Bishop Fox, DEKRA, TAC Security).
- **Annual Cost Obligation:** $2,500 to $6,000+ USD per year recurring.
- **Decision:** Automatic recursive mirroring remains **disabled fail-closed** under `DEF-V2-005` until owner commercial approval and CASA AL2 certification.
