# @daynori/mobile

Expo and React Native mobile application for Daynori (Android-first).

## Status

Established in Phase 01. Provides:

- Expo SDK 52 mobile application shell with strict TypeScript
- Accessible React Native UI styled with semantic design tokens
- Metro monorepo resolution configured via `metro.config.js`

## Commands and development build workflow

- `pnpm dev`: Start the Expo Metro development server (`expo start`)
- `pnpm prebuild`: Generate native Android project files (`expo prebuild --no-install -p android`)
- `pnpm build`: Generate the Android Hermes JavaScript bundle and static assets (`expo export -p android`)
- `pnpm android`: Run native debug build on a connected device or emulator via `expo run:android` (requires Android SDK and Java JDK)
- `pnpm typecheck`: Run strict TypeScript validation

See [system overview](../../docs/architecture/system-overview.md) and [repository layout](../../docs/engineering/repository-layout.md).
