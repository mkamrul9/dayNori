/**
 * Nori Companion & Assistant Launcher Domain Logic
 * Phase 96: Nori original companion and assistant launcher.
 *
 * Implements truthful state derivation, accessibility-first reduced motion gating,
 * safe corner coordinates, and asset provenance records.
 */

export type NoriCompanionPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export type NoriCompanionState =
  | 'idle'
  | 'greeting'
  | 'listening'
  | 'thinking'
  | 'success'
  | 'error'
  | 'offline'
  | 'sleeping';

export interface NoriCompanionPreferences {
  enabled: boolean;
  position: NoriCompanionPosition;
  reducedMotion: boolean;
}

export const NORI_NAME_METADATA = {
  name: 'Nori',
  fullName: 'Daynori Assistant Companion (Nori)',
  origin: 'Friendly diminutive and root of Daynori (Day + Nori).',
  direction: 'Folded-paper / origami notebook companion with teal body, ink features, and warm amber accent.',
  author: 'Daynori Core Team',
  license: 'MIT',
  generationMethod: 'Handcrafted geometric vector coordinate drafting. Zero AI image generation, zero third-party stock/clipart inputs.',
  palette: {
    tealPrimary: '#146B63',
    tealDark: '#0E524C',
    tealLight: '#1D7F76',
    ink: '#172C2C',
    paper: '#F7F5EF',
    warmAccent: '#D9A441',
    alertAmber: '#8F4E00',
    slateMuted: '#526363',
  },
  namingReviewStatus: 'Screened for application conflicts; no productivity/notebook character collisions found. Public trademark registration remains pending public commercial launch gate.',
} as const;

export interface ResolveNoriStateInput {
  isAssistantOpen?: boolean;
  isListening?: boolean;
  isThinking?: boolean;
  isSuccess?: boolean;
  isError?: boolean;
  isOffline?: boolean;
  isQuietHours?: boolean;
  isHoveredOrFocused?: boolean;
}

/**
 * Derives Nori's presentation state from factual application conditions.
 *
 * Invariants:
 * 1. Listening ONLY occurs during explicit, active microphone capture. Displaying or opening the launcher NEVER triggers listening.
 * 2. Thinking occurs strictly while a request or stream is in flight.
 * 3. Success occurs strictly upon acknowledged result/confirmation.
 * 4. Error shows truth when a capability fails, keeping Help accessible.
 * 5. Offline shows truth when network/service is disconnected.
 * 6. Quiet hours or resting state triggers sleeping.
 * 7. Hover or focus triggers a polite, quiet greeting fold.
 */
export function resolveNoriState(input: ResolveNoriStateInput): NoriCompanionState {
  // 1. Explicit listening during active voice recording takes top priority
  if (input.isListening) {
    return 'listening';
  }

  // 2. Truthful failure / capability error takes precedence
  if (input.isError) {
    return 'error';
  }

  // 3. In-flight request or streaming response
  if (input.isThinking) {
    return 'thinking';
  }

  // 4. Acknowledged action success or proposal confirmation
  if (input.isSuccess) {
    return 'success';
  }

  // 5. Offline connectivity or 503 service disconnection
  if (input.isOffline) {
    return 'offline';
  }

  // 6. Quiet hours resting state
  if (input.isQuietHours) {
    return 'sleeping';
  }

  // 7. Hover, focus, or assistant drawer opening triggers brief greeting
  if (input.isHoveredOrFocused || input.isAssistantOpen) {
    return 'greeting';
  }

  // Default quiet resting posture
  return 'idle';
}

export interface NoriSafeCoordinates {
  top?: number | string;
  bottom?: number | string;
  left?: number | string;
  right?: number | string;
}

export interface InsetConstraints {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  bottomNavHeight?: number;
  bannerHeight?: number;
}

/**
 * Calculates safe positioning coordinates for the Nori floating launcher,
 * avoiding bottom navigation, banners, editors, and system safe areas.
 */
export function calculateNoriSafeCoordinates(
  position: NoriCompanionPosition,
  insets: InsetConstraints = {}
): NoriSafeCoordinates {
  const topPad = (insets.top ?? 0) + (insets.bannerHeight ?? 0) + 16;
  const bottomPad = (insets.bottom ?? 0) + (insets.bottomNavHeight ?? 0) + 16;
  const leftPad = (insets.left ?? 0) + 16;
  const rightPad = (insets.right ?? 0) + 16;

  switch (position) {
    case 'bottom-right':
      return { bottom: bottomPad, right: rightPad };
    case 'bottom-left':
      return { bottom: bottomPad, left: leftPad };
    case 'top-right':
      return { top: topPad, right: rightPad };
    case 'top-left':
      return { top: topPad, left: leftPad };
    default:
      return { bottom: bottomPad, right: rightPad };
  }
}

/**
 * Determines whether animation timers and transitions should be suppressed.
 * Returns true if system prefers-reduced-motion is active OR in-app reducedMotion is enabled.
 */
export function shouldReduceNoriMotion(
  prefs?: Partial<NoriCompanionPreferences>,
  systemPrefersReducedMotion = false
): boolean {
  if (prefs?.reducedMotion === true) return true;
  return systemPrefersReducedMotion;
}

/**
 * Standard transition parameters honoring reduced-motion guarantees.
 */
export function getNoriMotionDurations(isReducedMotion: boolean): {
  transitionMs: number;
  pulseMs: number;
  allowAnimation: boolean;
} {
  if (isReducedMotion) {
    return {
      transitionMs: 0,
      pulseMs: 0,
      allowAnimation: false,
    };
  }

  return {
    transitionMs: 180,
    pulseMs: 1400,
    allowAnimation: true,
  };
}

/**
 * Returns human-readable accessible announcements and tooltip descriptions for each state.
 */
export function getNoriStateAccessibilityLabel(state: NoriCompanionState): string {
  switch (state) {
    case 'idle':
      return 'Nori assistant companion, ready to help';
    case 'greeting':
      return 'Nori greeting, tap to ask a question';
    case 'listening':
      return 'Nori is listening to microphone capture';
    case 'thinking':
      return 'Nori is thinking and retrieving information';
    case 'success':
      return 'Nori completed your requested action';
    case 'error':
      return 'Nori encountered an issue; manual options available';
    case 'offline':
      return 'Nori is offline; manual creation remains available';
    case 'sleeping':
      return 'Nori is resting during quiet hours';
    default:
      return 'Nori assistant companion';
  }
}
