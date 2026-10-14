import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, type ThemeMode } from '@daynori/design-tokens';
import { MobileListRow, MobileModalSheet, MobileTextField } from '@daynori/ui-mobile';

export interface SearchSheetProps {
  visible: boolean;
  onClose: () => void;
  themeMode: ThemeMode;
  initialQuery?: string;
  onQueryChange?: (q: string) => void;
  testID?: string;
}

export const SearchSheet: React.FC<SearchSheetProps> = ({
  visible,
  onClose,
  themeMode,
  initialQuery = '',
  onQueryChange,
  testID = 'search-sheet',
}) => {
  const palette = colors[themeMode];
  const [query, setQuery] = useState(initialQuery);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (onQueryChange) onQueryChange(text);
  };

  const sampleResults = [
    { id: 's1', title: 'Quarterly Architecture Plan', type: 'Task', path: 'Workspace > Software' },
    {
      id: 's2',
      title: 'TypeScript Handbook.pdf',
      type: 'File',
      path: 'Workspace > Software > Guides',
    },
    { id: 's3', title: 'Morning deep work session', type: 'Routine', path: 'Workspace > Personal' },
    {
      id: 's4',
      title: 'Reflections on Architecture',
      type: 'Journal',
      path: 'Workspace > Journal',
    },
  ];

  const filteredResults = query.trim()
    ? sampleResults.filter(
        (r) =>
          r.title.toLowerCase().includes(query.toLowerCase()) ||
          r.type.toLowerCase().includes(query.toLowerCase()) ||
          r.path.toLowerCase().includes(query.toLowerCase())
      )
    : sampleResults;

  return (
    <MobileModalSheet
      visible={visible}
      onClose={onClose}
      title="Search Organizer"
      themeMode={themeMode}
      testID={testID}
    >
      <View style={styles.content}>
        <MobileTextField
          label="Search items, notes, routines, and files"
          placeholder="Type keywords (e.g., plan, typescript, journal)..."
          value={query}
          onChangeText={handleQueryChange}
          themeMode={themeMode}
          autoFocus={true}
        />

        <View style={styles.resultsContainer}>
          <Text style={[styles.resultsHeader, { color: palette.text.secondary }]}>
            {query.trim()
              ? `Search Results (${filteredResults.length})`
              : 'Recent & Suggested Items'}
          </Text>

          {filteredResults.map((res) => (
            <MobileListRow
              key={res.id}
              title={res.title}
              metadata={`[${res.type}] • ${res.path}`}
              themeMode={themeMode}
              onPress={() => {
                onClose();
              }}
              accessibilityLabel={`${res.title}, type ${res.type}, in ${res.path}`}
            />
          ))}

          {filteredResults.length === 0 && (
            <View style={styles.emptyResults}>
              <Text style={[styles.emptyText, { color: palette.text.muted }]}>
                No matching items found for "{query}".
              </Text>
            </View>
          )}
        </View>
      </View>
    </MobileModalSheet>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingVertical: spacing.sm,
  },
  resultsContainer: {
    marginTop: spacing.md,
  },
  resultsHeader: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  emptyResults: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
  },
});
