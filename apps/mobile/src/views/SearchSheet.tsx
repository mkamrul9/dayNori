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
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const searchAbortRef = useRef<AbortController | null>(null);
  const requestGenRef = useRef(0);

  // Clear query and results when sheet is opened/closed or workspace changes
  useEffect(() => {
    if (!visible) {
      setQuery(initialQuery);
      setSelectedType('all');
      setSearchResults([]);
      setCoverage(null);
      setIsOffline(false);
      setIsLoading(false);
      setError(null);
      setTotalCount(0);
      setOffset(0);
      requestGenRef.current++;
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
      }
    }
  }, [visible, initialQuery, workspaceId]);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    setOffset(0);
    setError(null);
    if (onQueryChange) onQueryChange(text);
  };

  const handleTypeSelect = (type: SearchItemType) => {
    setSelectedType(type);
    setOffset(0);
    setError(null);
  };

  // Perform search query with debounce
  useEffect(() => {
    if (!visible) return;

    const trimmed = query.trim();
    if (!trimmed && selectedType === 'all') {
      setSearchResults([]);
      setCoverage(null);
      setIsLoading(false);
      setError(null);
      setTotalCount(0);
      return;
    }

    if (!workspaceId) {
      setSearchResults([]);
      setIsLoading(false);
      return;
    }

    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    const abortController = new AbortController();
    searchAbortRef.current = abortController;

    const currentGen = ++requestGenRef.current;

    const timer = setTimeout(async () => {
      setIsLoading(true);
      setError(null);
      const types = selectedType !== 'all' ? [selectedType] : undefined;

      try {
        if (apiClient) {
          const res = await apiClient.searchWorkspace(
            workspaceId,
            {
              q: trimmed,
              types,
              limit,
              offset,
            },
            { signal: abortController.signal }
          );

          if (abortController.signal.aborted || currentGen !== requestGenRef.current) return;

          setSearchResults(res.data);
          setCoverage(res.meta.coverage);
          setTotalCount(res.meta.totalCount);
          setIsOffline(false);
          setIsLoading(false);
        } else if (localRepository) {
          // Pure local offline search
          const [headers, notes, tasks, journals, files] = await Promise.all([
            localRepository.listItemHeaders(workspaceId),
            localRepository.listNotes(workspaceId),
            localRepository.listTasks(workspaceId),
            localRepository.listJournalEntries(workspaceId),
            localRepository.listFiles(workspaceId),
          ]);

          if (abortController.signal.aborted || currentGen !== requestGenRef.current) return;

          const localRes = searchDownloadedRecords({
            workspaceId,
            query: { q: trimmed, types, limit, offset },
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
          setTotalCount(localRes.totalCount);
          setIsOffline(true);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (abortController.signal.aborted || currentGen !== requestGenRef.current) return;

        const errObj = err as { statusCode?: number; code?: string; message?: string };
        const status = errObj.statusCode ?? 0;

        // Classify errors: Auth/Forbidden vs Validation vs Server vs Network
        if (status === 401 || status === 403) {
          setError('Authorization failed: you do not have permission to search this workspace.');
          setSearchResults([]);
          setTotalCount(0);
          setCoverage(null);
          setIsLoading(false);
          return;
        }

        if (status === 400) {
          setError('Invalid search query or parameters.');
          setSearchResults([]);
          setTotalCount(0);
          setCoverage(null);
          setIsLoading(false);
          return;
        }

        if (status >= 500) {
          setError('Server encountered an error while searching. Please retry.');
          setSearchResults([]);
          setTotalCount(0);
          setCoverage(null);
          setIsLoading(false);
          return;
        }

        // Network failed (status 0 / NETWORK_ERROR) -> fallback to local repository
        if (localRepository && workspaceId) {
          try {
            const [headers, notes, tasks, journals, files] = await Promise.all([
              localRepository.listItemHeaders(workspaceId),
              localRepository.listNotes(workspaceId),
              localRepository.listTasks(workspaceId),
              localRepository.listJournalEntries(workspaceId),
              localRepository.listFiles(workspaceId),
            ]);

            if (abortController.signal.aborted || currentGen !== requestGenRef.current) return;

            const localRes = searchDownloadedRecords({
              workspaceId,
              query: { q: trimmed, types, limit, offset },
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
            setTotalCount(localRes.totalCount);
            setIsOffline(true);
          } catch {
            if (currentGen === requestGenRef.current) {
              setSearchResults([]);
              setCoverage('offline_limited');
              setTotalCount(0);
              setError('Unable to search offline records.');
            }
          }
        } else {
          setSearchResults([]);
          setError('Network disconnected and offline storage unavailable.');
        }
        setIsLoading(false);
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      abortController.abort();
    };
  }, [query, selectedType, offset, workspaceId, apiClient, localRepository, visible]);

  const activeResults = searchResults;

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
                onPress={() => handleTypeSelect(opt.id)}
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

        {error && (
          <View
            style={[
              styles.errorBanner,
              { backgroundColor: palette.status.dangerBg, borderColor: palette.status.dangerBorder },
            ]}
          >
            <Text style={[styles.errorText, { color: palette.status.danger }]}>{error}</Text>
          </View>
        )}

        {isOffline && !error && (
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
                ? `Search Results (${totalCount || activeResults.length})${coverage === 'offline_limited' ? ' (Offline)' : ''}`
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

              {activeResults.length === 0 && !error && (
                <View style={styles.emptyResults}>
                  <Text style={[styles.emptyText, { color: palette.text.muted }]}>
                    No matching items found for "{query}".
                  </Text>
                </View>
              )}

              {/* Pagination controls when totalCount exceeds limit */}
              {totalCount > limit && (
                <View style={styles.paginationRow}>
                  <TouchableOpacity
                    disabled={offset === 0}
                    onPress={() => setOffset(Math.max(0, offset - limit))}
                    style={[
                      styles.pageBtn,
                      {
                        backgroundColor: offset === 0 ? palette.surfaceRaised : palette.action.subtle,
                        borderColor: palette.border.subtle,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Previous search results page"
                  >
                    <Text
                      style={{
                        color: offset === 0 ? palette.text.muted : palette.text.primary,
                        fontSize: 12,
                      }}
                    >
                      Previous
                    </Text>
                  </TouchableOpacity>

                  <Text style={{ fontSize: 12, color: palette.text.secondary }}>
                    Page {Math.floor(offset / limit) + 1} of {Math.ceil(totalCount / limit)}
                  </Text>

                  <TouchableOpacity
                    disabled={offset + limit >= totalCount}
                    onPress={() => setOffset(offset + limit)}
                    style={[
                      styles.pageBtn,
                      {
                        backgroundColor:
                          offset + limit >= totalCount
                            ? palette.surfaceRaised
                            : palette.action.subtle,
                        borderColor: palette.border.subtle,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Next search results page"
                  >
                    <Text
                      style={{
                        color:
                          offset + limit >= totalCount ? palette.text.muted : palette.text.primary,
                        fontSize: 12,
                      }}
                    >
                      Next
                    </Text>
                  </TouchableOpacity>
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
  errorBanner: {
    padding: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    marginTop: spacing.xs,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '500',
  },
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  pageBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
});
