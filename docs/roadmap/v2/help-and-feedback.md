# V2 Help, feedback, and developer contact

Status: planned for Phases 78, 82, and 83. Existing support text correctly avoids inventing an inbox; V2 must replace that limitation with a real verified service before claiming contact is available.

## Help experience

Help opens with a search field, Continue learning, common tasks, and Troubleshoot. Articles are task-based: goal, prerequisites, short steps, expected result, failures and recovery, platform differences, and a Start guided practice link. Include annotated synthetic screen examples where they improve understanding. Articles declare applicable feature versions/capabilities so unavailable buttons are not described as usable.

Cover the complete [feature inventory](feature-coverage.md), with particular depth on task vs routine, local save vs sync, offline reopen, files/quota, journal privacy, notifications/install, export/import, recovery, AI consent/citations/saves, and hidden modules. Keep user instructions concise; make detailed troubleshooting expandable. Searchable Help is useful without live AI and essential recovery articles are available offline.

Contextual Help from an editor opens the relevant article without losing a draft. Help, Support, Feedback, privacy, terms, and account deletion have consistent accessible entry points. Tutorials are launched from Help, not buried in developer Settings.

## Feedback intake

Offer Bug, Suggestion, and Contact developer. Required input is a short summary and description; bug reports may add steps, expected result, actual result, and frequency. Reply address is explicit and optional when a response is not requested. Do not assume the login identifier is a monitored mailbox.

The client shows a review screen for optional diagnostics: app version/build, platform/browser version, route template, bounded error code, and correlation ID. No tokens, cookies, note/journal bodies, account exports, raw prompts, chat history, audio, financial amounts, signed URLs, or query-string secrets. No automatic screen recording or screenshot collection. User-attached images require explicit selection, preview/removal, size/type validation, private storage, and a reminder to remove sensitive content.

Persist a scoped local draft, use an idempotent submission ID, and queue safely when offline. Statuses distinguish Draft, Queued on this device, Submitted, and Delivery failed. Only server acknowledgment can produce a report receipt. Retrying cannot create duplicate reports; logout/account switch cannot send a prior account's queued report under the next account.

Backend validates schema, membership, ownership, bounded content/attachments, rate limits, and abuse controls. Public pre-login contact, if chosen, uses a separate constrained endpoint with abuse protection and a verifiable response route. Its records cannot include or access workspace content. Notifications to an email/ticket provider are durable jobs; provider acceptance is distinct from developer review.

## Developer access and contact route

Provide a restricted triage area for authorized developer/support roles: new/acknowledged/investigating/resolved states, category, priority, duplicate links, safe diagnostics, attachment access, internal notes, and audit history. Triage counts and queries are role-authorized on the server, with private-report boundaries and minimal access. Do not expose all workspaces through an ordinary Developer settings toggle.

Phase 83 prepares concrete configuration and a test report before requesting any missing owner contact details. Choose a monitored destination, named support owner, expected response guidance, retention/deletion policy, and escalation for privacy/security reports. A developer email or external issue link must be supplied or verified, not invented. Never auto-post personal reports to public GitHub Issues. Contact can use the private in-app inbox if staffed; email is not mandatory, but a real monitored route and response mechanism are.

The report view can show acknowledgment and resolution when implemented; avoid promising live human chat or guaranteed response times. Disable or clearly explain an unconfigured route rather than showing false success. AI assistance does not replace the human contact path.

## Verification

Submit synthetic bug/suggestion/contact reports from web, installed PWA, and native Android; verify their durable receipt, restricted triage visibility, attachment permissions, actual configured delivery, and response route. Test offline retry, duplicate submission, account switch, unauthorized report IDs, spam limits, inaccessible attachments, invalid input, provider failure, retention expiry, and deletion. Reports and screenshots used as fixtures must be synthetic.
