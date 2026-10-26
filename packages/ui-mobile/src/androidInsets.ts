/**
 * Lightweight Android inset / keyboard adapter (no extra native module).
 * Feature-detects Keyboard + StatusBar; cleans up listeners.
 * Does not establish physical gesture-nav or TalkBack acceptance by itself.
 */
import {
  Keyboard,
  PixelRatio,
  Platform,
  StatusBar,
  type EmitterSubscription,
} from 'react-native';

export interface AndroidInsetsSnapshot {
  statusBarHeight: number;
  keyboardHeight: number;
  /** Suggested bottom padding for sticky chrome above the IME / nav bar. */
  bottomChromePad: number;
}

export function readAndroidInsets(keyboardHeight = 0): AndroidInsetsSnapshot {
  const statusBarHeight =
    Platform.OS === 'android' ? Math.max(0, StatusBar.currentHeight ?? 0) : 0;
  const bottomChromePad =
    Platform.OS === 'android' ? Math.max(8, keyboardHeight > 0 ? 8 : 12) + keyboardHeight : 0;
  return { statusBarHeight, keyboardHeight, bottomChromePad };
}

/**
 * Top padding so header chrome sits below the system status bar on Android edge-to-edge.
 * Without this, accessibility bounds can report header buttons while the StatusBar window
 * intercepts taps in the statusBars inset (measured ~128px on API 35 AVDs).
 */
export function androidStatusBarTopPad(): number {
  if (Platform.OS !== 'android') return 0;
  const reported = StatusBar.currentHeight ?? 0;
  const density = typeof PixelRatio?.get === 'function' ? PixelRatio.get() : 1;
  // 48dp scaled + floor 128px: StatusBar.currentHeight often under-reports vs statusBars
  // inset on edge-to-edge API 35 AVDs. Cap avoids pushing chrome off-screen.
  const scaled = Math.ceil(48 * Math.min(3.5, Math.max(1, density)));
  return Math.min(160, Math.max(reported, scaled, 128));
}

/**
 * Subscribe to keyboard show/hide. Returns unsubscribe.
 * On non-Android platforms the callback receives zeros and no listeners are attached.
 */
export function subscribeAndroidKeyboardInsets(
  onChange: (snapshot: AndroidInsetsSnapshot) => void
): () => void {
  onChange(readAndroidInsets(0));

  // Vitest / mini renderer may stub Platform as android without a Keyboard emitter.
  if (Platform.OS !== 'android' || typeof Keyboard?.addListener !== 'function') {
    return () => undefined;
  }

  const showSub: EmitterSubscription = Keyboard.addListener('keyboardDidShow', (e) => {
    onChange(readAndroidInsets(Math.round(e.endCoordinates?.height ?? 0)));
  });
  const hideSub: EmitterSubscription = Keyboard.addListener('keyboardDidHide', () => {
    onChange(readAndroidInsets(0));
  });

  return () => {
    showSub.remove();
    hideSub.remove();
  };
}

/** Prefer padding avoidance on both platforms so Android IME does not cover Save. */
export function keyboardAvoidingBehavior(): 'padding' | 'height' | undefined {
  if (Platform.OS === 'ios') return 'padding';
  if (Platform.OS === 'android') return 'padding';
  return undefined;
}
