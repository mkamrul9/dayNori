# ADR 0122: Daynori Production Release-Candidate Launch Package, Owner Authorization Governance, and Staged Rollout Management

- **Status:** Accepted
- **Date:** 2026-11-15
- **Deciders:** Project Owner, Operations Lead, Security & Privacy Officer, Lead Engineer
- **Consulted:** QA Automation Lead, Accessibility Lead
- **Informed:** Core Contributors

---

## 1. Context and Problem Statement

Following the completion of core web polish (Phase 117), deployable artifact preparation (Phase 118), authorized HTTPS staging verification (Phase 119), production security and privacy auditing (Phase 120), and empirical capacity envelope verification (Phase 121), Daynori required a **single, unified, and reviewable production launch package**.

Previously, launch readiness evidence was distributed across individual phase reports, artifact digests, and operational documents. To prevent premature claims, configuration divergence, or unauthorized spending, the project requires an authoritative launch package that:
1. Identifies the exact tested artifact (Git commit SHA, release candidate label, archive SHA-256 digests, Node runtime, exact startup commands).
2. Establishes the authorized public scope (bounded Web/PWA core) while maintaining fail-closed barriers on 8 unreleased modules.
3. Consolidates hosted staging evidence, security findings, capacity envelope boundaries, cost models, backup/restore proof, and operational support ownership.
4. Formulates explicit owner approval gates for destination domain, infrastructure budget, invited cohort size, and publication authorization.
5. Strictly enforces the governance rule: **Never describe a rehearsal, staging deployment, or local smoke test as a public launch.**

---

## 2. Decision Drivers

- **Zero Unsupported Launch Claims:** A rehearsal, staging run, or local smoke check is not a public launch. Public launch occurs exclusively after explicit owner determination and operational authorization.
- **Exact Artifact Immutability:** The production deployment must serve the exact tested release candidate (`2.0.0-rc5`) built from verified commit `f70aa3f9679ae927ea603773daf139b434b59adb`.
- **Bounded Release Safety:** Decouple the verified Web/PWA core (78 actions) from native Android hardware gates (`OWNER-SIGNING-KEYS`, `DEF-V2-011`) and high-risk gated modules (`DEF-V2-004` Vault, `DEF-V2-008` AI, `DEF-V2-006` Rooms, `DEF-V2-007` Billing, `DEF-V2-005` Drive).
- **Grounded Capacity Discipline:** Honor the empirical safe operating envelope (Render Free safe limit $\le 35$ CCU / 1,000 registered users; Managed PaaS required for 150–300 CCU / 5,000–10,000 registered users with PgBouncer transaction pooling).
- **Controlled Staged Rollout:** Launch begins with a small invited cohort (50–100 users) for 72 hours, monitoring error rates, latency, and costs before wider public expansion.

---

## 3. Considered Options

- **Option A (Informal Chat Approval & Direct Rollout):** Proceed to public launch based on conversational approval.  
  *Rejected:* Violates `AGENTS.md` and repository release gates (`OWNER-RELEASE-AUTH`, `OWNER-PROD-DNS`, `OWNER-BUDGET-AUTH`). Leads to unverified production spending and unassigned operational incident ownership.
- **Option B (All-or-Nothing Full V2 Launch):** Delay web release until Android hardware TalkBack (`DEF-V2-011`), qualified vault cryptanalysis (`DEF-V2-004`), and commercial AI contracts (`DEF-V2-008`) pass.  
  *Rejected:* Unnecessarily delays the verified everyday organizer core for web users.
- **Option C (Unified Reviewable Launch Package + Explicit Owner Authorization Gates + Staged Cohort Rollout):** Assemble a complete machine-readable launch package (`artifacts/phase122/production-launch-package.json`), reconcile all release documents to honest blocked status, present explicit decision checkboxes to the owner, and govern rollout via a 3-stage cohort plan.  
  *Accepted.*

---

## 4. Decision Outcome

We decided to implement **Option C**.

### 4.1 Exact Tested Artifact Identity

- **Git Commit SHA:** `f70aa3f9679ae927ea603773daf139b434b59adb`
- **Candidate Label:** `2.0.0-rc5`
- **Distributable Archives:**
  - Web: `artifacts/release/daynori-web-v2.0.0-rc5.tar.gz` (1,874,760 bytes, SHA-256: `628ce688a3da153348f56be5d378a0f8023ea8906cdf53aeff870421be61819b`, Next.js `BUILD_ID`: `XBApj-VgP3LPvLYt7b345`).
  - API: `artifacts/release/daynori-api-v2.0.0-rc5.tar.gz` (559,776 bytes, SHA-256: `6688fdcd4a37812a66670f56eddaa78512b5e50a72fbafaf42d7330c169a125b`).
