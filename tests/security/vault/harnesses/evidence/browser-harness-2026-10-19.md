# Browser WebCrypto harness evidence

- startedAt: 2026-10-19T14:00:03.245Z
- endedAt: 2026-10-19T14:00:03.828Z
- procedure: `cd tests/security/vault/harnesses && npm install && node run-browser-harness.mjs`
- exitCode: 0
- playwrightChromiumVersion / Edge channel: 155.0.4283.62
- userAgent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36 Edg/155.0.0.0
- host: Windows 11, Node v24.11.1
- harnessResult: **PASS**
- alignsWithFinalSharedFixtures: McGrew/Viega Case 13 tag; Unicode/binary/empty AES-GCM + tamper; vault profile 32-byte key policy (see `shared-fixtures.json` / browser harness HTML)

## Operations tested (exact)

```
[meta] crypto.subtle present: true
[pass] McGrew/Viega GCM Appendix B Case 13 tag: PASS
[pass] AES-256-GCM Unicode/binary/empty + tamper: PASS
[meta] keyLen=32 nonceLen=12 tagLen=16 emptyOk=true
[pass] Vault profile rejects 16-byte key before importKey: PASS
[meta] Native WebCrypto AES-GCM 128-bit key capability: accepted (expected on many engines)
[pass] HARNESS RESULT: PASS
```

## Notes

- Application-policy 32-byte key check is separate from native WebCrypto accepting 128-bit AES-GCM keys.
- This is real browser-engine evidence (Edge/Chromium headless). It is not Android evidence and not independent security review.
- Cross-implementation Node↔JVM envelope expected-byte exchange is recorded in the JVM evidence file (not duplicated here).
