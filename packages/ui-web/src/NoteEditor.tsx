import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { colors, radii, spacing, typography, type ThemeMode } from '@daynori/design-tokens';
import {
  type NoteDocument,
  type NoteBlockNode,
  type NoteListItemNode,
  type NoteChecklistItemNode,
  type NoteInlineNode,
  type NoteMark,
  extractPlainText,
  extractInlineText,
  resolveNoteTitle,
  calculateCharCount,
  calculateWordCount,
  generateUuid,
  createRecoverableNoteDocument,
  applyMarkToInlines,
  normalizeInlines,
} from '@daynori/domain';
import { Button } from './Button.js';

export interface NoteEditorProps {
  id?: string;
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
  autoFocus?: boolean;
}

/**
 * Traverses an HTML DOM container to serialize rich child nodes back into canonical NoteInlineNode[].
 * Correctly detects <strong>, <b>, <em>, <i>, font-weight/style inline styles, <br>, and plain text.
 */
function parseDomToInlines(container: HTMLElement): NoteInlineNode[] {
  const inlines: NoteInlineNode[] = [];

  function walk(node: Node, currentMarks: Set<NoteMark>) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue || '';
      if (text.length > 0) {
        const marks = Array.from(currentMarks);
        inlines.push({
          type: 'text',
          text,
          ...(marks.length > 0 ? { marks: marks.sort() as NoteMark[] } : {}),
        });
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.tagName === 'BR') {
        inlines.push({ type: 'hard_break' });
        return;
      }

      const nextMarks = new Set(currentMarks);
      if (
        el.tagName === 'STRONG' ||
        el.tagName === 'B' ||
        el.style.fontWeight === 'bold' ||
        el.style.fontWeight === '700'
      ) {
        nextMarks.add('bold');
      }
      if (el.tagName === 'EM' || el.tagName === 'I' || el.style.fontStyle === 'italic') {
        nextMarks.add('italic');
      }

      for (const child of Array.from(el.childNodes)) {
        walk(child, nextMarks);
      }
    }
  }

  for (const child of Array.from(container.childNodes)) {
    walk(child, new Set());
  }

  return normalizeInlines(inlines);
}

