export const StyleSheet = {
  create: <T>(styles: T): T => styles,
};
export const Text = 'Text';
export const View = 'View';
export const SafeAreaView = 'SafeAreaView';
export const Platform = {
  OS: 'android',
  select: (objs: Record<string, unknown>) => objs['android'] ?? objs['default'],
};
