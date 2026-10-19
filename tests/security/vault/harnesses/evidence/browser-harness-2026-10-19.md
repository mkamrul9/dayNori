# Browser WebCrypto harness evidence

- startedAt: 2026-10-19T12:57:05.421Z
- endedAt: 2026-10-19T12:57:06.038Z
- procedure: `cd tests/security/vault/harnesses && npm install && node run-browser-harness.mjs`
- playwrightChromiumVersion / Edge channel: 155.0.4283.62
- userAgent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36 Edg/155.0.0.0
- host: Windows 11, Node v24.11.1
- harnessResult: **PASS**

## On-page log

```
[meta] crypto.subtle present: true
[pass] McGrew/Viega GCM Appendix B Case 13 tag: PASS
[pass] AES-256-GCM Unicode/binary/empty + tamper: PASS
[pass] Vault profile rejects 16-byte key before importKey: PASS
[meta] Native WebCrypto AES-GCM 128-bit key capability: accepted (expected on many engines)
[pass] HARNESS RESULT: PASS
```

## Notes

- Application-policy 32-byte key check is separate from native WebCrypto accepting 128-bit AES-GCM keys.
- This is real browser-engine evidence (Edge/Chromium headless). It is not Android evidence and not independent security review.
