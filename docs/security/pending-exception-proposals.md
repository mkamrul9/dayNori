# Pending dependency exception proposals

Status: **awaiting owner review. Nothing here is approved.** Re-verified 2026-10-14 against npm registry and `pnpm audit --audit-level=high`.

| Advisory                                                                 | Package      | Installed | Patched release                         | Affected Routes                                                                                                                                        |
| ------------------------------------------------------------------------ | ------------ | --------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | `node-forge` | 1.4.0     | None (`<0.0.0`; 1.4.0 is latest on npm) | `@expo/cli` direct, `@expo/code-signing-certificates`, `react-native > @react-native/community-cli-plugin > @react-native/dev-middleware > selfsigned` |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | `braces`     | 3.0.3     | None (`<0.0.0`; 3.0.3 is latest on npm) | `react-native > @react-native/codegen > jscodeshift > micromatch`, `@expo/cli > fast-glob > micromatch`                                                |

## Investigation and Blocker Assessment

1. **Upstream Release Status**:
   - `node-forge`: Queried npm registry (`npm view node-forge versions`). Version `1.4.0` remains the latest release. No upstream patched version exists.
   - `braces`: Queried npm registry (`npm view braces versions`). Version `3.0.3` remains the latest release. No upstream patched version exists.
   - Both packages are transient development dependencies pulled transitively by Expo SDK 52 and React Native 0.76 build and development server toolchains (Metro bundler, codegen, fast-glob, selfsigned certificate generation for local debugging). Neither package is bundled into shipped production web or Android runtime artifacts.

2. **Policy Enforcement**:
   - In accordance with `AGENTS.md` and repository integrity rules, the dependency audit gate (`scripts/audit-dependencies.mjs`) **fails closed**.
   - Coding agents must **not** invent human approvals, forge owner signatures, silently suppress advisories, or approve their own security exceptions.
   - Until human project owner approval is recorded, `pnpm audit:deps` correctly exits with code 1.

## Human Approval Requirements

To authorize exceptions for these two development-only advisories:

1. **Owner Review**: A designated human repository owner must review the advisory details and confirm that risk is limited to local development tooling.
2. **Approval Evidence**: Create a signed decision markdown file in `docs/security/approvals/<advisory-id>.md` documenting:
   - Approver name, role, and date.
   - Scope of applicability (development tooling only; excluded from production bundles).
   - Expiration date (recommended: 90 days from approval).
   - Remediation trigger (e.g., upgrade to React Native 0.77+ or Expo SDK 53 upon release).
3. **Register Exception in `.security-exceptions.json`**:
   - Run `node scripts/audit-dependencies.mjs --print-proposal` to retrieve the machine-readable proposal structure.
   - Populate `applicability`, `remediation`, `expiresAt`, `approval.approvedBy`, and `approval.evidence` pointing to the approval evidence file.
4. **Re-run Gate**: Verify that `pnpm audit:deps` passes with the approved exceptions while negative tests (`tests/security/scanner-synthetic.test.ts`) continue to reject malformed, expired, or unapproved entries.
