# ADR-0001: Platform-specific clients with shared TypeScript

Date: 2026-10-13. Status: accepted for planning.

## Context

The product needs a polished Android app and responsive web app with common behavior, while notifications, biometric/key storage, audio, document interaction and browser accessibility have different platform constraints.

## Decision

Use Expo React Native/Expo Router for Android-first mobile and Next.js for web. Share pure domain rules, validated contracts, sync algorithms, time/money helpers, tokens and fixtures in a TypeScript monorepo. Keep HTML/native presentation and device/storage adapters platform-specific. Validate iOS later as a separate release track.

## Alternatives

A single React Native Web UI would maximize component reuse but complicate semantic web interaction and native/browser dependency behavior. Flutter would be viable but changes the language/toolchain and limits direct TypeScript contract reuse. Two unrelated application codebases risk business-rule drift.

## Consequences and validation

UI effort is higher than a forced single view layer, but domain behavior remains shared. The foundation phase must prove a shared domain fixture through both local repositories, keyboard/semantic web behavior, a physical Android development build, and a compatible pinned native dependency set. Do not claim biometric/exact-alarm parity on browsers.

Revisit when evidence shows shared domain maintenance costs or native platform constraints materially undermine the product. See [system overview](../architecture/system-overview.md).
