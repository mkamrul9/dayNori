# Pending dependency exception proposals

Status: **awaiting owner review. Nothing here is approved.** Checked 2026-10-14 with `pnpm audit --audit-level=high`.

| Advisory            | Package    | Installed | Patched release                        | Route                                                                                         |
| ------------------- | ---------- | --------- | -------------------------------------- | --------------------------------------------------------------------------------------------- |
| GHSA-86w9-cpqp-85rv | node-forge | 1.4.0     | none (1.4.0 is the latest npm release) | react-native > @react-native/community-cli-plugin > @react-native/dev-middleware > selfsigned |
| GHSA-vfj7-8cjw-p6xm | braces     | 3.0.3     | none (3.0.3 is the latest npm release) | react-native > @react-native/codegen > jscodeshift > micromatch                               |

Both packages are reached only through React Native development tooling (Metro dev server and codegen), not through shipped app code. This is an engineering assessment, not an approval, and the applicability of each advisory to the dev server has not been analyzed in detail.

## To approve

1. Run `node scripts/audit-dependencies.mjs --print-proposal` to get drafts with exact versions and every affected path.
2. Complete `applicability`, `remediation` and `expiresAt` for each entry.
3. Add a file under `docs/security/approvals/` naming the approving person and the advisory id.
4. Add the entry to `.security-exceptions.json` with `approval.approvedBy` and `approval.evidence` pointing at that file.

Remediation to evaluate: newer React Native and Expo SDK lines that drop or update these tools, or a pnpm patch.
