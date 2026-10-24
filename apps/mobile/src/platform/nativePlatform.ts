/**
 * Mobile platform identity helpers (Android + iOS).
 *
 * Android notification/alarm semantics must not be assumed on iOS.
 * Physical-device verification remains a separate evidence lane.
 */

import { Platform } from 'react-native';
import type { DevicePlatform } from '@daynori/contracts';

export type NativeMobilePlatform = Extract<DevicePlatform, 'android' | 'ios'>;

export function getNativeMobilePlatform(): NativeMobilePlatform {
  if (Platform.OS === 'ios') return 'ios';
  return 'android';
}

export function isIosPlatform(): boolean {
  return Platform.OS === 'ios';
}

export function isAndroidPlatform(): boolean {
  return Platform.OS === 'android';
}

/** Sync/local device id prefix — never hard-code "android" on iOS. */
export function mobileDeviceIdPrefix(platform: NativeMobilePlatform = getNativeMobilePlatform()): string {
  return platform === 'ios' ? 'mobile_ios' : 'mobile_android';
}

export function createMobileDeviceId(
  platform: NativeMobilePlatform = getNativeMobilePlatform()
): string {
  return `${mobileDeviceIdPrefix(platform)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function describeOsVersion(): string {
  return Platform.Version != null ? String(Platform.Version) : 'unknown';
}
