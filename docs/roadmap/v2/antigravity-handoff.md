# V2 Antigravity handoff rules

The owner will request a prompt for one phase at a time. This file defines future prompt content; it does not start implementation or dispatch work to another agent.

1. Name the selected global phase ID and exact specification. V2 begins with completed planning Phase 64; the first implementation request is Phase 65. Avoid a second ambiguous “Phase 01” numbering scheme.
2. Require README, AGENTS, CONTRIBUTING, contributor handoff, V2 overview, progress, selected phase, linked specifications, prerequisite reports, and relevant ADRs to be read before edits. Inspect Git and preserve unrelated changes.
3. Explain the user-visible outcome, bounded files/packages, existing code to reuse, required behavior, accessibility/platform differences, negative cases, and explicit limits. Include professional icons/no emoji and the shared-domain/platform-adapter rule.
4. Verify prerequisites from evidence. A new V2 phase can repair provisional V1 behavior but cannot self-certify blocked legacy gates. If scope is too broad, propose appended bounded phases and record the amendment before expanding implementation.
5. Require tests against actual behavior, complete states and applicable manual/physical/provider evidence. Missing hardware, provider access, support ownership, or credentials stays recorded as unmet. Prepare all independent concrete work before asking for missing owner decisions.
6. Require updates to the phase report, CHANGELOG, progress, feature register, Help, and tour coverage where behavior changes. Update ADRs for material changes. Regenerate plans/blueprint when canonical plan changes.
7. Review full diff and staged paths, scan for private data, and make exactly one local conventional phase commit when acceptance passes. No automatic push, production feature enablement, paid service, store upload, or deployment.
8. Stop after that selected phase. Return behavior delivered, evidence, limits, commit, and next ready phase. Do not start subsequent phases or fabricate completion.

The response to a future request for a phase prompt should contain the requested copyable prompt only, unless a material prerequisite defect needs explaining. It should be grounded in the then-current files and progress, not blindly copied from today's plan.
