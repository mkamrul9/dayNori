import { StyleSheet, Text, View, SafeAreaView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, radii } from '@daynori/design-tokens';

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          Daynori
        </Text>
        <Text style={styles.subtitle}>Your day, gathered.</Text>

        <View style={styles.card} accessible accessibilityLabel="Phase 01 Active Mobile Shell">
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Phase 01 Active</Text>
          </View>
          <Text style={styles.cardTitle}>Mobile Workspace Foundation</Text>
          <Text style={styles.cardBody}>
            Expo development shell configured with strict TypeScript, design tokens, and Android
            navigation readiness.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.xl,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.light.text.primary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 16,
    color: colors.light.text.secondary,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.light.surface,
    borderRadius: radii.card,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.light.border.subtle,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.light.action.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    marginBottom: spacing.sm,
  },
  badgeText: {
    color: colors.light.action.label,
    fontSize: 12,
    fontWeight: '600',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.light.text.primary,
    marginBottom: spacing.xs,
  },
  cardBody: {
    fontSize: 14,
    color: colors.light.text.secondary,
    lineHeight: 20,
  },
});
