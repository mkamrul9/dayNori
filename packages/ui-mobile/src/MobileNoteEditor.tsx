import { Icon } from './Icon.js';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import { keyboardAvoidingBehavior } from './androidInsets.js';
import {
  type NoteDocument,
  type NoteBlockNode,
  type NoteListItemNode,
  type NoteChecklistItemNode,
  type NoteInlineNode,
  extractPlainText,
  extractInlineText,
  resolveNoteTitle,
  calculateCharCount,
  calculateWordCount,
  generateUuid,
  createRecoverableNoteDocument,
  replaceTextInRangeInlines,
  applyMarkToInlines,
  resolveLocalPersistenceLabel,
  resolveCloudPersistenceLabel,
} from '@daynori/domain';

export interface MobileNoteEditorProps {
  initialTitle?: string;
  initialDocument?: NoteDocument;
  initialFolderId?: string | null;
  folders?: Array<{ id: string; name: string }>;
  themeMode?: ThemeMode;
  readOnly?: boolean;
  localSaveStatus?: string;
  cloudSyncStatus?: string;
  conflict?: {
    serverRevision: number;
    serverTitle?: string;
    serverDocument?: NoteDocument;
  } | null;
  onSave?: (note: {
    title: string;
    document: NoteDocument;
    plainText: string;
    folderId?: string | null;
  }) => void | Promise<void>;
  onResolveConflict?: (
    resolution: 'keep_server' | 'keep_local' | 'save_copy'
  ) => void | Promise<void>;
  onClose?: () => void;
  onDelete?: () => void;
  testID?: string;
}

/**
 * Computes the replacement slice between prevText and newText based on selection or longest common prefix/suffix.
 */
