# ADR-0011: Google Drive scope and OAuth architecture

Date: 2026-10-13. Status: accepted.

## Context

Daynori supports optional linking to Google Drive for external attachments and backup exports. Google categorizes Drive scopes into non-sensitive (per-file) and restricted (broad drive access), with restricted scopes triggering mandatory Cloud App Security Assessment (CASA) Tier 2/3 third-party independent audits by authorized assessment labs before production verification is granted.

## Decision

1. **Least-Privilege Scope**: Restrict Daynori's Google Drive integration to the narrow `drive.file` scope (`https://www.googleapis.com/auth/drive.file`). This authorizes access only to files created by Daynori or explicitly selected by the user via the Google Picker API.
2. **Rejection of Blanket Folder Mirroring**: Do not implement unconsented recursive external folder mirroring that would require the full restricted `https://www.googleapis.com/auth/drive` scope. External attachments must be explicitly picked or placed in the dedicated Daynori app folder.
3. **OAuth Flow Security**: Use Authorization Code Flow with PKCE (`RFC 7636`) via system Custom Tabs on Android and system browser on Web. Embedded WebViews (`WebView`) are strictly prohibited per Google OAuth policy. Server-side refresh tokens must be encrypted at rest using AES-256-GCM.

## Alternatives

- **Requesting Full Drive Scope**: Enables arbitrary folder syncing but imposes mandatory external third-party security audits (CASA), lengthy Google verification cycles, and unnecessary privacy risks for personal organizer users.
- **Client-Side Token Storage**: Storing refresh tokens directly in client storage exposes user Drive access to device-level extraction; rejected in favor of server-brokered token refresh.

## Consequences and validation

- Users must be informed that external files added outside the Daynori folder in Google Drive require explicit re-selection via the file picker.
- Validated via synthetic policy model `tests/spikes/platform-policy-model.synthetic.test.ts`. OAuth verification remains an external prerequisite for Phase 48–50.
- See [private storage and drive ADR-0006](0006-private-storage-and-optional-drive.md) and [official sources](../research/sources.md).
