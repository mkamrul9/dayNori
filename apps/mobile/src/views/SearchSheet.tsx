import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { colors, spacing, radii, type ThemeMode } from '@daynori/design-tokens';
import { MobileListRow, MobileModalSheet, MobileTextField } from '@daynori/ui-mobile';
import type { DaynoriApiClient } from '@daynori/api-client';
import type { LocalRepositoryPort } from '@daynori/sync';
import type { SearchResultItem, SearchItemType } from '@daynori/contracts';
import { searchDownloadedRecords } from '@daynori/domain';

export interface SearchSheetProps {
  visible: boolean;
  onClose: () => void;
  themeMode: ThemeMode;
  initialQuery?: string;
  onQueryChange?: (q: string) => void;
  testID?: string;
  workspaceId?: string;
  userId?: string;
  apiClient?: DaynoriApiClient;
  localRepository?: LocalRepositoryPort;
  onSelectItem?: (item: SearchResultItem) => void;
}

export const SearchSheet: React.FC<SearchSheetProps> = ({
  visible,
  onClose,
  themeMode,
  initialQuery = '',
  onQueryChange,
  testID = 'search-sheet',
  workspaceId,
  userId: _userId,
  apiClient,
  localRepository,
  onSelectItem,
}) => {
  const palette = colors[themeMode];
  const [query, setQuery] = useState(initialQuery);
  const [selectedType, setSelectedType] = useState<SearchItemType>('all');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [coverage, setCoverage] = useState<'complete' | 'offline_limited' | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  const searchAbortRef = useRef<AbortController | null>(null);

  // Clear query and results when sheet is opened/closed
  useEffect(() => {
    if (!visible) {
      setQuery(initialQuery);
      setSelectedType('all');
      setSearchResults([]);
      setCoverage(null);
      setIsOffline(false);
      setIsLoading(false);
    }
  }, [visible, initialQuery]);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (onQueryChange) onQueryChange(text);
  };

  // Perform search query with debounce
  useEffect(() => {
    if (!visible) return;

    const trimmed = query.trim();
    if (!trimmed && selectedType === 'all') {
      setSearchResults([]);
      setCoverage(null);
      setIsLoading(false);
      return;
    }

    if (!workspaceId && !localRepository) {
      // Fallback to sample results when no workspace or repository is wired
      return;
    }

    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    const abortController = new AbortController();
    searchAbortRef.current = abortController;

    const timer = setTimeout(async () => {
      setIsLoading(true);
      const types = selectedType !== 'all' ? [selectedType] : undefined;

      try {
        if (apiClient && workspaceId) {
          const res = await apiClient.searchWorkspace(
            workspaceId,
            {
              q: trimmed,
              types,
              limit: 20,
            },
            { signal: abortController.signal }
          );

          if (!abortController.signal.aborted) {
            setSearchResults(res.data);
            setCoverage(res.meta.coverage);
            setIsOffline(false);
            setIsLoading(false);
          }
        } else if (localRepository && workspaceId) {
          // Local offline search
          const [headers, notes, tasks, journals, files] = await Promise.all([
            localRepository.listItemHeaders(workspaceId),
            localRepository.listNotes(workspaceId),
            localRepository.listTasks(workspaceId),
            localRepository.listJournalEntries(workspaceId),
            localRepository.listFiles(workspaceId),
          ]);

          const localRes = searchDownloadedRecords({
            workspaceId,
            query: { q: trimmed, types, limit: 20 },
            items: {
              headers,
              notes,
              tasks,
              journalEntries: journals,
              files,
            },
            preferences: { journalPreviewHidden: true, suppressBodySnippets: true },
          });

          if (!abortController.signal.aborted) {
            setSearchResults(localRes.data);
            setCoverage('offline_limited');
            setIsOffline(true);
            setIsLoading(false);
          }
        }
      } catch {
        if (abortController.signal.aborted) return;
        // Network failed -> fallback to local repository
        if (localRepository && workspaceId) {
          try {
            const [headers, notes, tasks, journals, files] = await Promise.all([
              localRepository.listItemHeaders(workspaceId),
              localRepository.listNotes(workspaceId),
              localRepository.listTasks(workspaceId),
              localRepository.listJournalEntries(workspaceId),
              localRepository.listFiles(workspaceId),
            ]);

            const localRes = searchDownloadedRecords({
              workspaceId,
              query: { q: trimmed, types, limit: 20 },
              items: {
                headers,
                notes,
                tasks,
                journalEntries: journals,
                files,
              },
              preferences: { journalPreviewHidden: true, suppressBodySnippets: true },
            });

            setSearchResults(localRes.data);
            setCoverage('offline_limited');
            setIsOffline(true);
          } catch {
            setSearchResults([]);
            setCoverage('offline_limited');
          }
        } else {
          setSearchResults([]);
        }
        setIsLoading(false);
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      abortController.abort();
    };
  }, [query, selectedType, workspaceId, apiClient, localRepository, visible]);

  // Fallback sample results if neither apiClient nor localRepository is active
  const sampleResults: SearchResultItem[] = [
    {
      id: 's1',
      kind: 'todo',
      displayType: 'task',
      title: 'Quarterly Architecture Plan',
      snippet: 'Prioritized architectural milestones',
      folderPath: 'Workspace > Software',
      tags: ['architecture'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 's2',
      kind: 'file_item',
      displayType: 'file',
      title: 'TypeScript Handbook.pdf',
      snippet: 'PDF document reference guide',
      folderPath: 'Workspace > Software > Guides',
      tags: ['docs'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 's3',
      kind: 'note',
      displayType: 'note',
      title: 'Morning deep work session',
      snippet: 'Focus routines and notes',
      folderPath: 'Workspace > Personal',
      tags: ['routine'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 's4',
      kind: 'journal_entry',
      displayType: 'journal',
      title: 'Reflections on Architecture',
      snippet: '[Private journal entry]',
      folderPath: 'Workspace > Journal',
      tags: ['reflection'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const hasLiveDataSource = Boolean(apiClient || localRepository);
  const activeResults = hasLiveDataSource
    ? searchResults
    : query.trim()
      ? sampleResults.filter(
          (r) =>
            r.title.toLowerCase().includes(query.toLowerCase()) ||
            r.displayType.toLowerCase().includes(query.toLowerCase()) ||
            r.folderPath.toLowerCase().includes(query.toLowerCase())
        )
      : sampleResults;

  const typeFilterOptions: Array<{ id: SearchItemType; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'note', label: 'Notes' },
    { id: 'task', label: 'Tasks' },
    { id: 'journal', label: 'Journal' },
    { id: 'file', label: 'Files' },
    { id: 'knowledge', label: 'Knowledge' },
  ];

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

        {/* Type Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterContent}
        >
          {typeFilterOptions.map((opt) => {
            const isSelected = selectedType === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                onPress={() => setSelectedType(opt.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: isSelected ? palette.action.subtle : palette.surfaceRaised,
                    borderColor: isSelected ? palette.action.primary : palette.border.subtle,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    {
                      color: isSelected ? palette.text.primary : palette.text.secondary,
                      fontWeight: isSelected ? '700' : '400',
                    },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {isOffline && (
          <View style={[styles.offlineBanner, { backgroundColor: palette.surfaceRaised }]}>
            <Text style={[styles.offlineText, { color: palette.text.secondary }]}>
              Limited offline search — showing downloaded items.
            </Text>
          </View>
        )}

        <View style={styles.resultsContainer}>
          <Text style={[styles.resultsHeader, { color: palette.text.secondary }]}>
            {isLoading
              ? 'Searching...'
              : query.trim() || selectedType !== 'all'
                ? `Search Results (${activeResults.length})${coverage === 'offline_limited' ? ' (Offline)' : ''}`
                : 'Recent & Suggested Items'}
          </Text>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={palette.action.primary} />
            </View>
          ) : (
            <>
              {activeResults.map((res) => (
                <MobileListRow
                  key={res.id}
                  title={res.title}
                  metadata={`[${res.displayType}] • ${res.folderPath}${res.snippet ? `\n${res.snippet}` : ''}`}
                  themeMode={themeMode}
                  onPress={() => {
                    onSelectItem?.(res);
                    onClose();
                  }}
                  accessibilityLabel={`${res.title}, type ${res.displayType}, in ${res.folderPath}`}
                />
              ))}

              {activeResults.length === 0 && (
                <View style={styles.emptyResults}>
                  <Text style={[styles.emptyText, { color: palette.text.muted }]}>
                    No matching items found for "{query}".
                  </Text>
                </View>
              )}
            </>
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
  filterScroll: {
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  filterContent: {
    gap: spacing.xs,
    paddingVertical: 2,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12,
  },
  offlineBanner: {
    padding: spacing.xs,
    borderRadius: radii.sm,
    marginTop: spacing.xs,
  },
  offlineText: {
    fontSize: 11,
    fontStyle: 'italic',
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
  loadingContainer: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyResults: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
  },
});
