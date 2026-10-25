/**
 * Browser adapter for visualViewport / dynamic viewport insets.
 * Feature-detects support, updates CSS custom properties, and cleans up listeners.
 * Keyboard simulation in tests does not establish physical Android IME behavior.
 */

export interface VisualViewportInsets {
  /** Offset from layout viewport bottom to visual viewport bottom (keyboard / chrome). */
  keyboardInset: number;
  /** Visual viewport height when available; otherwise layout height. */
  visualHeight: number;
  supported: boolean;
}

const KEYBOARD_VAR = '--daynori-keyboard-inset';
const VV_HEIGHT_VAR = '--daynori-vv-height';

function readInsets(): VisualViewportInsets {
  if (typeof window === 'undefined') {
    return { keyboardInset: 0, visualHeight: 0, supported: false };
  }
  const vv = window.visualViewport;
  if (!vv) {
    return {
      keyboardInset: 0,
      visualHeight: window.innerHeight,
      supported: false,
    };
  }
  const keyboardInset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
  return {
    keyboardInset,
    visualHeight: Math.round(vv.height),
    supported: true,
  };
}

function applyInsets(insets: VisualViewportInsets): void {
  const root = document.documentElement;
  root.style.setProperty(KEYBOARD_VAR, `${insets.keyboardInset}px`);
  root.style.setProperty(VV_HEIGHT_VAR, `${insets.visualHeight || window.innerHeight}px`);
}

/**
 * Subscribe to visualViewport resize/scroll and window resize.
 * Returns an unsubscribe that removes listeners and clears CSS vars when requested.
 */
export function subscribeVisualViewport(
  onChange?: (insets: VisualViewportInsets) => void
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const publish = () => {
    const insets = readInsets();
    applyInsets(insets);
    onChange?.(insets);
  };

  publish();

  const vv = window.visualViewport;
  window.addEventListener('resize', publish);
  if (vv) {
    vv.addEventListener('resize', publish);
    vv.addEventListener('scroll', publish);
  }

  return () => {
    window.removeEventListener('resize', publish);
    if (vv) {
      vv.removeEventListener('resize', publish);
      vv.removeEventListener('scroll', publish);
    }
  };
}

export function getVisualViewportInsets(): VisualViewportInsets {
  return readInsets();
}

export { KEYBOARD_VAR, VV_HEIGHT_VAR };
