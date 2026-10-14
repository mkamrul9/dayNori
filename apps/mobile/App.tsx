import { useState } from 'react';
import { SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import {
  MobileButton,
  MobileCard,
  MobileFeedback,
  MobileListRow,
  MobileModalSheet,
  MobileTextField,
} from '@daynori/ui-mobile';

export default function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const [isSheetVisible, setIsSheetVisible] = useState<boolean>(false);
  const [selectedRow, setSelectedRow] = useState<string>('row-1');
  const [inputText, setInputText] = useState<string>('');
  const [showError, setShowError] = useState<boolean>(false);

  const palette = colors[themeMode];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]}>
      <StatusBar barStyle={themeMode === 'light' ? 'dark-content' : 'light-content'} />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text
              accessibilityRole="header"
              style={[styles.title, { color: palette.text.primary }]}
            >
              Daynori Mobile
            </Text>
            <Text style={[styles.subtitle, { color: palette.text.secondary }]}>
              Accessible Primitives & Component Gallery (Phase 04)
            </Text>
          </View>

          <View style={styles.themeToggleContainer}>
            <MobileButton
              variant="secondary"
              themeMode={themeMode}
              onPress={() => setThemeMode((m) => (m === 'light' ? 'dark' : 'light'))}
              accessibilityLabel={`Switch to ${themeMode === 'light' ? 'dark' : 'light'} theme`}
            >
              {themeMode === 'light' ? '🌙 Dark Mode' : '☀️ Light Mode'}
            </MobileButton>
          </View>
        </View>

        {/* Section 1: Buttons */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
            1. Mobile Buttons (48dp Touch Target)
          </Text>
          <MobileCard themeMode={themeMode}>
            <View style={styles.buttonStack}>
              <MobileButton variant="primary" themeMode={themeMode} onPress={() => {}}>
                Primary Button
              </MobileButton>

              <MobileButton variant="secondary" themeMode={themeMode} onPress={() => {}}>
                Secondary Button
              </MobileButton>

              <MobileButton variant="subtle" themeMode={themeMode} onPress={() => {}}>
                Subtle Button
              </MobileButton>

              <MobileButton variant="danger" themeMode={themeMode} onPress={() => {}}>
                Danger Button
              </MobileButton>

              <MobileButton
                variant="primary"
                loading={true}
                themeMode={themeMode}
                onPress={() => {}}
              >
                Loading...
              </MobileButton>

              <MobileButton
                variant="secondary"
                disabled={true}
                themeMode={themeMode}
                onPress={() => {}}
              >
                Disabled Action
              </MobileButton>
            </View>
          </MobileCard>
        </View>

        {/* Section 2: Text Fields */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
            2. Native Form Inputs
          </Text>
          <MobileCard themeMode={themeMode}>
            <View style={styles.fieldStack}>
              <MobileTextField
                label="Workspace Name"
                placeholder="e.g., Personal Notebook"
                helperText="Familiar title for your daily workspace."
                themeMode={themeMode}
                value={inputText}
                onChangeText={setInputText}
              />

              <MobileTextField
                label="Daily Goal"
                placeholder="e.g., Review priorities"
                errorMessage={showError ? 'A daily intention title is required.' : undefined}
                helperText={!showError ? 'Set an intentional focus for today.' : undefined}
                themeMode={themeMode}
                defaultValue="Reflect on week"
              />

              <MobileButton
                variant="subtle"
                themeMode={themeMode}
                onPress={() => setShowError((prev) => !prev)}
              >
                {showError ? 'Clear Error State' : 'Trigger Validation Error State'}
              </MobileButton>

              <MobileTextField
                label="Account ID (Read-only)"
                value="usr_daynori_01948a"
                editable={false}
                helperText="Fixed identifier assigned to your local profile."
                themeMode={themeMode}
              />
            </View>
          </MobileCard>
        </View>

        {/* Section 3: List Rows */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
            3. Interactive List Rows (&gt;= {touchTargets.mobileMin}dp)
          </Text>
          <MobileCard themeMode={themeMode}>
            <View style={styles.listStack}>
              <MobileListRow
                title="Review Phase 04 design tokens"
                subtitle="WCAG 2.2 Level AA contrast verified"
                meta="Today"
                selected={selectedRow === 'row-1'}
                onPress={() => setSelectedRow('row-1')}
                themeMode={themeMode}
              />

              <MobileListRow
                title="Bangla script readability check"
                subtitle="Ensure diacritics and matras do not clip"
                meta="In Progress"
                selected={selectedRow === 'row-2'}
                onPress={() => setSelectedRow('row-2')}
                themeMode={themeMode}
              />

              <MobileListRow
                title="Archived item"
                subtitle="Disabled item shows muted state"
                meta="Archived"
                disabled={true}
                themeMode={themeMode}
              />
            </View>
          </MobileCard>
        </View>

        {/* Section 4: Feedback */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
            4. Status & Feedback Notices
          </Text>
          <View style={styles.feedbackStack}>
            <MobileFeedback
              severity="info"
              title="Sync Status"
              message="Local workspace is up to date."
              themeMode={themeMode}
            />
            <MobileFeedback
              severity="success"
              title="Journal Saved"
              message="Entry #142 saved to local database."
              themeMode={themeMode}
            />
            <MobileFeedback
              severity="warning"
              title="Storage Advisory"
              message="SQLite storage quota approaching 80%."
              themeMode={themeMode}
            />
            <MobileFeedback
              severity="danger"
              title="Connection Error"
              message="Server offline. Offline drafts preserved."
              themeMode={themeMode}
            />
          </View>
        </View>

        {/* Section 5: Modal Bottom Sheet */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
            5. Accessible Bottom Modal Sheet
          </Text>
          <MobileCard themeMode={themeMode}>
            <MobileButton
              variant="primary"
              themeMode={themeMode}
              onPress={() => setIsSheetVisible(true)}
            >
              Open Modal Sheet
            </MobileButton>

            <MobileModalSheet
              visible={isSheetVisible}
              onClose={() => setIsSheetVisible(false)}
              title="Workspace Action"
              themeMode={themeMode}
            >
              <View style={styles.sheetBody}>
                <Text style={[styles.sheetText, { color: palette.text.secondary }]}>
                  This sheet traps focus and handles Android hardware back button via
                  onRequestClose.
                </Text>
                <View style={styles.sheetActions}>
                  <MobileButton
                    variant="secondary"
                    themeMode={themeMode}
                    onPress={() => setIsSheetVisible(false)}
                  >
                    Cancel
                  </MobileButton>
                  <MobileButton
                    variant="danger"
                    themeMode={themeMode}
                    onPress={() => setIsSheetVisible(false)}
                  >
                    Confirm Action
                  </MobileButton>
                </View>
              </View>
            </MobileModalSheet>
          </MobileCard>
        </View>

        {/* Section 6: Bangla Typography */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
            6. Bangla Script & Dynamic Type Readability
          </Text>
          <MobileCard themeMode={themeMode}>
            <Text
              style={[
                styles.banglaHeader,
                { color: palette.text.primary, lineHeight: 18 * typography.lineHeight.bangla },
              ]}
            >
              আপনার দিন, একত্রিত। একটি শান্ত ও নির্ভরযোগ্য নোটবুক।
            </Text>
            <Text
              style={[
                styles.banglaBody,
                { color: palette.text.secondary, lineHeight: 14 * typography.lineHeight.bangla },
              ]}
            >
              নোট, রুটিন, কাজ এবং ব্যক্তিগত জার্নাল লেখার একটি সহজ মাধ্যম। জটিল যুক্তাক্ষর (যেমন:
              ক্ষ, জ্ঞ, ঞ্চ, ম্প, ত্র) এবং উপর-নিচের কারচিহ্ন (হ্রস্ব-ইকার, দীর্ঘ-ঈকার, হ্রস্ব-উকার)
              যেন কোনোভাবে কেটে না যায়, তা এই বিশেষ লাইনের উচ্চতা দ্বারা নিশ্চিত করা হয়েছে।
            </Text>
          </MobileCard>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    paddingBottom: spacing.xxl,
  },
  header: {
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  themeToggleContainer: {
    marginTop: spacing.xs,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  buttonStack: {
    gap: spacing.sm,
  },
  fieldStack: {
    gap: spacing.sm,
  },
  listStack: {
    gap: spacing.xs,
  },
  feedbackStack: {
    gap: spacing.sm,
  },
  sheetBody: {
    gap: spacing.base,
  },
  sheetText: {
    fontSize: 14,
    lineHeight: 20,
  },
  sheetActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  banglaHeader: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  banglaBody: {
    fontSize: 14,
  },
});
