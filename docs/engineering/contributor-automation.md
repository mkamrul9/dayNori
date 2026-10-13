# Contributor automation and CI enforcement

This document describes the automated checks, security scanning, branch protection policies, and deployment environment protections established in Phase 02.

## Continuous integration workflows

All contributions to the `main` branch are verified via GitHub Actions workflows defined in `.github/workflows/`:

### 1. Contributor Quality Checks (`ci.yml`)

Runs on every `push` and `pull_request` targeting `main`.

- **Minimal Token Permissions**: Granted only `contents: read`. No write or administration privileges.
- **Node.js Environment**: Pinned via `.nvmrc` to Node.js 20.18.0 LTS with `pnpm@9.15.5`.
- **Clean Installation Gate**: Executes `pnpm install --frozen-lockfile` to ensure lockfile determinism.
- **Verification Sequence**:
  1. `pnpm validate:planning`: Validates roadmap consistency, phase sequencing, and documentation links.
  2. `pnpm format:check`: Validates Prettier code style without silent modifications.
  3. `pnpm lint`: Runs ESLint with zero permitted warnings/errors.
  4. `pnpm typecheck`: Enforces strict TypeScript across all monorepo workspaces (`apps/*`, `packages/*`).
  5. `pnpm test:unit`: Executes domain invariant and unit tests.
  6. `pnpm test:contract`: Validates schema compatibility and HTTP/IPC contract definitions.
  7. `pnpm test:integration`: Checks local database and service boundaries.
  8. `pnpm test:security`: Verifies isolation, boundary checks, and threat-model rules.
  9. `pnpm test:performance`: Validates performance budgets and benchmark boundaries.
  10. `pnpm build`: Verifies that all applications and packages compile successfully.

### 2. Security and Vulnerability Audit (`security.yml`)

Runs on every `push`, `pull_request`, and weekly via cron schedule (`0 6 * * 1`).

- **Secret Scanning (`pnpm audit:secrets`)**: Powered by `scripts/scan-secrets.mjs`. Scans the entire codebase for high-entropy tokens, AWS keys, GitHub PATs, private keys, Slack tokens, and Stripe secrets.
- **Dependency Audit (`pnpm audit:deps`)**: Powered by `scripts/audit-dependencies.mjs`. Runs `pnpm audit` at high/critical audit level against the registry.
- **Explicit Exception Process**: Vulnerabilities in build-time tooling or transitive packages that cannot be immediately upgraded must be explicitly recorded in `.security-exceptions.json` with a justification, severity, and approval date. Silent bypasses and unchecked flags are strictly prohibited.

## Branch protection rules for `main`

When the GitHub remote repository is configured, the repository administrator must enforce the following branch protection rules for `main`:

1. **Require pull request before merging**:
   - Require approvals: Minimum of 1 approved review.
   - Dismiss stale pull request approvals when new commits are pushed.
   - Require review from Code Owners (if configured).
2. **Require status checks to pass before merging**:
   - Require branches to be up to date before merging (`strict` check).
   - Required status checks:
     - `Contributor Quality Checks` (`ci / quality`)
     - `Secret Scanning and Dependency Audit` (`security / audit`)
3. **Require linear history**:
   - Merge commits disabled; squash merging or rebase merging required.
4. **Enforce protections for administrators**:
   - "Do not allow bypassing the above settings" must be checked.
5. **Restrict force pushes and branch deletions**:
   - Force pushes are permanently disallowed.
   - Branch deletion is permanently disallowed.

## Protected deployment environments

Continuous delivery and deployment pipelines are decoupled from pull request validation. Contributor checks require no billable provider accounts or production credentials.

When deployment workflows are introduced in later phases:

1. **Environments**:
   - `staging`: Dedicated integration environment.
   - `production`: End-user live environment.
2. **Environment Protection Rules**:
   - **Required Reviewers**: Deployments to `production` require manual sign-off by designated repository maintainers.
   - **Deployment Branch Restriction**: Only commits from the protected `main` branch can deploy to `production`.
   - **Environment Secrets**: Secrets and credentials (e.g. database credentials, object store credentials) must be scoped exclusively to their respective environments, never stored as repository-wide secrets.
