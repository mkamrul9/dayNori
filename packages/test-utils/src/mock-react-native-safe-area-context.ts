const ZERO = { top: 0, right: 0, bottom: 0, left: 0 };

export function useSafeAreaInsets() {
  return ZERO;
}

export function SafeAreaProvider({ children }: { children?: unknown }) {
  return children ?? null;
}

export const SafeAreaView = 'SafeAreaView';

export const initialWindowMetrics = {
  frame: { x: 0, y: 0, width: 0, height: 0 },
  insets: ZERO,
};

export default {
  useSafeAreaInsets,
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
};
