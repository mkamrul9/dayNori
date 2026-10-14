export const StyleSheet = {
  create: <T>(styles: T): T => styles,
  absoluteFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
};
export const Text = 'Text';
export const View = 'View';
export const SafeAreaView = 'SafeAreaView';
export const Pressable = 'Pressable';
export const Modal = 'Modal';
export const ScrollView = 'ScrollView';
export const KeyboardAvoidingView = 'KeyboardAvoidingView';
export const ActivityIndicator = 'ActivityIndicator';
export const TextInput = 'TextInput';
export const Platform = {
  OS: 'android',
  select: (objs: Record<string, unknown>) => objs['android'] ?? objs['default'],
};
export const AccessibilityInfo = {
  isReduceMotionEnabled: () => Promise.resolve(false),
  addEventListener: (_eventName: string, _handler: (enabled: boolean) => void) => ({
    remove: () => {},
  }),
};
