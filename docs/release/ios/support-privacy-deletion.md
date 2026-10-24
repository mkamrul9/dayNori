# Support, privacy, and account-deletion resources

| Resource | Local path / route | Production status |
|---|---|---|
| Privacy | `apps/web` `/privacy` | Public URL unverified |
| Terms | `/terms` | Public URL unverified |
| Support | `/support` | Contact fields may be unresolved placeholders |
| Account deletion (web) | `/account-deletion` | Required for store policy when accounts exist |
| In-app deletion | `MobileAccountDeletionSheet` | Implemented; native UX unverified on iOS |

Apple requires a privacy policy URL for App Store Connect ([app privacy reference](https://developer.apple.com/help/app-store-connect/reference/app-privacy/), checked 2026-10-21). Account deletion must remain available if account creation is offered (Review Guidelines 5.1.1).

**Do not** invent monitored inboxes or live support SLAs in listing drafts.
