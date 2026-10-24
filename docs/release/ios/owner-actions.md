# Exact remaining owner / Mac actions

Phase 62 local preparation does **not** complete the store gate. Remaining:

1. **Mac + Xcode:** run Phase 61 verification (`pnpm prebuild:ios`, Simulator, physical device VoiceOver/Keychain/offline/notifications); attach evidence to `docs/phase-reports/phase-61.md`.
2. **Apple Developer Program + App Store Connect:** create app record `com.daynori.app`.
3. **Signing:** distribution cert + profiles (or Automatic Signing with release team); store secrets outside Git.
4. **Domains / legal:** purchase/verify `app.daynori.com` (or revise associated domains); finalize privacy/terms/support contacts; brand clearance.
5. **Privacy Nutrition Label + age rating** in App Store Connect (primary sources dated 2026-10-21).
6. **Screenshots** from the actual RC on required devices.
7. **TestFlight:** upload signed build; invite internal (then optional external) testers; complete device matrix.
8. **Explicit publication authorization** before App Review submit.
9. Keep vault / rooms / AI / Drive / StoreKit **off**.

Stop before Phase 63 until the owner selects it after a verified store outcome (or an explicit blocked handoff).