- **Toolchain:** Node.js `v24.21.0` requirement, Next.js `15.5.27`, Fastify `5.2.1`, React `18.3.1`.

### 4.2 Authorized Scope Boundary

- **Enabled Public Scope (78 Verified Actions):** Account management, workspace navigation, personal notes (markdown AST, revisions), tasks (priorities, deadlines, keyboard reorder), daily routines (timezone-aware scheduling), calendar agenda, search, attachments, guided tours, and support feedback.
- **Fail-Closed Gated Modules (31 Gated Actions):**
  1. Zero-Knowledge Vault (`DEF-V2-001`, `DEF-V2-004`): HTTP 403 Forbidden.
  2. Multi-User Rooms & Chat (`DEF-V2-006`): HTTP 403 Forbidden.
  3. Live AI Assistant Streaming (`DEF-V2-008`): HTTP 403 Forbidden.
  4. Voice Assistant Audio Capture (`DEF-V2-008`, `DEF-V2-011`): UI disabled.
  5. Google Drive Integration (`DEF-V2-005`): Disabled pending CASA lab audit.
  6. In-App Billing (`DEF-V2-007`): HTTP 403 Forbidden.
  7. Push Notifications (`DEF-V2-002`): Disabled.
  8. Native Android Client Container (`OWNER-SIGNING-KEYS`, `DEF-V2-011`): Build guarded.

### 4.3 Capacity Envelope & Cost Architecture

- **Tier 1 (Closed Beta / Early Access):** $\le 35$ Peak Concurrent Users (10 RPS, ~1,000 registered users). Fits within Render Free/Starter ($0–$7/mo) + Supabase Free (15 connections).
- **Tier 2 (Public Launch / Growth):** 150 Peak Concurrent Users (45 RPS, ~5,000 registered users). Mandates **Managed PaaS Option 1** ($80–$110/mo for Railway Pro + Supabase Pro + Vercel Pro) with **PgBouncer transaction pooling** (60 connections).
- **Tier 3 (High-Scale):** 300 Peak Concurrent Users (90 RPS, ~10,000 registered users). Requires **Scaled PaaS** ($110–$160/mo for Railway 4GB RAM + Supabase Pro Compute Small) with 100 pooled connections.

### 4.4 Staged Cohort Rollout Strategy

1. **Stage 1 (Small Invited Cohort):** 50 to 100 invited users for 72 hours. Observe origin latency ($<250\text{ms}$), 5xx error rate ($0.00\%$), and support feedback before expanding.
2. **Stage 2 (Beta Expansion):** 500 to 1,000 registered users ($\le 30$ PCU) following zero SEV-1/SEV-2 incidents in Stage 1.
3. **Stage 3 (General Public Availability):** Scale up to 10,000 registered users only upon owner authorization of Managed PaaS budget and Supabase Pro PgBouncer activation.

### 4.5 Explicit Owner Approval Gates

The release candidate cannot be deployed to public production until the project owner provides explicit determinations on:
- [ ] **`OWNER-PROD-DNS`**: Exact production domain and Cloudflare DNS configuration (`app.daynori.com` / `api.daynori.com`).
- [ ] **`OWNER-BUDGET-AUTH`**: Authorization of hosting tier expenditure ($0–$7/mo for closed beta vs $80–$110/mo for Managed PaaS Option 1).
- [ ] **`OWNER-COHORT-SIZE`**: Authorization of initial invited cohort size (50–100 users).
- [ ] **`OWNER-RELEASE-AUTH`**: Formal publication authorization signature.

---

## 5. Consequences

### Positive
- Single, authoritative, machine-readable launch package eliminates ambiguity between staging evidence and production publication.
- Honest blocked status prevents false claims while providing a concrete decision path for the owner.
- Multi-tier capacity modeling ensures zero unexpected connection exhaustion or cost overruns.
- Clear rollback runbook guarantees sub-10-second static recovery under failure conditions.

### Negative / Trade-Offs
- Public launch remains blocked until the owner reviews the package and executes external provisioning.
- Free-tier infrastructure cannot safely scale beyond 35 concurrent users without paid PaaS upgrades.
