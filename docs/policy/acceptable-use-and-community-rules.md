# Acceptable use and community rules

**Version:** `2026-10-20.1`  
**Status:** Provisional local documentation for Daynori rooms/chat. Not a claim of store approval or production enablement.

## Applicability

These rules apply to invite-only shared rooms and room chat (user-generated content visible to other members). Personal journals and vault content remain private and are not shared room UGC.

## Prohibited behavior and content

- Harassment, threats, stalking, or targeted abuse
- Hate speech or demeaning content based on protected characteristics
- Sexual content involving minors (always prohibited); non-consensual intimate imagery
- Spam, scams, phishing, or credential theft attempts
- Content that facilitates serious violence or illegal activity
- Attempts to bypass blocks, invitations abuse, or report-system abuse
- Sharing vault/journal/private workspace content into rooms

## Contribution gate

Users must accept this policy version (or a superseding version) before sending room chat. Server endpoints enforce acceptance; dismissing a UI banner alone is insufficient. When the version changes, contribution requires re-acceptance of the current version.

## Reporting

Members (including viewers) may report messages or users in rooms they currently belong to. Reports create a receipt with status `received`. Evidence is snapshotted at report time; later edits/deletes do not rewrite that snapshot. Reporter identity is not exposed to room owners or other members.

## Blocking and mute

- **Mute notifications** — Suppresses chat notification planning for a room; history remains.
- **Block** — Stops invitations between the pair and hides the blocked user's messages for the blocker. The blocked member keeps authorized room access if they remain a member. Block does not promise total invisibility of shared room content.
- **Leave / remove / archive** — Membership and room lifecycle controls; confirm before destructive use.

## Owner vs platform authority

Room owners may manage invitations, members (with last-owner protections), archive rooms, and moderate-delete messages in their rooms. Room ownership does **not** grant access to the platform report queue, reporter identity, or cross-room moderation.

Platform moderation actions require an explicitly configured platform moderator identity. No named operator is claimed in this repository; staffing remains a release blocker.

## Synthetic examples only

Examples and fixtures in tests use synthetic accounts. Do not publish externally or operate a real moderation service from this provisional work.
