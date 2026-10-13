# @daynori/api-client

Typed HTTP client for Daynori, consuming schemas from `@daynori/contracts`.

## Status

Established in Phase 01. Provides:
- `DaynoriApiClient`: Typed client wrapper accepting custom base URL and fetch implementation
- Methods: `.getHealth()`, `.getSmoke()`
- Response validation with structured contract error handling

See [API conventions](../../docs/architecture/api-conventions.md).
