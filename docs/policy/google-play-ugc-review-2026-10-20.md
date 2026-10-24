# Google Play UGC policy review (2026-10-20)

**Primary source:** [User Generated Content — Play Console Help](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en)  
**Review date:** 2026-10-20  
**Related guidance cited in Help:** [Understanding moderation requirements…](https://support.google.com/googleplay/android-developer/answer/12923286) (linked from UGC materials; re-check before store submission).

This review does **not** claim store approval, production enablement, or a staffed moderation operation.

## Applicability to Daynori

Room chat and shared room content are UGC: user-contributed and visible to a subset of users (invite-only members). A “private room” label does **not** exempt UGC duties. Journal/vault are out of UGC sharing scope when correctly excluded.

Daynori’s current intended rooms shape is closer to a **specified / invite-only set** (report content and users required) than public social networking. Invitation and shared-room presence create interaction paths where **block** is implemented for invitation abuse and content hide-for-blocker. There is **no** public discovery, anonymous rooms, or dedicated DM product in Phase 54.

## Policy requirements mapped

| Play expectation (summary) | Local implementation | Gap |
|---|---|---|
| Accept terms/user policy before creating/uploading UGC | Server `UGC_TERMS_REQUIRED` on chat send; versioned docs | UI+API only; no production enforcement audience |
| Define/prohibit objectionable content | `docs/policy/acceptable-use-and-community-rules.md` | Not published externally |
| In-app report content and users | Report API + web/Android controls | No staffed triage |
| Block for 1:1-style interaction | Block API; invite accept blocked; history hide for blocker | Honest shared-room limits documented |
| Ongoing moderation / action on reports | Audit + status updates for allow-listed platform moderators | **No named operator / coverage** — release blocker |
| Monetization must not encourage abuse | N/A (no UGC monetization) | — |
| Incidental sexual content filters / minors | Audience undecided; feature disabled for real users | Age/audience decision unresolved |

## Remaining release blockers (explicit)

1. Named moderation owner and accepted operational responsibilities (human evidence required).
2. Staffed response coverage and escalation (including illegal content).
3. External/policy republication and store listing accuracy.
4. Prerequisite rooms/chat release gates (Phases 51–53 blocked status).
5. Physical device accessibility evidence where required by Gate C.

## Revisit

Re-check the official Play UGC page and linked policies immediately before any store candidate. Record a new dated review; do not rely on this file alone.