export function NoteEditor({
  id = 'note-editor',
  initialTitle = '',
  initialDocument,
  initialFolderId = null,
  folders = [],
  themeMode = 'light',
  readOnly = false,
  localSaveStatus = 'Saved locally',
  cloudSyncStatus = 'Synced',
  conflict = null,
  onSave,
  onResolveConflict,
  onClose,
  onDelete,
  autoFocus = false,
}: NoteEditorProps) {
  const palette = colors[themeMode];
  const titleInputId = useId();
  const folderSelectId = useId();
  const liveRegionId = useId();

  // 1. Core State
  const [title, setTitle] = useState(initialTitle);
  const [folderId, setFolderId] = useState<string | null>(initialFolderId);

  // Recoverable initial document: never silently drops invalid schemas into empty docs
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

  // Undo / Redo session history
  const [undoStack, setUndoStack] = useState<NoteDocument[]>([]);
  const [redoStack, setRedoStack] = useState<NoteDocument[]>([]);

  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const isComposingRef = useRef(false);
  const blockRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Metrics
  const plainText = useMemo(() => extractPlainText(doc), [doc]);
  const wordCount = useMemo(() => calculateWordCount(plainText), [plainText]);
  const charCount = useMemo(() => calculateCharCount(plainText), [plainText]);
  const displayTitle = useMemo(
    () => resolveNoteTitle(title, 'Untitled', plainText),
    [title, plainText]
  );

  // 2. Reliable Autosave Lifecycle
  const editGenerationRef = useRef(0);
  const lastSavedGenerationRef = useRef(0);
  const isSavingRef = useRef(false);
  const hasPendingSaveRef = useRef(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const latestSnapshotRef = useRef({ title, doc, folderId, plainText });
  latestSnapshotRef.current = { title, doc, folderId, plainText };

  const latestOnSaveRef = useRef(onSave);
  latestOnSaveRef.current = onSave;

  // Push to undo stack before mutating
  const mutateDoc = useCallback((updater: (prev: NoteDocument) => NoteDocument) => {
    setDoc((prev: NoteDocument) => {
      const next = updater(prev);
      setUndoStack((u) => [...u.slice(-49), prev]);
      setRedoStack([]);
      return next;
    });
    editGenerationRef.current += 1;
    setSaveError(null);
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    if (!previous) return;
    setUndoStack((u) => u.slice(0, -1));
    setRedoStack((r) => [...r, doc]);
    setDoc(previous);
    editGenerationRef.current += 1;
  }, [undoStack, doc]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    if (!next) return;
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((u) => [...u, doc]);
    setDoc(next);
    editGenerationRef.current += 1;
  }, [redoStack, doc]);

  // Serialized durable save executor
  const performSave = useCallback(async () => {
    if (readOnly) return;
    if (isComposingRef.current) {
      // Defer autosave while user is composing complex script / IME characters
      return;
    }

    const currentGen = editGenerationRef.current;
    if (currentGen <= lastSavedGenerationRef.current) {
      // Clean; nothing new to persist
      return;
    }

    if (isSavingRef.current) {
      hasPendingSaveRef.current = true;
      return;
    }

    const onSaveFn = latestOnSaveRef.current;
    if (!onSaveFn) return;

    isSavingRef.current = true;
    const snapshot = latestSnapshotRef.current;
    const cleanTitle = resolveNoteTitle(snapshot.title, 'Untitled', snapshot.plainText);

    try {
      await onSaveFn({
        title: cleanTitle,
        document: snapshot.doc,
        plainText: snapshot.plainText,
        folderId: snapshot.folderId,
      });

      // Advance durable generation only upon successful resolution
      lastSavedGenerationRef.current = currentGen;
      setSaveError(null);
    } catch {
      // Retain dirty content on failure and surface recovery
      setSaveError('Persistence failed. Your latest edits remain in memory.');
    } finally {
      isSavingRef.current = false;
      if (hasPendingSaveRef.current) {
        hasPendingSaveRef.current = false;
        void performSave();
      }
    }
  }, [readOnly]);

  // Debounced 600ms autosave loop
  const debouncedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (readOnly) return;
    if (debouncedTimerRef.current) {
      clearTimeout(debouncedTimerRef.current);
    }

    debouncedTimerRef.current = setTimeout(() => {
      void performSave();
    }, 600);

    return () => {
      if (debouncedTimerRef.current) {
        clearTimeout(debouncedTimerRef.current);
      }
    };
  }, [title, doc, folderId, performSave, readOnly]);

  // Flush on unmount: stable cleanup without running on ordinary re-renders
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

  // 3. Block Mutation Handlers
  const updateBlockInlines = (blockId: string, newInlines: NoteInlineNode[]) => {
    if (readOnly) return;
    editGenerationRef.current += 1;
    setSaveError(null);

    setDoc((prev: NoteDocument) => {
      const newContent: NoteBlockNode[] = prev.content.map((b: NoteBlockNode): NoteBlockNode => {
        if (b.id !== blockId) {
          if (b.type === 'bullet_list' || b.type === 'ordered_list') {
            const updatedItems: NoteListItemNode[] = b.items.map((it: NoteListItemNode) =>
              it.id === blockId ? { ...it, content: newInlines } : it
            );
            return { ...b, items: updatedItems };
          }
          if (b.type === 'checklist') {
            const updatedItems: NoteChecklistItemNode[] = b.items.map(
              (it: NoteChecklistItemNode) =>
                it.id === blockId ? { ...it, content: newInlines } : it
            );
            return { ...b, items: updatedItems };
          }
          return b;
        }

        if (b.type === 'paragraph' || b.type === 'heading') {
          return {
            ...b,
            content: newInlines,
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

  // Toggle bold formatting on selection without destroying unrelated content
  const toggleBlockBold = () => {
    if (readOnly || !activeBlockId) return;

    // Check if browser DOM selection is active inside activeBlockId
    if (typeof window !== 'undefined' && window.getSelection) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        try {
          // Native execCommand toggles bold inline and maintains user selection
          document.execCommand('bold');
          const el = blockRefs.current.get(activeBlockId);
          if (el) {
            const inlines = parseDomToInlines(el);
            mutateDoc((prev) => {
              const updated = prev.content.map((b) => {
                if (b.id === activeBlockId && (b.type === 'paragraph' || b.type === 'heading')) {
                  return { ...b, content: inlines };
                }
                if (b.type === 'bullet_list') {
                  return {
                    ...b,
                    items: b.items.map((it: NoteListItemNode) =>
                      it.id === activeBlockId ? { ...it, content: inlines } : it
                    ),
                  };
                }
                if (b.type === 'ordered_list') {
                  return {
                    ...b,
                    items: b.items.map((it: NoteListItemNode) =>
                      it.id === activeBlockId ? { ...it, content: inlines } : it
                    ),
                  };
                }
                if (b.type === 'checklist') {
                  return {
                    ...b,
                    items: b.items.map((it: NoteChecklistItemNode) =>
                      it.id === activeBlockId ? { ...it, content: inlines } : it
                    ),
                  };
                }
                return b;
              });
              return { ...prev, content: updated };
            });
            return;
          }
        } catch {
          // Fall through to domain AST toggle
        }
      }
    }

    // AST fallback: toggle bold mark across the active block's inlines
    mutateDoc((prev: NoteDocument) => {
      const newContent: NoteBlockNode[] = prev.content.map((b: NoteBlockNode): NoteBlockNode => {
        if (b.id === activeBlockId && (b.type === 'paragraph' || b.type === 'heading')) {
          const currentInlines = b.content || [];
          const textLen = extractInlineText(currentInlines).length;
          const updated = applyMarkToInlines(currentInlines, 0, textLen, 'bold');
          return { ...b, content: updated };
        }
        if (b.type === 'bullet_list' || b.type === 'ordered_list') {
          const updatedItems = b.items.map((it: NoteListItemNode) => {
            if (it.id === activeBlockId) {
              const textLen = extractInlineText(it.content).length;
              return { ...it, content: applyMarkToInlines(it.content, 0, textLen, 'bold') };
            }
            return it;
          });
          return { ...b, items: updatedItems };
        }
        if (b.type === 'checklist') {
          const updatedItems = b.items.map((it: NoteChecklistItemNode) => {
            if (it.id === activeBlockId) {
              const textLen = extractInlineText(it.content).length;
              return { ...it, content: applyMarkToInlines(it.content, 0, textLen, 'bold') };
            }
            return it;
          });
          return { ...b, items: updatedItems };
        }
        return b;
      });
      return { ...prev, content: newContent };
    });
  };

  // Convert current block type preserving all existing inline runs and marks
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

  const handleKeyDown = (e: React.KeyboardEvent, blockId: string) => {
    if (isComposingRef.current) return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void performSave();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      toggleBlockBold();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        handleRedo();
      } else {
        handleUndo();
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      handleRedo();
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const newId = generateUuid();

      mutateDoc((prev: NoteDocument) => {
        const newContent: NoteBlockNode[] = [];
        for (const b of prev.content) {
          if (
            b.type === 'bullet_list' &&
            b.items.some((it: NoteListItemNode) => it.id === blockId)
          ) {
            const newItems: NoteListItemNode[] = [];
            for (const it of b.items) {
              newItems.push(it);
              if (it.id === blockId) {
                newItems.push({
                  id: newId,
                  type: 'list_item',
                  content: [{ type: 'text', text: '' }],
                });
              }
            }
            newContent.push({ ...b, items: newItems });
            continue;
          }
          if (
            b.type === 'ordered_list' &&
            b.items.some((it: NoteListItemNode) => it.id === blockId)
          ) {
            const newItems: NoteListItemNode[] = [];
            for (const it of b.items) {
              newItems.push(it);
              if (it.id === blockId) {
                newItems.push({
                  id: newId,
                  type: 'list_item',
                  content: [{ type: 'text', text: '' }],
                });
              }
            }
            newContent.push({ ...b, items: newItems });
            continue;
          }
          if (
            b.type === 'checklist' &&
            b.items.some((it: NoteChecklistItemNode) => it.id === blockId)
          ) {
            const newItems: NoteChecklistItemNode[] = [];
            for (const it of b.items) {
              newItems.push(it);
              if (it.id === blockId) {
                newItems.push({
                  id: newId,
                  type: 'checklist_item',
                  checked: false,
                  content: [{ type: 'text', text: '' }],
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
    }
  };

  // Render a block's rich inline runs
  const renderInlineContent = (inlines?: NoteInlineNode[]) => {
    if (!inlines || inlines.length === 0) {
      return <span data-type="text"></span>;
    }
    return inlines.map((node: NoteInlineNode, idx: number) => {
      if (node.type === 'hard_break') {
        return <br key={`hb-${idx}`} data-type="hard-break" />;
      }
      const isBold = node.marks?.includes('bold');
      const isItalic = node.marks?.includes('italic');

      if (isBold && isItalic) {
        return (
          <strong key={`inline-${idx}`} data-type="text" data-marks="bold,italic">
            <em>{node.text}</em>
          </strong>
        );
      }
      if (isBold) {
        return (
          <strong key={`inline-${idx}`} data-type="text" data-marks="bold">
            {node.text}
          </strong>
        );
      }
      if (isItalic) {
        return (
          <em key={`inline-${idx}`} data-type="text" data-marks="italic">
            {node.text}
          </em>
        );
      }
      return (
        <span key={`inline-${idx}`} data-type="text">
          {node.text}
        </span>
      );
    });
  };

  return (
    <div
      id={id}
      data-testid="note-editor"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: palette.surface,
        color: palette.text.primary,
        fontFamily: typography.fontFamily.sans,
        borderRadius: `${radii.card}px`,
      }}
    >
      {/* Live Region for Screen Readers */}
      <div
        id={liveRegionId}
        role="status"
        aria-live="polite"
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {`Title: ${displayTitle}. Local: ${localSaveStatus}. Cloud: ${cloudSyncStatus}. Word count: ${wordCount}.`}
      </div>

      {/* Conflict Recovery Banner */}
      {conflict && (
        <div
          role="alert"
          data-testid="conflict-banner"
          style={{
            padding: `${spacing.md}px`,
            backgroundColor: palette.status.warningBg,
            color: palette.status.warning,
            borderBottom: `1px solid ${palette.status.warningBorder}`,
            display: 'flex',
            flexDirection: 'column',
            gap: `${spacing.sm}px`,
          }}
        >
          <div style={{ fontWeight: 700 }}>
            ⚠️ Sync Conflict: Another device edited this note (Server Rev {conflict.serverRevision})
          </div>
          <div style={{ fontSize: `${typography.webScale.supporting}px` }}>
            Choose how to resolve this edit without losing changes:
          </div>
          <div style={{ display: 'flex', gap: `${spacing.sm}px`, flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              onClick={() => onResolveConflict && onResolveConflict('keep_server')}
              data-testid="resolve-keep-server"
            >
              Keep Server Version
            </Button>
            <Button
              variant="secondary"
              onClick={() => onResolveConflict && onResolveConflict('keep_local')}
              data-testid="resolve-keep-local"
            >
              Keep Local Version
            </Button>
            <Button
              variant="primary"
              onClick={() => onResolveConflict && onResolveConflict('save_copy')}
              data-testid="resolve-save-copy"
            >
              Save as Separate Copy
            </Button>
          </div>
        </div>
      )}

      {/* Save Error Recovery Notification */}
      {saveError && (
        <div
          role="alert"
          data-testid="save-error-banner"
          style={{
            padding: `${spacing.sm}px ${spacing.md}px`,
            backgroundColor: palette.status.dangerBg,
            color: palette.status.danger,
            borderBottom: `1px solid ${palette.status.dangerBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: `${typography.webScale.supporting}px`,
          }}
        >
          <span>{saveError}</span>
          <button
            type="button"
            onClick={() => void performSave()}
            data-testid="retry-save-btn"
            style={{
              padding: '4px 8px',
              borderRadius: `${radii.sm}px`,
              border: `1px solid ${palette.status.dangerBorder}`,
              backgroundColor: palette.surface,
              color: palette.status.danger,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Retry Save
          </button>
        </div>
      )}

      {/* Top Header & Restrained Formatting Toolbar */}
      <div
        role="toolbar"
        aria-label="Note editor toolbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: `${spacing.sm}px`,
          padding: `${spacing.sm}px ${spacing.md}px`,
          backgroundColor: palette.surfaceRaised,
          borderBottom: `1px solid ${palette.border.subtle}`,
        }}
      >
        {/* Left Toolbar Controls: Formatting */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: `${spacing.xs}px`,
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            aria-label="Paragraph"
            title="Convert to Paragraph"
            onClick={() => setBlockType('paragraph')}
            disabled={readOnly}
            data-testid="format-paragraph"
            style={{
              padding: '6px 10px',
              borderRadius: `${radii.sm}px`,
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: palette.surface,
              color: palette.text.primary,
              cursor: readOnly ? 'default' : 'pointer',
              fontWeight: 600,
            }}
          >
            ¶
          </button>
          <button
            type="button"
            aria-label="Heading 1"
            title="Convert to Heading 1"
            onClick={() => setBlockType('h1')}
            disabled={readOnly}
            data-testid="format-h1"
            style={{
              padding: '6px 10px',
              borderRadius: `${radii.sm}px`,
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: palette.surface,
              color: palette.text.primary,
              cursor: readOnly ? 'default' : 'pointer',
              fontWeight: 700,
            }}
          >
            H1
          </button>
          <button
            type="button"
            aria-label="Heading 2"
            title="Convert to Heading 2"
            onClick={() => setBlockType('h2')}
            disabled={readOnly}
            data-testid="format-h2"
            style={{
              padding: '6px 10px',
              borderRadius: `${radii.sm}px`,
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: palette.surface,
              color: palette.text.primary,
              cursor: readOnly ? 'default' : 'pointer',
              fontWeight: 700,
            }}
          >
            H2
          </button>
          <button
            type="button"
            aria-label="Heading 3"
            title="Convert to Heading 3"
            onClick={() => setBlockType('h3')}
            disabled={readOnly}
            data-testid="format-h3"
            style={{
              padding: '6px 10px',
              borderRadius: `${radii.sm}px`,
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: palette.surface,
              color: palette.text.primary,
              cursor: readOnly ? 'default' : 'pointer',
              fontWeight: 700,
            }}
          >
            H3
          </button>

          <span style={{ color: palette.border.subtle, margin: '0 4px' }}>|</span>

          <button
            type="button"
            aria-label="Bold text"
            title="Toggle Bold (Ctrl+B)"
            onClick={toggleBlockBold}
            disabled={readOnly}
            data-testid="format-bold"
            style={{
              padding: '6px 10px',
              borderRadius: `${radii.sm}px`,
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: palette.surface,
              color: palette.text.primary,
              cursor: readOnly ? 'default' : 'pointer',
              fontWeight: 700,
            }}
          >
            B
          </button>

          <button
            type="button"
            aria-label="Bullet list"
            title="Convert to Bullet List"
            onClick={() => setBlockType('bullet')}
            disabled={readOnly}
            data-testid="format-bullet"
            style={{
              padding: '6px 10px',
              borderRadius: `${radii.sm}px`,
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: palette.surface,
              color: palette.text.primary,
              cursor: readOnly ? 'default' : 'pointer',
            }}
          >
            • List
          </button>
          <button
            type="button"
            aria-label="Ordered list"
            title="Convert to Numbered List"
            onClick={() => setBlockType('ordered')}
            disabled={readOnly}
            data-testid="format-ordered"
            style={{
              padding: '6px 10px',
              borderRadius: `${radii.sm}px`,
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: palette.surface,
              color: palette.text.primary,
              cursor: readOnly ? 'default' : 'pointer',
            }}
          >
            1. List
          </button>
          <button
            type="button"
            aria-label="Checklist"
            title="Convert to Checklist"
            onClick={() => setBlockType('checklist')}
            disabled={readOnly}
            data-testid="format-checklist"
            style={{
              padding: '6px 10px',
              borderRadius: `${radii.sm}px`,
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: palette.surface,
              color: palette.text.primary,
              cursor: readOnly ? 'default' : 'pointer',
            }}
          >
            ☑ Check
          </button>

          <span style={{ color: palette.border.subtle, margin: '0 4px' }}>|</span>

          <button
            type="button"
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
            disabled={undoStack.length === 0}
            onClick={handleUndo}
            data-testid="editor-undo"
            style={{
              padding: '6px 10px',
              borderRadius: `${radii.sm}px`,
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: palette.surface,
              color: undoStack.length > 0 ? palette.text.primary : palette.text.muted,
              cursor: undoStack.length > 0 ? 'pointer' : 'default',
            }}
          >
            ↩ Undo
          </button>
          <button
            type="button"
            aria-label="Redo"
            title="Redo (Ctrl+Y)"
            disabled={redoStack.length === 0}
            onClick={handleRedo}
            data-testid="editor-redo"
            style={{
              padding: '6px 10px',
              borderRadius: `${radii.sm}px`,
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: palette.surface,
              color: redoStack.length > 0 ? palette.text.primary : palette.text.muted,
              cursor: redoStack.length > 0 ? 'pointer' : 'default',
            }}
          >
            ↪ Redo
          </button>
        </div>

        {/* Center / Right: Folder Selector and Indicators */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: `${spacing.md}px`,
            flexWrap: 'wrap',
          }}
        >
          {folders.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.xs}px` }}>
              <label
                htmlFor={folderSelectId}
                style={{
                  fontSize: `${typography.webScale.supporting}px`,
                  color: palette.text.secondary,
                }}
              >
                Folder:
              </label>
              <select
                id={folderSelectId}
                value={folderId ?? ''}
                onChange={(e) => {
                  const newFolder = e.target.value ? e.target.value : null;
                  setFolderId(newFolder);
                  editGenerationRef.current += 1;
                }}
                disabled={readOnly}
                data-testid="note-folder-select"
                style={{
                  padding: '4px 8px',
                  borderRadius: `${radii.sm}px`,
                  border: `1px solid ${palette.border.subtle}`,
                  backgroundColor: palette.surface,
                  color: palette.text.primary,
                  fontSize: `${typography.webScale.supporting}px`,
                }}
              >
                <option value="">📁 Inbox (Unfiled)</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    📁 {f.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Distinct Persistence and Sync Indicators */}
          <div
            role="status"
            aria-label={`Status: ${localSaveStatus}, ${cloudSyncStatus}`}
            data-testid="editor-status-indicators"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: `${spacing.sm}px`,
              fontSize: `${typography.webScale.metadata}px`,
              color: palette.text.secondary,
            }}
          >
            <span data-testid="local-save-status">💾 {localSaveStatus}</span>
            <span>•</span>
            <span data-testid="cloud-sync-status">☁️ {cloudSyncStatus}</span>
          </div>

          {/* Metrics */}
          <div
            style={{ fontSize: `${typography.webScale.metadata}px`, color: palette.text.secondary }}
          >
            {wordCount} words • {charCount} chars
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: `${spacing.xs}px` }}>
            {onClose && (
              <Button variant="secondary" onClick={onClose} data-testid="editor-close-btn">
                Done
              </Button>
            )}
            {onDelete && (
              <Button variant="danger" onClick={onDelete} data-testid="editor-delete-btn">
                Trash
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Distraction-Free Note Canvas */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: `${spacing.lg}px ${spacing.xl}px`,
          maxWidth: '800px',
          width: '100%',
          margin: '0 auto',
          boxSizing: 'border-box',
        }}
      >
        {/* Note Title Input with Visible "Untitled" fallback */}
        <input
          id={titleInputId}
          type="text"
          value={title}
          placeholder="Untitled note..."
          disabled={readOnly}
          autoFocus={autoFocus}
          onChange={(e) => {
            setTitle(e.target.value);
            editGenerationRef.current += 1;
            setSaveError(null);
          }}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
            editGenerationRef.current += 1;
          }}
          data-testid="note-title-input"
          aria-label="Note title"
          style={{
            width: '100%',
            fontSize: `${typography.webScale.welcomeTitle}px`,
            fontWeight: 700,
            lineHeight: typography.lineHeight.tight,
            border: 'none',
            outline: 'none',
            backgroundColor: 'transparent',
            color: palette.text.primary,
            marginBottom: `${spacing.lg}px`,
            boxSizing: 'border-box',
          }}
        />

        {/* Structured Block Content */}
        <div
          data-testid="note-blocks-container"
          style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.md}px` }}
        >
          {doc.content.map((block: NoteBlockNode) => {
            switch (block.type) {
              case 'paragraph': {
                const blockId = block.id || 'p-0';
                return (
                  <div
                    key={blockId}
                    ref={(el) => {
                      if (el) blockRefs.current.set(blockId, el);
                    }}
                    contentEditable={!readOnly}
                    suppressContentEditableWarning={true}
                    role="textbox"
                    aria-multiline={true}
                    aria-label="Paragraph block"
                    data-testid={`block-paragraph-${blockId}`}
                    onFocus={() => setActiveBlockId(blockId)}
                    onBlur={(e) => {
                      const newInlines = parseDomToInlines(e.currentTarget);
                      updateBlockInlines(blockId, newInlines);
                    }}
                    onInput={(e) => {
                      const newInlines = parseDomToInlines(e.currentTarget);
                      updateBlockInlines(blockId, newInlines);
                    }}
                    onKeyDown={(e) => handleKeyDown(e, blockId)}
                    onCompositionStart={() => {
                      isComposingRef.current = true;
                    }}
                    onCompositionEnd={(e) => {
                      isComposingRef.current = false;
                      const newInlines = parseDomToInlines(e.currentTarget);
                      updateBlockInlines(blockId, newInlines);
                    }}
                    style={{
                      width: '100%',
                      fontSize: `${typography.webScale.body}px`,
                      lineHeight: typography.lineHeight.bangla,
                      border: 'none',
                      outline: 'none',
                      backgroundColor: 'transparent',
                      color: palette.text.primary,
                      fontFamily: typography.fontFamily.sans,
                      minHeight: '28px',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {renderInlineContent(block.content)}
                  </div>
                );
              }
              case 'heading': {
                const blockId = block.id || 'h-0';
                const fontSize =
                  block.level === 1
                    ? `${typography.webScale.pageTitle}px`
                    : block.level === 2
                      ? `${typography.webScale.sectionHeading}px`
                      : `${typography.webScale.body + 2}px`;
                return (
                  <div
                    key={blockId}
                    ref={(el) => {
                      if (el) blockRefs.current.set(blockId, el);
                    }}
                    contentEditable={!readOnly}
                    suppressContentEditableWarning={true}
                    role="heading"
                    aria-level={block.level}
                    aria-label={`Heading ${block.level} block`}
                    data-testid={`block-heading-${blockId}`}
                    onFocus={() => setActiveBlockId(blockId)}
                    onBlur={(e) => {
                      const newInlines = parseDomToInlines(e.currentTarget);
                      updateBlockInlines(blockId, newInlines);
                    }}
                    onInput={(e) => {
                      const newInlines = parseDomToInlines(e.currentTarget);
                      updateBlockInlines(blockId, newInlines);
                    }}
                    onKeyDown={(e) => handleKeyDown(e, blockId)}
                    onCompositionStart={() => {
                      isComposingRef.current = true;
                    }}
                    onCompositionEnd={(e) => {
                      isComposingRef.current = false;
                      const newInlines = parseDomToInlines(e.currentTarget);
                      updateBlockInlines(blockId, newInlines);
                    }}
                    style={{
                      width: '100%',
                      fontSize,
                      fontWeight: 700,
                      border: 'none',
                      outline: 'none',
                      backgroundColor: 'transparent',
                      color: palette.text.primary,
                      fontFamily: typography.fontFamily.sans,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {renderInlineContent(block.content)}
                  </div>
                );
              }
              case 'bullet_list': {
                return (
                  <ul
                    key={block.id || 'bl-0'}
                    role="list"
                    style={{
                      margin: 0,
                      paddingLeft: '24px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: `${spacing.xs}px`,
                    }}
                  >
                    {block.items.map((it: NoteListItemNode) => {
                      const itemId = it.id || 'li-0';
                      return (
                        <li key={itemId} style={{ color: palette.text.primary }}>
                          <div
                            ref={(el) => {
                              if (el) blockRefs.current.set(itemId, el);
                            }}
                            contentEditable={!readOnly}
                            suppressContentEditableWarning={true}
                            role="textbox"
                            aria-label="Bullet list item"
                            data-testid={`block-listitem-${itemId}`}
                            onFocus={() => setActiveBlockId(itemId)}
                            onBlur={(e) => {
                              const newInlines = parseDomToInlines(e.currentTarget);
                              updateBlockInlines(itemId, newInlines);
                            }}
                            onInput={(e) => {
                              const newInlines = parseDomToInlines(e.currentTarget);
                              updateBlockInlines(itemId, newInlines);
                            }}
                            onKeyDown={(e) => handleKeyDown(e, itemId)}
                            onCompositionStart={() => {
                              isComposingRef.current = true;
                            }}
                            onCompositionEnd={(e) => {
                              isComposingRef.current = false;
                              const newInlines = parseDomToInlines(e.currentTarget);
                              updateBlockInlines(itemId, newInlines);
                            }}
                            style={{
                              width: '100%',
                              border: 'none',
                              outline: 'none',
                              backgroundColor: 'transparent',
                              color: palette.text.primary,
                              fontSize: `${typography.webScale.body}px`,
                              fontFamily: typography.fontFamily.sans,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                            }}
                          >
                            {renderInlineContent(it.content)}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                );
              }
              case 'ordered_list': {
                return (
                  <ol
                    key={block.id || 'ol-0'}
                    role="list"
                    style={{
                      margin: 0,
                      paddingLeft: '24px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: `${spacing.xs}px`,
                    }}
                  >
                    {block.items.map((it: NoteListItemNode) => {
                      const itemId = it.id || 'oli-0';
                      return (
                        <li key={itemId} style={{ color: palette.text.primary }}>
                          <div
                            ref={(el) => {
                              if (el) blockRefs.current.set(itemId, el);
                            }}
                            contentEditable={!readOnly}
                            suppressContentEditableWarning={true}
                            role="textbox"
                            aria-label="Numbered list item"
                            data-testid={`block-ordereditem-${itemId}`}
                            onFocus={() => setActiveBlockId(itemId)}
                            onBlur={(e) => {
                              const newInlines = parseDomToInlines(e.currentTarget);
                              updateBlockInlines(itemId, newInlines);
                            }}
                            onInput={(e) => {
                              const newInlines = parseDomToInlines(e.currentTarget);
                              updateBlockInlines(itemId, newInlines);
                            }}
                            onKeyDown={(e) => handleKeyDown(e, itemId)}
                            onCompositionStart={() => {
                              isComposingRef.current = true;
                            }}
                            onCompositionEnd={(e) => {
                              isComposingRef.current = false;
                              const newInlines = parseDomToInlines(e.currentTarget);
                              updateBlockInlines(itemId, newInlines);
                            }}
                            style={{
                              width: '100%',
                              border: 'none',
                              outline: 'none',
                              backgroundColor: 'transparent',
                              color: palette.text.primary,
                              fontSize: `${typography.webScale.body}px`,
                              fontFamily: typography.fontFamily.sans,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                            }}
                          >
                            {renderInlineContent(it.content)}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                );
              }
              case 'checklist': {
                return (
                  <div
                    key={block.id || 'cl-0'}
                    role="group"
                    aria-label="Checklist"
                    style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.xs}px` }}
                  >
                    {block.items.map((it: NoteChecklistItemNode) => {
                      const itemId = it.id || 'cli-0';
                      return (
                        <div
                          key={itemId}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: `${spacing.sm}px`,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={it.checked}
                            disabled={readOnly}
                            onChange={(e) => toggleChecklistItem(itemId, e.target.checked)}
                            data-testid={`checklist-checkbox-${itemId}`}
                            aria-label="Checklist item toggle"
                            style={{
                              marginTop: '4px',
                              width: '18px',
                              height: '18px',
                              cursor: readOnly ? 'default' : 'pointer',
                            }}
                          />
                          <div
                            ref={(el) => {
                              if (el) blockRefs.current.set(itemId, el);
                            }}
                            contentEditable={!readOnly}
                            suppressContentEditableWarning={true}
                            role="textbox"
                            aria-label="Checklist item text"
                            data-testid={`block-checklistitem-${itemId}`}
                            onFocus={() => setActiveBlockId(itemId)}
                            onBlur={(e) => {
                              const newInlines = parseDomToInlines(e.currentTarget);
                              updateBlockInlines(itemId, newInlines);
                            }}
                            onInput={(e) => {
                              const newInlines = parseDomToInlines(e.currentTarget);
                              updateBlockInlines(itemId, newInlines);
                            }}
                            onKeyDown={(e) => handleKeyDown(e, itemId)}
                            onCompositionStart={() => {
                              isComposingRef.current = true;
                            }}
                            onCompositionEnd={(e) => {
                              isComposingRef.current = false;
                              const newInlines = parseDomToInlines(e.currentTarget);
                              updateBlockInlines(itemId, newInlines);
                            }}
                            style={{
                              flex: 1,
                              border: 'none',
                              outline: 'none',
                              backgroundColor: 'transparent',
                              color: it.checked ? palette.text.muted : palette.text.primary,
                              textDecoration: it.checked ? 'line-through' : 'none',
                              fontSize: `${typography.webScale.body}px`,
                              fontFamily: typography.fontFamily.sans,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                            }}
                          >
                            {renderInlineContent(it.content)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              }
              default:
                return null;
            }
          })}
        </div>
      </div>
    </div>
  );
}
