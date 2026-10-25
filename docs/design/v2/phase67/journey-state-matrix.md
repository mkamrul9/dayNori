# Journey / state matrix

Prototype: `prototype.html`. Synthetic English + Bangla fixtures. Simulated statuses only.

| Journey | Empty | Populated | Loading | Success | Invalid | Save fail + retry | Offline | Denied / unauth | Unavailable | Conflict / draft | Long content | Light/dark | Reduced motion |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Welcome / auth | Welcome CTA | — | Auth loading demo | Simulated sign-in → Today | Validation error demo | — | Unavailable service demo | — | Service unavailable | Email preserved | — | Review bar | CSS prefers-reduced-motion |
| Today / capture | Empty account toggle | Tasks/routines/prompt | — | Sync badges | — | Via Create → task | Offline badge | — | — | Draft note path | Bangla titles | Yes | Yes |
| Plan | — | Tasks/routines/calendar | — | Occurrence complete | — | Task editor fail | Badge | — | — | — | — | Yes | Yes |
| Library | — | Mixed folder | — | Clear filters | Upload error | — | Badge | — | Upload unsupported | Filename preserved | Long BN title | Yes | Yes |
| Journal | Empty write | Timeline + write | — | Save entry | — | Draft kept messaging | Badge | Private previews | — | Recoverable draft | Long textarea | Yes | Yes |
| Nav personalization | — | Pins / hide / restore | — | Announcements | — | — | — | Protected utilities | Not released badges | — | — | Yes | Yes |
| Settings | — | Grouped sections | — | — | — | — | — | No developer tools | — | Recovery concept | — | Yes | Yes |
| Help / tour | No-results search | Articles + tour | — | Tour steps | Missing-target copy | — | — | — | No monitored inbox claim | Pause/resume | — | Yes | Yes |
| Assistant | Pre-consent | Answer + proposal | — | Confirm illustrative | — | Cancel proposal | Offline demo | Consent gate | Unavailable demo | Editable proposal | — | Yes | Yes |

## Visibility vocabulary (required)

| Condition | Prototype treatment |
| --- | --- |
| Personally hidden | “Hidden by you — content kept” |
| Not released | “Not released yet” (Vault/Rooms) |
| Not authorized | Ordinary Settings omits operator tools |
| Temporarily unavailable | Auth/assistant offline demos |

## Offline honesty

Cold offline organizer reconstruction is **not** claimed. Future recovery UI is labeled proposed → Phase 77. Sync badges only illustrate device / waiting / synchronized copy.
