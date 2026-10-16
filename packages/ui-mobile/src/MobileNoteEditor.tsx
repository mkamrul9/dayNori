import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import {
  type NoteDocument,
  type NoteBlockNode,
  type NoteListItemNode,
  type NoteChecklistItemNode,
  type NoteTextInline,
  extractPlainText,
  resolveNoteTitle,
  calculateCharCount,
  calculateWordCount,
  generateUuid,
  validateNoteDocument,
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

export const MobileNoteEditor: React.FC<MobileNoteEditorProps> = ({
  initialTitle = '',
  initialDocument,
  initialFolderId = null,
  folders: _folders = [],
  themeMode = 'light',
  readOnly = false,
  localSaveStatus = 'Saved locally',
  cloudSyncStatus = 'Synced',
  conflict = null,
  onSave,
  onResolveConflict,
  onClose,
  onDelete,
  testID = 'mobile-note-editor',
}) => {
  const palette = colors[themeMode];

  const [title, setTitle] = useState(initialTitle);
  const [folderId, _setFolderId] = useState<string | null>(initialFolderId);

  const initialDocResolved = useMemo<NoteDocument>(() => {
    if (
      initialDocument &&
      Array.isArray(initialDocument.content) &&
      initialDocument.content.length > 0
    ) {
      try {
        return validateNoteDocument(initialDocument);
      } catch {
        // Fallback to minimal valid document
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

  // Undo / Redo stacks
  const [undoStack, setUndoStack] = useState<NoteDocument[]>([]);
  const [redoStack, setRedoStack] = useState<NoteDocument[]>([]);

  const isDirtyRef = useRef(false);
  const debouncedSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const plainText = useMemo(() => extractPlainText(doc), [doc]);
  const wordCount = useMemo(() => calculateWordCount(plainText), [plainText]);
  const charCount = useMemo(() => calculateCharCount(plainText), [plainText]);

  const triggerSave = useCallback(() => {
    if (onSave && isDirtyRef.current) {
      isDirtyRef.current = false;
      const cleanTitle = resolveNoteTitle(title, 'Untitled', plainText);
      void onSave({
        title: cleanTitle,
        document: doc,
        plainText,
        folderId: folderId ?? undefined,
      });
    }
  }, [title, doc, plainText, folderId, onSave]);

  // Debounced autosave (600ms)
  useEffect(() => {
    if (readOnly) return;
    if (debouncedSaveRef.current) {
      clearTimeout(debouncedSaveRef.current);
    }
    debouncedSaveRef.current = setTimeout(() => {
      triggerSave();
    }, 600);

    return () => {
      if (debouncedSaveRef.current) {
        clearTimeout(debouncedSaveRef.current);
      }
    };
  }, [title, doc, folderId, triggerSave, readOnly]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (isDirtyRef.current) {
        triggerSave();
      }
    };
  }, [triggerSave]);

  const mutateDoc = (updater: (prev: NoteDocument) => NoteDocument) => {
    setDoc((prev: NoteDocument) => {
      const next = updater(prev);
      setUndoStack((u) => [...u.slice(-20), prev]);
      setRedoStack([]);
      return next;
    });
    isDirtyRef.current = true;
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    if (!prev) return;
    setUndoStack((u) => u.slice(0, -1));
    setRedoStack((r) => [...r, doc]);
    setDoc(prev);
    isDirtyRef.current = true;
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    if (!next) return;
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((u) => [...u, doc]);
    setDoc(next);
    isDirtyRef.current = true;
  };

  const updateBlockText = (blockId: string, text: string) => {
    if (readOnly) return;
    isDirtyRef.current = true;
    setDoc((prev: NoteDocument) => {
      const newContent: NoteBlockNode[] = prev.content.map((b: NoteBlockNode): NoteBlockNode => {
        if (b.id !== blockId) {
          if (b.type === 'bullet_list' || b.type === 'ordered_list') {
            const updatedItems: NoteListItemNode[] = b.items.map((it: NoteListItemNode) =>
              it.id === blockId ? { ...it, content: [{ type: 'text' as const, text }] } : it
            );
            return { ...b, items: updatedItems };
          }
          if (b.type === 'checklist') {
            const updatedItems: NoteChecklistItemNode[] = b.items.map(
              (it: NoteChecklistItemNode) =>
                it.id === blockId ? { ...it, content: [{ type: 'text' as const, text }] } : it
            );
            return { ...b, items: updatedItems };
          }
          return b;
        }

        if (b.type === 'paragraph' || b.type === 'heading') {
          return {
            ...b,
            content: [{ type: 'text' as const, text }],
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

  const setBlockType = (
    type: 'paragraph' | 'h1' | 'h2' | 'h3' | 'bullet' | 'ordered' | 'checklist'
  ) => {
    if (readOnly || !activeBlockId) return;

    mutateDoc((prev: NoteDocument) => {
      let currentText = '';
      for (const b of prev.content) {
        if (b.id === activeBlockId && (b.type === 'paragraph' || b.type === 'heading')) {
          currentText = b.content?.[0]?.type === 'text' ? b.content[0].text : '';
          break;
        }
        if (b.type === 'bullet_list' || b.type === 'ordered_list') {
          const found = b.items.find((it: NoteListItemNode) => it.id === activeBlockId);
          if (found) {
            currentText = found.content?.[0]?.type === 'text' ? found.content[0].text : '';
            break;
          }
        }
        if (b.type === 'checklist') {
          const found = b.items.find((it: NoteChecklistItemNode) => it.id === activeBlockId);
          if (found) {
            currentText = found.content?.[0]?.type === 'text' ? found.content[0].text : '';
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
            content: [{ type: 'text', text: currentText }],
          });
        } else if (type === 'h1' || type === 'h2' || type === 'h3') {
          const level = type === 'h1' ? 1 : type === 'h2' ? 2 : 3;
          newContent.push({
            id: activeBlockId,
            type: 'heading',
            level,
            content: [{ type: 'text', text: currentText }],
          });
        } else if (type === 'bullet') {
          newContent.push({
            id: generateUuid(),
            type: 'bullet_list',
            items: [
              {
                id: activeBlockId,
                type: 'list_item',
                content: [{ type: 'text', text: currentText }],
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
                content: [{ type: 'text', text: currentText }],
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
                content: [{ type: 'text', text: currentText }],
              },
            ],
          });
        }
      }

      return { ...prev, content: newContent };
    });
  };

  const addBlock = () => {
    const newId = generateUuid();
    mutateDoc((prev: NoteDocument) => ({
      ...prev,
      content: [
        ...prev.content,
        {
          id: newId,
          type: 'paragraph',
          content: [{ type: 'text', text: '' }],
        },
      ],
    }));
    setActiveBlockId(newId);
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.surface }]} testID={testID}>
      {/* Conflict Resolution Banner */}
      {conflict && (
        <View
          style={[
            styles.conflictBanner,
            {
              backgroundColor: palette.status.warningBg,
              borderColor: palette.status.warningBorder,
            },
          ]}
          testID="mobile-conflict-banner"
          accessibilityRole="alert"
        >
          <Text style={[styles.conflictTitle, { color: palette.status.warning }]}>
            ⚠️ Sync Conflict: Another device edited this note (Server Rev {conflict.serverRevision})
          </Text>
          <View style={styles.conflictActions}>
            <Pressable
              style={[styles.conflictBtn, { backgroundColor: palette.surface }]}
              onPress={() => onResolveConflict && onResolveConflict('keep_server')}
              accessibilityRole="button"
              accessibilityLabel="Keep server version"
            >
              <Text style={{ color: palette.text.primary, fontSize: 12, fontWeight: '600' }}>
                Keep Server
              </Text>
            </Pressable>
            <Pressable
              style={[styles.conflictBtn, { backgroundColor: palette.surface }]}
              onPress={() => onResolveConflict && onResolveConflict('keep_local')}
              accessibilityRole="button"
              accessibilityLabel="Keep local version"
            >
              <Text style={{ color: palette.text.primary, fontSize: 12, fontWeight: '600' }}>
                Keep Local
              </Text>
            </Pressable>
            <Pressable
              style={[styles.conflictBtn, { backgroundColor: palette.action.primary }]}
              onPress={() => onResolveConflict && onResolveConflict('save_copy')}
              accessibilityRole="button"
              accessibilityLabel="Save as separate copy"
            >
              <Text style={{ color: palette.action.label, fontSize: 12, fontWeight: '600' }}>
                Save Copy
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Top Header & Restrained Toolbar */}
      <View
        style={[
          styles.toolbar,
          { backgroundColor: palette.surfaceRaised, borderColor: palette.border.subtle },
        ]}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.toolbarScroll}
        >
          <Pressable
            style={[
              styles.toolbarBtn,
              { borderColor: palette.border.subtle, backgroundColor: palette.surface },
            ]}
            onPress={() => setBlockType('paragraph')}
            accessibilityLabel="Format paragraph"
          >
            <Text style={[styles.toolbarBtnText, { color: palette.text.primary }]}>¶</Text>
          </Pressable>
          <Pressable
            style={[
              styles.toolbarBtn,
              { borderColor: palette.border.subtle, backgroundColor: palette.surface },
            ]}
            onPress={() => setBlockType('h1')}
            accessibilityLabel="Format heading 1"
          >
            <Text
              style={[styles.toolbarBtnText, { color: palette.text.primary, fontWeight: '700' }]}
            >
              H1
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.toolbarBtn,
              { borderColor: palette.border.subtle, backgroundColor: palette.surface },
            ]}
            onPress={() => setBlockType('h2')}
            accessibilityLabel="Format heading 2"
          >
            <Text
              style={[styles.toolbarBtnText, { color: palette.text.primary, fontWeight: '700' }]}
            >
              H2
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.toolbarBtn,
              { borderColor: palette.border.subtle, backgroundColor: palette.surface },
            ]}
            onPress={() => setBlockType('h3')}
            accessibilityLabel="Format heading 3"
          >
            <Text
              style={[styles.toolbarBtnText, { color: palette.text.primary, fontWeight: '700' }]}
            >
              H3
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.toolbarBtn,
              { borderColor: palette.border.subtle, backgroundColor: palette.surface },
            ]}
            onPress={() => setBlockType('bullet')}
            accessibilityLabel="Format bullet list"
          >
            <Text style={[styles.toolbarBtnText, { color: palette.text.primary }]}>• List</Text>
          </Pressable>
          <Pressable
            style={[
              styles.toolbarBtn,
              { borderColor: palette.border.subtle, backgroundColor: palette.surface },
            ]}
            onPress={() => setBlockType('ordered')}
            accessibilityLabel="Format numbered list"
          >
            <Text style={[styles.toolbarBtnText, { color: palette.text.primary }]}>1. List</Text>
          </Pressable>
          <Pressable
            style={[
              styles.toolbarBtn,
              { borderColor: palette.border.subtle, backgroundColor: palette.surface },
            ]}
            onPress={() => setBlockType('checklist')}
            accessibilityLabel="Format checklist"
          >
            <Text style={[styles.toolbarBtnText, { color: palette.text.primary }]}>☑ Check</Text>
          </Pressable>
          <Pressable
            style={[
              styles.toolbarBtn,
              {
                borderColor: palette.border.subtle,
                backgroundColor: palette.surface,
                opacity: undoStack.length > 0 ? 1 : 0.4,
              },
            ]}
            disabled={undoStack.length === 0}
            onPress={handleUndo}
            accessibilityLabel="Undo"
          >
            <Text style={[styles.toolbarBtnText, { color: palette.text.primary }]}>↩</Text>
          </Pressable>
          <Pressable
            style={[
              styles.toolbarBtn,
              {
                borderColor: palette.border.subtle,
                backgroundColor: palette.surface,
                opacity: redoStack.length > 0 ? 1 : 0.4,
              },
            ]}
            disabled={redoStack.length === 0}
            onPress={handleRedo}
            accessibilityLabel="Redo"
          >
            <Text style={[styles.toolbarBtnText, { color: palette.text.primary }]}>↪</Text>
          </Pressable>
        </ScrollView>
      </View>

      {/* Status Bar */}
      <View style={[styles.statusBar, { borderBottomColor: palette.border.subtle }]}>
        <View style={styles.statusGroup}>
          <Text style={[styles.statusText, { color: palette.text.secondary }]}>
            💾 {localSaveStatus}
          </Text>
          <Text style={[styles.statusText, { color: palette.text.secondary }]}>•</Text>
          <Text style={[styles.statusText, { color: palette.text.secondary }]}>
            ☁️ {cloudSyncStatus}
          </Text>
        </View>
        <Text style={[styles.statusText, { color: palette.text.secondary }]}>
          {wordCount} words • {charCount} chars
        </Text>
        <View style={styles.actionBtns}>
          {onClose && (
            <Pressable
              onPress={onClose}
              style={[
                styles.headerActionBtn,
                { backgroundColor: palette.surfaceRaised, borderColor: palette.border.subtle },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Done editing"
            >
              <Text style={{ color: palette.text.primary, fontSize: 13, fontWeight: '600' }}>
                Done
              </Text>
            </Pressable>
          )}
          {onDelete && (
            <Pressable
              onPress={onDelete}
              style={[
                styles.headerActionBtn,
                {
                  backgroundColor: palette.status.dangerBg,
                  borderColor: palette.status.dangerBorder,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Trash note"
            >
              <Text style={{ color: palette.status.danger, fontSize: 13, fontWeight: '600' }}>
                Trash
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Editor Body */}
      <ScrollView style={styles.canvas} contentContainerStyle={styles.canvasContent}>
        {/* Title Input */}
        <TextInput
          style={[styles.titleInput, { color: palette.text.primary }]}
          value={title}
          placeholder="Untitled note..."
          placeholderTextColor={palette.text.muted}
          editable={!readOnly}
          onChangeText={(text) => {
            setTitle(text);
            isDirtyRef.current = true;
          }}
          accessibilityLabel="Note title"
        />

        {/* Structured Blocks */}
        <View style={styles.blocksContainer}>
          {doc.content.map((block: NoteBlockNode) => {
            switch (block.type) {
              case 'paragraph': {
                const blockId = block.id || 'p-0';
                const textNode = block.content?.[0] as NoteTextInline | undefined;
                const text = textNode?.type === 'text' ? textNode.text : '';
                return (
                  <TextInput
                    key={blockId}
                    style={[styles.paragraphInput, { color: palette.text.primary }]}
                    value={text}
                    placeholder="Type your thought..."
                    placeholderTextColor={palette.text.muted}
                    multiline
                    editable={!readOnly}
                    onFocus={() => setActiveBlockId(blockId)}
                    onChangeText={(newText) => updateBlockText(blockId, newText)}
                    accessibilityLabel="Paragraph block"
                  />
                );
              }
              case 'heading': {
                const blockId = block.id || 'h-0';
                const textNode = block.content?.[0] as NoteTextInline | undefined;
                const text = textNode?.type === 'text' ? textNode.text : '';
                const fontSize = block.level === 1 ? 22 : block.level === 2 ? 18 : 16;
                return (
                  <TextInput
                    key={blockId}
                    style={[styles.headingInput, { color: palette.text.primary, fontSize }]}
                    value={text}
                    placeholder={`Heading ${block.level}...`}
                    placeholderTextColor={palette.text.muted}
                    editable={!readOnly}
                    onFocus={() => setActiveBlockId(blockId)}
                    onChangeText={(newText) => updateBlockText(blockId, newText)}
                    accessibilityLabel={`Heading ${block.level} block`}
                  />
                );
              }
              case 'bullet_list': {
                return (
                  <View key={block.id || 'bl-0'} style={styles.listContainer}>
                    {block.items.map((it: NoteListItemNode) => {
                      const text = it.content?.[0]?.type === 'text' ? it.content[0].text : '';
                      const itemId = it.id || 'li-0';
                      return (
                        <View key={itemId} style={styles.listItemRow}>
                          <Text style={[styles.bulletPoint, { color: palette.text.primary }]}>
                            •
                          </Text>
                          <TextInput
                            style={[styles.listItemInput, { color: palette.text.primary }]}
                            value={text}
                            placeholder="List item..."
                            placeholderTextColor={palette.text.muted}
                            editable={!readOnly}
                            onFocus={() => setActiveBlockId(itemId)}
                            onChangeText={(newText) => updateBlockText(itemId, newText)}
                            accessibilityLabel="Bullet list item"
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
                      const text = it.content?.[0]?.type === 'text' ? it.content[0].text : '';
                      const itemId = it.id || 'oli-0';
                      return (
                        <View key={itemId} style={styles.listItemRow}>
                          <Text style={[styles.orderedNumber, { color: palette.text.secondary }]}>
                            {idx + 1}.
                          </Text>
                          <TextInput
                            style={[styles.listItemInput, { color: palette.text.primary }]}
                            value={text}
                            placeholder="Numbered item..."
                            placeholderTextColor={palette.text.muted}
                            editable={!readOnly}
                            onFocus={() => setActiveBlockId(itemId)}
                            onChangeText={(newText) => updateBlockText(itemId, newText)}
                            accessibilityLabel={`Item ${idx + 1}`}
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
                      const text = it.content?.[0]?.type === 'text' ? it.content[0].text : '';
                      const itemId = it.id || 'cli-0';
                      return (
                        <View key={itemId} style={styles.checkItemRow}>
                          <Pressable
                            onPress={() => toggleChecklistItem(itemId, !it.checked)}
                            style={[
                              styles.checkbox,
                              {
                                borderColor: palette.border.strong,
                                backgroundColor: it.checked
                                  ? palette.action.primary
                                  : 'transparent',
                              },
                            ]}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: it.checked }}
                            accessibilityLabel={`Checkbox for ${text || 'item'}`}
                          >
                            {it.checked && (
                              <Text
                                style={{
                                  color: palette.action.label,
                                  fontSize: 12,
                                  fontWeight: '700',
                                }}
                              >
                                ✓
                              </Text>
                            )}
                          </Pressable>
                          <TextInput
                            style={[
                              styles.checkItemInput,
                              {
                                color: it.checked ? palette.text.muted : palette.text.primary,
                                textDecorationLine: it.checked ? 'line-through' : 'none',
                              },
                            ]}
                            value={text}
                            placeholder="To-do item..."
                            placeholderTextColor={palette.text.muted}
                            editable={!readOnly}
                            onFocus={() => setActiveBlockId(itemId)}
                            onChangeText={(newText) => updateBlockText(itemId, newText)}
                            accessibilityLabel="Checklist item text"
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

          {/* Add block button */}
          <Pressable
            onPress={addBlock}
            style={[styles.addBlockBtn, { borderColor: palette.border.subtle }]}
            accessibilityRole="button"
            accessibilityLabel="Add new paragraph block"
          >
            <Text style={{ color: palette.text.secondary, fontSize: 14 }}>+ Add Paragraph</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  conflictBanner: {
    padding: spacing.sm,
    borderBottomWidth: 1,
  },
  conflictTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  conflictActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  conflictBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  toolbar: {
    borderBottomWidth: 1,
    paddingVertical: spacing.xs,
  },
  toolbarScroll: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  toolbarBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.sm,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolbarBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  statusGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusText: {
    fontSize: 11,
  },
  actionBtns: {
    flexDirection: 'row',
    gap: 6,
  },
  headerActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  canvas: {
    flex: 1,
  },
  canvasContent: {
    padding: spacing.md,
  },
  titleInput: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: spacing.md,
    padding: 0,
  },
  blocksContainer: {
    gap: spacing.sm,
  },
  paragraphInput: {
    fontSize: 15,
    lineHeight: 22,
    padding: 0,
  },
  headingInput: {
    fontWeight: '700',
    padding: 0,
  },
  listContainer: {
    gap: spacing.xs,
  },
  listItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  bulletPoint: {
    fontSize: 16,
    width: 14,
  },
  orderedNumber: {
    fontSize: 14,
    width: 22,
  },
  listItemInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  checkItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkItemInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  addBlockBtn: {
    paddingVertical: 8,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
});