function computeTextDiff(
  prevText: string,
  newText: string,
  sel?: { start: number; end: number }
): { start: number; end: number; replacement: string } {
  if (sel && sel.start <= sel.end && sel.end <= prevText.length) {
    const charsAdded = newText.length - (prevText.length - (sel.end - sel.start));
    if (charsAdded >= 0) {
      const inserted = newText.slice(sel.start, sel.start + charsAdded);
      if (
        prevText.slice(0, sel.start) === newText.slice(0, sel.start) &&
        prevText.slice(sel.end) === newText.slice(sel.start + charsAdded)
      ) {
        return { start: sel.start, end: sel.end, replacement: inserted };
      }
    }
  }

  // Fallback: longest common prefix and suffix
  let prefixLen = 0;
  while (
    prefixLen < prevText.length &&
    prefixLen < newText.length &&
    prevText[prefixLen] === newText[prefixLen]
  ) {
    prefixLen++;
  }

  let suffixLen = 0;
  while (
    suffixLen < prevText.length - prefixLen &&
    suffixLen < newText.length - prefixLen &&
    prevText[prevText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const start = prefixLen;
  const end = prevText.length - suffixLen;
  const replacement = newText.slice(prefixLen, newText.length - suffixLen);
  return { start, end, replacement };
}

export const MobileNoteEditor: React.FC<MobileNoteEditorProps> = ({
  initialTitle = '',
  initialDocument,
  initialFolderId = null,
  folders = [],
  themeMode = 'light',
  readOnly = false,
  localSaveStatus = 'Saved on this device',
  cloudSyncStatus = 'Synchronized',
  conflict = null,
  onSave,
  onResolveConflict,
  onClose,
  onDelete,
  testID = 'mobile-note-editor',
}) => {
  const palette = colors[themeMode];

  const [title, setTitle] = useState(initialTitle);
  const [folderId, setFolderId] = useState<string | null>(initialFolderId);
  const [isFolderPickerVisible, setFolderPickerVisible] = useState(false);

  // Recoverable initial document fallback
  const initialDocResolved = useMemo<NoteDocument>(() => {
    if (initialDocument) {
      const { doc } = createRecoverableNoteDocument(initialDocument);
      if (doc.content.length > 0) {
        return doc;
      }
    }
    return {
      version: 1,
      type: 'doc',
      content: [
        {
          id: generateUuid(),
          type: 'paragraph',
          content: [{ type: 'text', text: '' }],
        },
      ],
    };
  }, [initialDocument]);

  const [doc, setDoc] = useState<NoteDocument>(initialDocResolved);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);

  // Track selection per block
  const selectionMapRef = useRef<Map<string, { start: number; end: number }>>(new Map());

  // Undo / Redo stacks
  const [undoStack, setUndoStack] = useState<NoteDocument[]>([]);
  const [redoStack, setRedoStack] = useState<NoteDocument[]>([]);

  const isComposingRef = useRef(false);

  // Metrics
  const plainText = useMemo(() => extractPlainText(doc), [doc]);
  const wordCount = useMemo(() => calculateWordCount(plainText), [plainText]);
  const charCount = useMemo(() => calculateCharCount(plainText), [plainText]);

  // Reliable Save Lifecycle
  const editGenerationRef = useRef(0);
  const lastSavedGenerationRef = useRef(0);
  const isSavingRef = useRef(false);
  const hasPendingSaveRef = useRef(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirtyEpoch, setDirtyEpoch] = useState(0);
  const markDirty = useCallback(() => {
    editGenerationRef.current += 1;
    setDirtyEpoch((n) => n + 1);
    setSaveError(null);
  }, []);

  const displayLocalSaveStatus = useMemo(
    () =>
      resolveLocalPersistenceLabel({
        dirty: editGenerationRef.current > lastSavedGenerationRef.current,
        failed: Boolean(saveError),
        raw: localSaveStatus,
      }),
    [dirtyEpoch, saveError, localSaveStatus]
  );
  const displayCloudSyncStatus = useMemo(
    () => resolveCloudPersistenceLabel(cloudSyncStatus),
    [cloudSyncStatus]
  );

  const latestSnapshotRef = useRef({ title, doc, folderId, plainText });
  latestSnapshotRef.current = { title, doc, folderId, plainText };

  const latestOnSaveRef = useRef(onSave);
  latestOnSaveRef.current = onSave;

  const mutateDoc = useCallback(
    (updater: (prev: NoteDocument) => NoteDocument) => {
      setDoc((prev: NoteDocument) => {
        const next = updater(prev);
        setUndoStack((u) => [...u.slice(-30), prev]);
        setRedoStack([]);
        return next;
      });
      markDirty();
    },
    [markDirty]
  );

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    if (!prev) return;
    setUndoStack((u) => u.slice(0, -1));
    setRedoStack((r) => [...r, doc]);
    setDoc(prev);
    markDirty();
  }, [undoStack, doc, markDirty]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    if (!next) return;
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((u) => [...u, doc]);
    setDoc(next);
    markDirty();
  }, [redoStack, doc, markDirty]);

  // Serialized durable save executor
  const performSave = useCallback(async () => {
    if (readOnly) return;
    if (isComposingRef.current) return;

    const currentGen = editGenerationRef.current;
    if (currentGen <= lastSavedGenerationRef.current) return;

    if (isSavingRef.current) {
      hasPendingSaveRef.current = true;
      return;
    }

    const saveFn = latestOnSaveRef.current;
    if (!saveFn) return;

    isSavingRef.current = true;
    const snapshot = latestSnapshotRef.current;
    const cleanTitle = resolveNoteTitle(snapshot.title, 'Untitled', snapshot.plainText);

    try {
      await saveFn({
        title: cleanTitle,
        document: snapshot.doc,
        plainText: snapshot.plainText,
        folderId: snapshot.folderId,
      });

      lastSavedGenerationRef.current = currentGen;
      setSaveError(null);
      setDirtyEpoch((n) => n + 1);
    } catch {
      setSaveError('Save failed. Your edits remain stored in local memory.');
    } finally {
      isSavingRef.current = false;
      if (hasPendingSaveRef.current) {
        hasPendingSaveRef.current = false;
        void performSave();
      }
    }
  }, [readOnly]);

  // Debounced autosave (600ms)
  const debouncedSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (readOnly) return;
    if (debouncedSaveRef.current) {
      clearTimeout(debouncedSaveRef.current);
    }
    debouncedSaveRef.current = setTimeout(() => {
      void performSave();
    }, 600);

    return () => {
      if (debouncedSaveRef.current) {
        clearTimeout(debouncedSaveRef.current);
      }
    };
  }, [title, doc, folderId, performSave, readOnly]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (editGenerationRef.current > lastSavedGenerationRef.current) {
        const snap = latestSnapshotRef.current;
        const saveFn = latestOnSaveRef.current;
        if (saveFn) {
          const cleanTitle = resolveNoteTitle(snap.title, 'Untitled', snap.plainText);
          void saveFn({
            title: cleanTitle,
            document: snap.doc,
            plainText: snap.plainText,
            folderId: snap.folderId,
          });
        }
      }
    };
  }, []);

  // Block inline text editing preserving all existing runs and marks
  const updateBlockText = (blockId: string, newText: string) => {
    if (readOnly) return;
    editGenerationRef.current += 1;
    setSaveError(null);

    setDoc((prev: NoteDocument) => {
      const newContent: NoteBlockNode[] = prev.content.map((b: NoteBlockNode): NoteBlockNode => {
        if (b.id !== blockId) {
          if (b.type === 'bullet_list') {
            const updatedItems: NoteListItemNode[] = b.items.map((it: NoteListItemNode) => {
              if (it.id === blockId) {
                const prevText = extractInlineText(it.content);
                const sel = selectionMapRef.current.get(blockId);
                const diff = computeTextDiff(prevText, newText, sel);
                const updated = replaceTextInRangeInlines(
                  it.content,
                  diff.start,
                  diff.end,
                  diff.replacement
                );
                return { ...it, content: updated };
              }
              return it;
            });
            return { ...b, items: updatedItems };
          }
          if (b.type === 'ordered_list') {
            const updatedItems: NoteListItemNode[] = b.items.map((it: NoteListItemNode) => {
              if (it.id === blockId) {
                const prevText = extractInlineText(it.content);
                const sel = selectionMapRef.current.get(blockId);
                const diff = computeTextDiff(prevText, newText, sel);
                const updated = replaceTextInRangeInlines(
                  it.content,
                  diff.start,
                  diff.end,
                  diff.replacement
                );
                return { ...it, content: updated };
              }
              return it;
            });
            return { ...b, items: updatedItems };
          }
          if (b.type === 'checklist') {
            const updatedItems: NoteChecklistItemNode[] = b.items.map(
              (it: NoteChecklistItemNode) => {
                if (it.id === blockId) {
                  const prevText = extractInlineText(it.content);
                  const sel = selectionMapRef.current.get(blockId);
                  const diff = computeTextDiff(prevText, newText, sel);
                  const updated = replaceTextInRangeInlines(
                    it.content,
                    diff.start,
                    diff.end,
                    diff.replacement
                  );
                  return { ...it, content: updated };
                }
                return it;
              }
            );
            return { ...b, items: updatedItems };
          }
          return b;
        }

        if (b.type === 'paragraph' || b.type === 'heading') {
          const prevText = extractInlineText(b.content);
          const sel = selectionMapRef.current.get(blockId);
          const diff = computeTextDiff(prevText, newText, sel);
          const updated = replaceTextInRangeInlines(
            b.content || [],
            diff.start,
            diff.end,
            diff.replacement
          );
          return {
            ...b,
            content: updated,
          };
        }
        return b;
      });
      return { ...prev, content: newContent };
    });
  };

  const toggleChecklistItem = (blockId: string, checked: boolean) => {
    if (readOnly) return;
    mutateDoc((prev: NoteDocument) => {
      const newContent: NoteBlockNode[] = prev.content.map((b: NoteBlockNode): NoteBlockNode => {
        if (b.type === 'checklist') {
          const updatedItems: NoteChecklistItemNode[] = b.items.map((it: NoteChecklistItemNode) =>
            it.id === blockId ? { ...it, checked } : it
          );
          return { ...b, items: updatedItems };
        }
        return b;
      });
      return { ...prev, content: newContent };
    });
  };

  const toggleBlockBold = () => {
    if (readOnly || !activeBlockId) return;

    mutateDoc((prev: NoteDocument) => {
      const newContent: NoteBlockNode[] = prev.content.map((b: NoteBlockNode): NoteBlockNode => {
        const sel = selectionMapRef.current.get(activeBlockId);

        if (b.id === activeBlockId && (b.type === 'paragraph' || b.type === 'heading')) {
          const currentInlines = b.content || [];
          const textLen = extractInlineText(currentInlines).length;
          const start = sel && sel.start < sel.end ? sel.start : 0;
          const end = sel && sel.start < sel.end ? sel.end : textLen;
          const updated = applyMarkToInlines(currentInlines, start, end, 'bold');
          return { ...b, content: updated };
        }

        if (b.type === 'bullet_list') {
          return {
            ...b,
            items: b.items.map((it: NoteListItemNode) => {
              if (it.id === activeBlockId) {
                const textLen = extractInlineText(it.content).length;
                const start = sel && sel.start < sel.end ? sel.start : 0;
                const end = sel && sel.start < sel.end ? sel.end : textLen;
                return { ...it, content: applyMarkToInlines(it.content, start, end, 'bold') };
              }
              return it;
            }),
          };
        }

        if (b.type === 'ordered_list') {
          return {
            ...b,
            items: b.items.map((it: NoteListItemNode) => {
              if (it.id === activeBlockId) {
                const textLen = extractInlineText(it.content).length;
                const start = sel && sel.start < sel.end ? sel.start : 0;
                const end = sel && sel.start < sel.end ? sel.end : textLen;
                return { ...it, content: applyMarkToInlines(it.content, start, end, 'bold') };
              }
              return it;
            }),
          };
        }

        if (b.type === 'checklist') {
          return {
            ...b,
            items: b.items.map((it: NoteChecklistItemNode) => {
              if (it.id === activeBlockId) {
                const textLen = extractInlineText(it.content).length;
                const start = sel && sel.start < sel.end ? sel.start : 0;
                const end = sel && sel.start < sel.end ? sel.end : textLen;
                return { ...it, content: applyMarkToInlines(it.content, start, end, 'bold') };
              }
              return it;
            }),
          };
        }

        return b;
      });
      return { ...prev, content: newContent };
    });
  };

  const setBlockType = (
    type: 'paragraph' | 'h1' | 'h2' | 'h3' | 'bullet' | 'ordered' | 'checklist'
  ) => {
    if (readOnly || !activeBlockId) return;

    mutateDoc((prev: NoteDocument) => {
      let currentInlines: NoteInlineNode[] = [{ type: 'text', text: '' }];
      for (const b of prev.content) {
        if (b.id === activeBlockId && (b.type === 'paragraph' || b.type === 'heading')) {
          currentInlines = b.content || [{ type: 'text', text: '' }];
          break;
        }
        if (b.type === 'bullet_list' || b.type === 'ordered_list' || b.type === 'checklist') {
          const found = b.items.find(
            (it: NoteListItemNode | NoteChecklistItemNode) => it.id === activeBlockId
          );
          if (found) {
            currentInlines = found.content || [{ type: 'text', text: '' }];
            break;
          }
        }
      }

      const newContent: NoteBlockNode[] = [];
      for (const b of prev.content) {
        const containsActive =
          b.id === activeBlockId ||
          ((b.type === 'bullet_list' || b.type === 'ordered_list' || b.type === 'checklist') &&
            b.items.some(
              (it: NoteListItemNode | NoteChecklistItemNode) => it.id === activeBlockId
            ));

        if (!containsActive) {
          newContent.push(b);
          continue;
        }

        if (type === 'paragraph') {
          newContent.push({
            id: activeBlockId,
            type: 'paragraph',
            content: currentInlines,
          });
        } else if (type === 'h1' || type === 'h2' || type === 'h3') {
          const level = type === 'h1' ? 1 : type === 'h2' ? 2 : 3;
          newContent.push({
            id: activeBlockId,
            type: 'heading',
            level,
            content: currentInlines,
          });
        } else if (type === 'bullet') {
          newContent.push({
            id: generateUuid(),
            type: 'bullet_list',
            items: [
              {
                id: activeBlockId,
                type: 'list_item',
                content: currentInlines,
              },
            ],
          });
        } else if (type === 'ordered') {
          newContent.push({
            id: generateUuid(),
            type: 'ordered_list',
            items: [
              {
                id: activeBlockId,
                type: 'list_item',
                content: currentInlines,
              },
            ],
          });
        } else if (type === 'checklist') {
          newContent.push({
            id: generateUuid(),
            type: 'checklist',
            items: [
              {
                id: activeBlockId,
                type: 'checklist_item',
                checked: false,
                content: currentInlines,
              },
            ],
          });
        }
      }

      return { ...prev, content: newContent };
    });
  };

  const handleAddBlockBelow = (blockId: string) => {
    const newId = generateUuid();
    mutateDoc((prev: NoteDocument) => {
      const newContent: NoteBlockNode[] = [];
      for (const b of prev.content) {
        if (b.type === 'bullet_list' && b.items.some((it) => it.id === blockId)) {
          const newItems = [];
          for (const it of b.items) {
            newItems.push(it);
            if (it.id === blockId) {
              newItems.push({
                id: newId,
                type: 'list_item' as const,
                content: [{ type: 'text' as const, text: '' }],
              });
            }
          }
          newContent.push({ ...b, items: newItems });
          continue;
        }
        if (b.type === 'ordered_list' && b.items.some((it) => it.id === blockId)) {
          const newItems = [];
          for (const it of b.items) {
            newItems.push(it);
            if (it.id === blockId) {
              newItems.push({
                id: newId,
                type: 'list_item' as const,
                content: [{ type: 'text' as const, text: '' }],
              });
            }
          }
          newContent.push({ ...b, items: newItems });
          continue;
        }
        if (b.type === 'checklist' && b.items.some((it) => it.id === blockId)) {
          const newItems = [];
          for (const it of b.items) {
            newItems.push(it);
            if (it.id === blockId) {
              newItems.push({
                id: newId,
                type: 'checklist_item' as const,
                checked: false,
                content: [{ type: 'text' as const, text: '' }],
              });
            }
          }
          newContent.push({ ...b, items: newItems });
          continue;
        }

        newContent.push(b);
        if (b.id === blockId) {
          newContent.push({
            id: newId,
            type: 'paragraph',
            content: [{ type: 'text', text: '' }],
          });
        }
      }
      return { ...prev, content: newContent };
    });
    setActiveBlockId(newId);
  };

  const currentFolderName = useMemo(() => {
    if (!folderId) return 'Inbox (Unfiled)';
    const found = folders.find((f) => f.id === folderId);
    return found ? found.name : 'Folder';
  }, [folderId, folders]);

  return (
    <KeyboardAvoidingView
      testID={testID}
      behavior={keyboardAvoidingBehavior()}
      style={[styles.container, { backgroundColor: palette.surface }]}
    >
      {/* Header and status indicators */}
      <View style={[styles.header, { borderBottomColor: palette.border.subtle }]}>
        <View style={styles.headerLeft}>
          <Text
            accessibilityLabel={`Status: ${displayLocalSaveStatus}, ${displayCloudSyncStatus}`}
            style={[styles.headerStatusText, { color: palette.text.secondary }]}
          >
            <Icon name="save" color={palette.text.secondary} /> {displayLocalSaveStatus} •{' '}
            <Icon name="cloud" color={palette.text.secondary} /> {displayCloudSyncStatus}
          </Text>
          <Text style={[styles.headerMetricsText, { color: palette.text.muted }]}>
            {wordCount} words • {charCount} chars
          </Text>
        </View>

        <View style={styles.headerActions}>
          {/* Folder Selector Trigger Button */}
          {folders.length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Select folder, currently ${currentFolderName}`}
              testID="mobile-folder-selector-btn"
              onPress={() => setFolderPickerVisible(true)}
              disabled={readOnly}
              style={[styles.actionBtn, { backgroundColor: palette.surfaceRaised }]}
            >
              <Text style={[styles.actionBtnText, { color: palette.text.primary }]}>
                <Icon name="folder" color={palette.text.primary} /> {currentFolderName}
              </Text>
            </Pressable>
          )}

          {onDelete && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete note"
              testID="mobile-editor-delete-btn"
              onPress={onDelete}
              style={[styles.actionBtn, { backgroundColor: palette.status.dangerBg }]}
            >
              <Text style={[styles.actionBtnText, { color: palette.status.danger }]}>Trash</Text>
            </Pressable>
          )}

          {onClose && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Done editing"
              testID="mobile-editor-close-btn"
              onPress={onClose}
              style={[styles.actionBtn, { backgroundColor: palette.action.primary }]}
            >
              <Text style={[styles.actionBtnText, { color: palette.text.inverse }]}>Done</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Save Error Recovery Notification */}
      {saveError && (
        <View
          style={[
            styles.saveErrorBanner,
            {
              backgroundColor: palette.status.dangerBg,
              borderColor: palette.status.dangerBorder,
            },
          ]}
        >
          <Text style={[styles.saveErrorText, { color: palette.status.danger }]}>{saveError}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry save"
            testID="mobile-retry-save-btn"
            onPress={() => void performSave()}
            style={[styles.retryBtn, { borderColor: palette.status.dangerBorder }]}
          >
            <Text style={[styles.retryBtnText, { color: palette.status.danger }]}>Retry</Text>
          </Pressable>
        </View>
      )}

      {/* Folder Picker Modal Sheet */}
      <Modal
        visible={isFolderPickerVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setFolderPickerVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setFolderPickerVisible(false)}>
          <View style={[styles.modalSheet, { backgroundColor: palette.surfaceRaised }]}>
            <Text style={[styles.modalTitle, { color: palette.text.primary }]}>Select Folder</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              <Pressable
                accessibilityRole="button"
                testID="folder-option-inbox"
                style={[
                  styles.folderOption,
                  folderId === null && { backgroundColor: palette.action.subtle },
                ]}
                onPress={() => {
                  setFolderId(null);
                  editGenerationRef.current += 1;
                  setFolderPickerVisible(false);
                }}
              >
                <Text style={[styles.folderOptionText, { color: palette.text.primary }]}>
                  <Icon name="folder" color={palette.text.primary} /> Inbox (Unfiled)
                </Text>
              </Pressable>
              {folders.map((f) => (
                <Pressable
                  key={f.id}
                  accessibilityRole="button"
                  testID={`folder-option-${f.id}`}
                  style={[
                    styles.folderOption,
                    folderId === f.id && { backgroundColor: palette.action.subtle },
                  ]}
                  onPress={() => {
                    setFolderId(f.id);
                    editGenerationRef.current += 1;
                    setFolderPickerVisible(false);
                  }}
                >
                  <Text style={[styles.folderOptionText, { color: palette.text.primary }]}>
                    <Icon name="folder" color={palette.text.primary} /> {f.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Conflict recovery modal banner */}
      {conflict && (
        <View
          testID="conflict-banner"
          style={[
            styles.conflictBanner,
            {
              backgroundColor: palette.status.warningBg,
              borderColor: palette.status.warningBorder,
            },
          ]}
        >
          <Text style={[styles.conflictTitle, { color: palette.status.warning }]}>
            <Icon name="warning" color={palette.status.warning} /> Sync Conflict (Server Rev{' '}
            {conflict.serverRevision})
          </Text>
          <Text style={[styles.conflictSubtitle, { color: palette.text.primary }]}>
            Choose how to resolve concurrent changes:
          </Text>
          <View style={styles.conflictActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Keep server version"
              testID="resolve-keep-server"
              style={[styles.conflictBtn, { backgroundColor: palette.surface }]}
              onPress={() => onResolveConflict && onResolveConflict('keep_server')}
            >
              <Text style={[styles.conflictBtnText, { color: palette.text.primary }]}>
                Keep Server
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Keep local version"
              testID="resolve-keep-local"
              style={[styles.conflictBtn, { backgroundColor: palette.surface }]}
              onPress={() => onResolveConflict && onResolveConflict('keep_local')}
            >
              <Text style={[styles.conflictBtnText, { color: palette.text.primary }]}>
                Keep Local
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save as copy"
              testID="resolve-save-copy"
              style={[styles.conflictBtn, { backgroundColor: palette.action.primary }]}
              onPress={() => onResolveConflict && onResolveConflict('save_copy')}
            >
              <Text style={[styles.conflictBtnText, { color: palette.text.inverse }]}>
                Save Copy
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* 48dp Minimum Touch Target Formatting Toolbar */}
      <View style={[styles.toolbar, { borderBottomColor: palette.border.subtle }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Paragraph format"
            testID="mobile-format-paragraph"
            onPress={() => setBlockType('paragraph')}
            style={styles.toolBtn}
          >
            <Text style={[styles.toolBtnText, { color: palette.text.primary }]}>¶</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Heading 1 format"
            testID="mobile-format-h1"
            onPress={() => setBlockType('h1')}
            style={styles.toolBtn}
          >
            <Text style={[styles.toolBtnText, { color: palette.text.primary, fontWeight: 'bold' }]}>
              H1
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Heading 2 format"
            testID="mobile-format-h2"
            onPress={() => setBlockType('h2')}
            style={styles.toolBtn}
          >
            <Text style={[styles.toolBtnText, { color: palette.text.primary, fontWeight: 'bold' }]}>
              H2
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Heading 3 format"
            testID="mobile-format-h3"
            onPress={() => setBlockType('h3')}
            style={styles.toolBtn}
          >
            <Text style={[styles.toolBtnText, { color: palette.text.primary, fontWeight: 'bold' }]}>
              H3
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Toggle bold"
            testID="mobile-format-bold"
            onPress={toggleBlockBold}
            style={styles.toolBtn}
          >
            <Text style={[styles.toolBtnText, { color: palette.text.primary, fontWeight: 'bold' }]}>
              B
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Bullet list format"
            testID="mobile-format-bullet"
            onPress={() => setBlockType('bullet')}
            style={styles.toolBtn}
          >
            <Text style={[styles.toolBtnText, { color: palette.text.primary }]}>• List</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ordered list format"
            testID="mobile-format-ordered"
            onPress={() => setBlockType('ordered')}
            style={styles.toolBtn}
          >
            <Text style={[styles.toolBtnText, { color: palette.text.primary }]}>1. List</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Checklist format"
            testID="mobile-format-checklist"
            onPress={() => setBlockType('checklist')}
            style={styles.toolBtn}
          >
            <Text style={[styles.toolBtnText, { color: palette.text.primary }]}>
              <Icon name="check-square" color={palette.text.primary} /> Check
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Undo"
            testID="mobile-editor-undo"
            disabled={undoStack.length === 0}
            onPress={handleUndo}
            style={[styles.toolBtn, undoStack.length === 0 && { opacity: 0.4 }]}
          >
            <Text style={[styles.toolBtnText, { color: palette.text.primary }]}>
              <Icon name="undo" color={palette.text.primary} />
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Redo"
            testID="mobile-editor-redo"
            disabled={redoStack.length === 0}
            onPress={handleRedo}
            style={[styles.toolBtn, redoStack.length === 0 && { opacity: 0.4 }]}
          >
            <Text style={[styles.toolBtnText, { color: palette.text.primary }]}>
              <Icon name="redo" color={palette.text.primary} />
            </Text>
          </Pressable>
        </ScrollView>
      </View>

      {/* Editor Canvas */}
      <ScrollView contentContainerStyle={styles.canvas}>
        <TextInput
          accessibilityLabel="Note title"
          placeholder="Untitled note..."
          placeholderTextColor={palette.text.muted}
          value={title}
          onChangeText={(val) => {
            setTitle(val);
            editGenerationRef.current += 1;
            setSaveError(null);
          }}
          editable={!readOnly}
          style={[styles.titleInput, { color: palette.text.primary }]}
        />

        <View style={styles.blocksContainer}>
          {doc.content.map((block: NoteBlockNode) => {
            switch (block.type) {
              case 'paragraph': {
                const blockId = block.id || 'p-0';
                const text = extractInlineText(block.content);
                return (
                  <View key={blockId} style={styles.blockRow}>
                    <TextInput
                      multiline={true}
                      scrollEnabled={false}
                      accessibilityLabel="Paragraph block"
                      testID={`mobile-block-paragraph-${blockId}`}
                      placeholder="Type a thought..."
                      placeholderTextColor={palette.text.muted}
                      value={text}
                      onFocus={() => setActiveBlockId(blockId)}
                      onSelectionChange={(e) => {
                        selectionMapRef.current.set(blockId, e.nativeEvent.selection);
                      }}
                      onChangeText={(val) => updateBlockText(blockId, val)}
                      onSubmitEditing={() => handleAddBlockBelow(blockId)}
                      editable={!readOnly}
                      style={[styles.paragraphInput, { color: palette.text.primary }]}
                    />
                  </View>
                );
              }
              case 'heading': {
                const blockId = block.id || 'h-0';
                const text = extractInlineText(block.content);
                const fontSize = block.level === 1 ? 26 : block.level === 2 ? 22 : 18;
                return (
                  <View key={blockId} style={styles.blockRow}>
                    <TextInput
                      multiline={true}
                      scrollEnabled={false}
                      accessibilityLabel={`Heading ${block.level} block`}
                      testID={`mobile-block-heading-${blockId}`}
                      placeholder={`Heading ${block.level}...`}
                      placeholderTextColor={palette.text.muted}
                      value={text}
                      onFocus={() => setActiveBlockId(blockId)}
                      onSelectionChange={(e) => {
                        selectionMapRef.current.set(blockId, e.nativeEvent.selection);
                      }}
                      onChangeText={(val) => updateBlockText(blockId, val)}
                      onSubmitEditing={() => handleAddBlockBelow(blockId)}
                      editable={!readOnly}
                      style={[
                        styles.headingInput,
                        { fontSize, color: palette.text.primary, fontWeight: 'bold' },
                      ]}
                    />
                  </View>
                );
              }
              case 'bullet_list': {
                return (
                  <View key={block.id || 'bl-0'} style={styles.listContainer}>
                    {block.items.map((it: NoteListItemNode) => {
                      const itemId = it.id || 'bli-0';
                      const text = extractInlineText(it.content);
                      return (
                        <View key={itemId} style={styles.listItemRow}>
                          <Text style={[styles.bulletBullet, { color: palette.text.secondary }]}>
                            •
                          </Text>
                          <TextInput
                            multiline={true}
                            scrollEnabled={false}
                            accessibilityLabel="Bullet list item"
                            testID={`mobile-block-listitem-${itemId}`}
                            placeholder="List item..."
                            placeholderTextColor={palette.text.muted}
                            value={text}
                            onFocus={() => setActiveBlockId(itemId)}
                            onSelectionChange={(e) => {
                              selectionMapRef.current.set(itemId, e.nativeEvent.selection);
                            }}
                            onChangeText={(val) => updateBlockText(itemId, val)}
                            onSubmitEditing={() => handleAddBlockBelow(itemId)}
                            editable={!readOnly}
                            style={[styles.itemInput, { color: palette.text.primary }]}
                          />
                        </View>
                      );
                    })}
                  </View>
                );
              }
              case 'ordered_list': {
                return (
                  <View key={block.id || 'ol-0'} style={styles.listContainer}>
                    {block.items.map((it: NoteListItemNode, idx: number) => {
                      const itemId = it.id || 'oli-0';
                      const text = extractInlineText(it.content);
                      return (
                        <View key={itemId} style={styles.listItemRow}>
                          <Text style={[styles.bulletBullet, { color: palette.text.secondary }]}>
                            {idx + 1}.
                          </Text>
                          <TextInput
                            multiline={true}
                            scrollEnabled={false}
                            accessibilityLabel="Numbered list item"
                            testID={`mobile-block-ordereditem-${itemId}`}
                            placeholder="List item..."
                            placeholderTextColor={palette.text.muted}
                            value={text}
                            onFocus={() => setActiveBlockId(itemId)}
                            onSelectionChange={(e) => {
                              selectionMapRef.current.set(itemId, e.nativeEvent.selection);
                            }}
                            onChangeText={(val) => updateBlockText(itemId, val)}
                            onSubmitEditing={() => handleAddBlockBelow(itemId)}
                            editable={!readOnly}
                            style={[styles.itemInput, { color: palette.text.primary }]}
                          />
                        </View>
                      );
                    })}
                  </View>
                );
              }
              case 'checklist': {
                return (
                  <View key={block.id || 'cl-0'} style={styles.listContainer}>
                    {block.items.map((it: NoteChecklistItemNode) => {
                      const itemId = it.id || 'cli-0';
                      const text = extractInlineText(it.content);
                      return (
                        <View key={itemId} style={styles.checklistRow}>
                          <Pressable
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: it.checked }}
                            accessibilityLabel="Toggle checklist item"
                            testID={`mobile-checklist-toggle-${itemId}`}
                            onPress={() => toggleChecklistItem(itemId, !it.checked)}
                            style={[
                              styles.checkboxBox,
                              { borderColor: palette.border.subtle },
                              it.checked && { backgroundColor: palette.action.primary },
                            ]}
                          >
                            {it.checked && (
                              <Text style={styles.checkmark}>
                                <Icon name="check" color={palette.text.primary} />
                              </Text>
                            )}
                          </Pressable>
                          <TextInput
                            multiline={true}
                            scrollEnabled={false}
                            accessibilityLabel="Checklist item"
                            testID={`mobile-block-checklistitem-${itemId}`}
                            placeholder="Task..."
                            placeholderTextColor={palette.text.muted}
                            value={text}
                            onFocus={() => setActiveBlockId(itemId)}
                            onSelectionChange={(e) => {
                              selectionMapRef.current.set(itemId, e.nativeEvent.selection);
                            }}
                            onChangeText={(val) => updateBlockText(itemId, val)}
                            onSubmitEditing={() => handleAddBlockBelow(itemId)}
                            editable={!readOnly}
                            style={[
                              styles.itemInput,
                              {
                                color: it.checked ? palette.text.muted : palette.text.primary,
                                textDecorationLine: it.checked ? 'line-through' : 'none',
                              },
                            ]}
                          />
                        </View>
                      );
                    })}
                  </View>
                );
              }
              default:
                return null;
            }
          })}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flex: 1,
  },
  headerStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  headerMetricsText: {
    fontSize: 11,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.sm,
    minHeight: 48,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  saveErrorBanner: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  saveErrorText: {
    fontSize: 12,
    flex: 1,
  },
  retryBtn: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  retryBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    padding: spacing.md,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: spacing.sm,
  },
  folderOption: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.sm,
  },
  folderOptionText: {
    fontSize: 15,
  },
  conflictBanner: {
    margin: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  conflictTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  conflictSubtitle: {
    fontSize: 12,
    marginVertical: 4,
  },
  conflictActions: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: 4,
  },
  conflictBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.sm,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conflictBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  toolbar: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderBottomWidth: 1,
    flexDirection: 'row',
  },
  toolBtn: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    marginRight: 4,
  },
  toolBtnText: {
    fontSize: 14,
  },
  canvas: {
    padding: spacing.md,
  },
  titleInput: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: spacing.md,
    padding: 0,
  },
  blocksContainer: {
    gap: spacing.sm,
  },
  blockRow: {
    minHeight: 32,
  },
  paragraphInput: {
    fontSize: 16,
    lineHeight: 24,
    padding: 0,
  },
  headingInput: {
    padding: 0,
  },
  listContainer: {
    gap: spacing.xs,
  },
  listItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  bulletBullet: {
    fontSize: 16,
    lineHeight: 24,
    width: 20,
  },
  itemInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    padding: 0,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
