import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, type ThemeMode } from '@daynori/design-tokens';
import { MobileButton, MobileCard, MobileListRow, MobileTextField } from '@daynori/ui-mobile';

export interface JournalViewProps {
  themeMode: ThemeMode;
  isAuthenticated: boolean;
  onLoginSynthetic: () => void;
  onNavigateToToday: () => void;
  testID?: string;
}

export const JournalView: React.FC<JournalViewProps> = ({
  themeMode,
  isAuthenticated,
  onLoginSynthetic,
  onNavigateToToday,
  testID = 'journal-view',
}) => {
  const palette = colors[themeMode];
  const [isWriting, setIsWriting] = useState(false);
  const [entryTitle, setEntryTitle] = useState('');
  const [entryBody, setEntryBody] = useState('');
  const [entries, setEntries] = useState([
    {
      id: 'j1',
      date: 'Today, Oct 14',
      title: 'Reflections on Architecture & Simplicity',
      snippet:
        'Keeping system abstractions clean and platform adapters isolated brings long-term agility...',
    },
    {
      id: 'j2',
      date: 'Yesterday, Oct 13',
      title: 'Progressive Disclosure in Daily Organizers',
      snippet:
        'Users benefit when tools stay restrained until advanced capabilities are requested...',
    },
  ]);

  const handleSaveEntry = () => {
    if (!entryTitle.trim() && !entryBody.trim()) {
      setIsWriting(false);
      return;
    }
    const newEntry = {
      id: `j_${Date.now()}`,
      date: 'Today, Oct 14',
      title: entryTitle.trim() || 'Untitled Reflection',
      snippet: entryBody.trim().slice(0, 100),
    };
    setEntries([newEntry, ...entries]);
    setEntryTitle('');
    setEntryBody('');
    setIsWriting(false);
  };

  // If user is unauthenticated, show protected gate screen
  if (!isAuthenticated) {
    return (
      <View
        testID={testID}
        accessibilityRole="summary"
        accessibilityLabel="Authentication Required for Journal"
        style={[styles.protectedContainer, { backgroundColor: palette.background }]}
      >
        <View style={styles.protectedCard}>
          <Text style={styles.lockIcon} aria-hidden={true}>
            🔒
          </Text>
          <Text
            accessibilityRole="header"
            style={[styles.protectedTitle, { color: palette.text.primary }]}
          >
            Authentication Required
          </Text>
          <Text style={[styles.protectedDescription, { color: palette.text.secondary }]}>
            Journal reflections and entries are strictly private. Access requires workspace
            authentication to prevent unauthorized exposure.
          </Text>

          <View style={styles.protectedActions}>
            <MobileButton
              variant="primary"
              themeMode={themeMode}
              onPress={onLoginSynthetic}
              accessibilityLabel="Authenticate with synthetic account"
            >
              Sign In (Synthetic Demo)
            </MobileButton>

            <View style={{ height: spacing.sm }} />

            <MobileButton
              variant="subtle"
              themeMode={themeMode}
              onPress={onNavigateToToday}
              accessibilityLabel="Return to Today dashboard"
            >
              Return to Today
            </MobileButton>
          </View>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      testID={testID}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerRow}>
        <View>
          <Text accessibilityRole="header" style={[styles.title, { color: palette.text.primary }]}>
            Journal Timeline
          </Text>
          <Text style={[styles.subtitle, { color: palette.text.secondary }]}>
            Private space for reflection and daily thoughts
          </Text>
        </View>

        {!isWriting && (
          <MobileButton
            variant="primary"
            themeMode={themeMode}
            onPress={() => setIsWriting(true)}
            accessibilityLabel="Write new reflection"
          >
            ✍️ Write
          </MobileButton>
        )}
      </View>

      {/* Writing Entry Form */}
      {isWriting && (
        <View style={styles.writeContainer}>
          <MobileCard themeMode={themeMode}>
            <Text style={[styles.writeCardTitle, { color: palette.text.primary }]}>
              New Reflection
            </Text>
            <MobileTextField
              label="Title (optional)"
              placeholder="Give your thought a name..."
              value={entryTitle}
              onChangeText={setEntryTitle}
              themeMode={themeMode}
            />
            <MobileTextField
              label="Body"
              placeholder="What is on your mind today?"
              value={entryBody}
              onChangeText={setEntryBody}
              multiline={true}
              numberOfLines={4}
              themeMode={themeMode}
            />
            <View style={styles.writeButtonRow}>
              <MobileButton
                variant="primary"
                themeMode={themeMode}
                onPress={handleSaveEntry}
                accessibilityLabel="Save reflection"
              >
                Save Reflection
              </MobileButton>
              <View style={{ height: spacing.xs }} />
              <MobileButton
                variant="subtle"
                themeMode={themeMode}
                onPress={() => setIsWriting(false)}
                accessibilityLabel="Cancel reflection"
              >
                Cancel
              </MobileButton>
            </View>
          </MobileCard>
        </View>
      )}

      {/* Timeline Entries */}
      <View style={styles.timelineSection}>
        <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
          Entries ({entries.length})
        </Text>
        <MobileCard themeMode={themeMode}>
          {entries.map((entry) => (
            <MobileListRow
              key={entry.id}
              title={entry.title}
              metadata={`${entry.date} • ${entry.snippet}`}
              themeMode={themeMode}
              onPress={() => {}}
              accessibilityLabel={`${entry.title}, written on ${entry.date}`}
            />
          ))}
        </MobileCard>
      </View>

      <View style={styles.journalNote}>
        <Text style={[styles.journalNoteText, { color: palette.text.muted }]}>
          Journal prompts do not score emotions or suggest clinical diagnoses. Entries remain safely
          isolated within your private workspace.
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  protectedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  protectedCard: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    textAlign: 'center',
  },
  lockIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  protectedTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  protectedDescription: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  protectedActions: {
    width: '100%',
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  writeContainer: {
    marginBottom: spacing.md,
  },
  writeCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  writeButtonRow: {
    marginTop: spacing.sm,
  },
  timelineSection: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  journalNote: {
    marginTop: spacing.md,
    padding: spacing.sm,
  },
  journalNoteText: {
    fontSize: 12,
    lineHeight: 17,
  },
});
