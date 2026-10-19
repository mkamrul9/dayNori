# Vault platform harnesses (Phase 44)

Isolated cryptographic evidence runners. These are **not** unlock screens and are **not** wired into the Daynori applications.

| Harness | Runtime | Status in repair session |
|---|---|---|
| `browser-webcrypto.harness.html` | Real browser Web Crypto | Runnable; open in Chromium/Firefox/Safari and paste results into the phase report. **Execution unverified** unless recorded. |
| `android-candidate.harness.md` | Android candidate AEAD library | Procedure + Kotlin sketch prepared. **Execution unverified** (no device evidence). |
| Node Vitest suite | `tests/security/phase44-vault-crypto.test.ts` | Executed in CI/dev Node only — proves Node WebCrypto ↔ Node createCipheriv format interoperability. |

## How to run the browser harness

```bash
# From repo root — any static file server
npx --yes serve tests/security/vault/harnesses -p 8765
# Open http://127.0.0.1:8765/browser-webcrypto.harness.html
# Copy the on-page log into docs/phase-reports/phase-44.md evidence section.
```

Do not treat Node-side Vitest green as browser or Android proof.
