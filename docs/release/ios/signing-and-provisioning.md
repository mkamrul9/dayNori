# Signing and provisioning (iOS)

Credentials, certificates, `.p12`, provisioning profiles, and App Store Connect API keys stay **outside Git**.

## Required (owner / Apple Developer Program)

1. Active Apple Developer Program membership.
2. App ID `com.daynori.app` with capabilities: Associated Domains, Push Notifications (when APNs configured), Sign in with Apple only if used.
3. Distribution certificate + App Store provisioning profile (or Xcode Automatic Signing with the release team).
4. Optional: APNs key for push — Expo Push may be used first; record which path is live.
5. App Store Connect app record (create when owner authorizes).

## Local engineering

- Expo `app.json` declares `ITSAppUsesNonExemptEncryption: false` for standard HTTPS + on-device SQLCipher/Keychain — revisit if non-exempt crypto ships.
- Android release signing guard does **not** apply to iOS; iOS signing is entirely Xcode/Apple portal.

## Explicit gaps

- No certificates or profiles are present in this repository.
- No signed `.ipa` / `.xcarchive` has been produced on the Windows engineering host.
