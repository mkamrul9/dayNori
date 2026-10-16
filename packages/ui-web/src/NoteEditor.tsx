import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { colors, radii, spacing, typography, type ThemeMode } from '@daynori/design-tokens';
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

  // Undo / Redo session history
  const [undoStack, setUndoStack] = useState<NoteDocument[]>([]);
  const [redoStack, setRedoStack] = useState<NoteDocument[]>([]);

  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const isComposingRef = useRef(false);
  const isDirtyRef = useRef(false);
  const blockRefs = useRef<Map<string, HTMLInputElement | HTMLTextAreaElement>>(new Map());

  // Metrics
  const plainText = useMemo(() => extractPlainText(doc), [doc]);
  const wordCount = useMemo(() => calculateWordCount(plainText), [plainText]);
  const charCount = useMemo(() => calculateCharCount(plainText), [plainText]);
  const displayTitle = useMemo(
    () => resolveNoteTitle(title, 'Untitled', plainText),
    [title, plainText]
  );

  // Keep focus and selection stable during autosave
  const debouncedSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Autosave with 600ms debounce
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

  // Flush save on unmount if dirty
  useEffect(() => {
    return () => {
      if (isDirtyRef.current) {
        triggerSave();
      }
    };
  }, [triggerSave]);

  // Focus management
  const focusBlock = (blockId: string, atEnd = false) => {
    setActiveBlockId(blockId);
    setTimeout(() => {
      const el = blockRefs.current.get(blockId);
      if (el) {
        el.focus();
        if (atEnd) {
          const len = el.value.length;
          el.setSelectionRange(len, len);
        }
      }
    }, 0);
  };

  // Push to undo stack before mutating
  const mutateDoc = (updater: (prev: NoteDocument) => NoteDocument) => {
    setDoc((prev: NoteDocument) => {
      const next = updater(prev);
      setUndoStack((u) => [...u.slice(-30), prev]);
      setRedoStack([]);
      return next;
    });
    isDirtyRef.current = true;
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    if (!previous) return;
    setUndoStack((u) => u.slice(0, -1));
    setRedoStack((r) => [...r, doc]);
    setDoc(previous);
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

  // 2. Block Mutation Handlers
  const updateBlockText = (blockId: string, newText: string) => {
    if (readOnly) return;
    isDirtyRef.current = true;
    setDoc((prev: NoteDocument) => {
      const newContent: NoteBlockNode[] = prev.content.map((b: NoteBlockNode): NoteBlockNode => {
        if (b.id !== blockId) {
          if (b.type === 'bullet_list' || b.type === 'ordered_list') {
            const updatedItems: NoteListItemNode[] = b.items.map((it: NoteListItemNode) =>
              it.id === blockId
                ? { ...it, content: [{ type: 'text' as const, text: newText }] }
                : it
            );
            return { ...b, items: updatedItems };
          }
          if (b.type === 'checklist') {
            const updatedItems: NoteChecklistItemNode[] = b.items.map(
              (it: NoteChecklistItemNode) =>
                it.id === blockId
                  ? { ...it, content: [{ type: 'text' as const, text: newText }] }
                  : it
            );
            return { ...b, items: updatedItems };
          }
          return b;
        }

        if (b.type === 'paragraph' || b.type === 'heading') {
          return {
            ...b,
            content: [{ type: 'text' as const, text: newText }],
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

  // Toggle bold for active block
  const toggleBlockBold = () => {
    if (readOnly || !activeBlockId) return;
    mutateDoc((prev: NoteDocument) => {
      const newContent: NoteBlockNode[] = prev.content.map((b: NoteBlockNode): NoteBlockNode => {
        if (b.id === activeBlockId && (b.type === 'paragraph' || b.type === 'heading')) {
          const currentTextNode = b.content?.[0] as NoteTextInline | undefined;
          const marks = currentTextNode?.marks || [];
          const hasBold = marks.includes('bold');
          const nextMarks = hasBold
            ? marks.filter((m: string) => m !== 'bold')
            : [...marks, 'bold' as const];
          return {
            ...b,
            content: [
              {
                type: 'text',
                text: currentTextNode?.text || '',
                marks: nextMarks.length > 0 ? nextMarks : undefined,
              },
            ],
          };
        }
        return b;
      });
      return { ...prev, content: newContent };
    });
  };

  // Convert current block type
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

  // Keyboard shortcut formatting (Ctrl+S, Ctrl+Z, Ctrl+Y, Enter split)
  const handleKeyDown = (e: React.KeyboardEvent, blockId: string) => {
    if (isComposingRef.current) return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      triggerSave();
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

      focusBlock(newId);
    }
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
            title="Normal text"
            onClick={() => setBlockType('paragraph')}
            data-testid="format-paragraph"
            style={{
              padding: '6px 10px',
              borderRadius: `${radii.sm}px`,
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: palette.surface,
              color: palette.text.primary,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            ¶
          </button>
          <button
            type="button"
            aria-label="Heading 1"
            title="Heading 1"
            onClick={() => setBlockType('h1')}
            data-testid="format-h1"
            style={{
              padding: '6px 10px',
              borderRadius: `${radii.sm}px`,
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: palette.surface,
              color: palette.text.primary,
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            H1
          </button>
          <button
            type="button"
            aria-label="Heading 2"
            title="Heading 2"
            onClick={() => setBlockType('h2')}
            data-testid="format-h2"
            style={{
              padding: '6px 10px',
              borderRadius: `${radii.sm}px`,
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: palette.surface,
              color: palette.text.primary,
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            H2
          </button>
          <button
            type="button"
            aria-label="Heading 3"
            title="Heading 3"
            onClick={() => setBlockType('h3')}
            data-testid="format-h3"
            style={{
              padding: '6px 10px',
              borderRadius: `${radii.sm}px`,
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: palette.surface,
              color: palette.text.primary,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            H3
          </button>
          <button
            type="button"
            aria-label="Bold text"
            title="Toggle bold (Ctrl+B)"
            onClick={toggleBlockBold}
            data-testid="format-bold"
            style={{
              padding: '6px 10px',
              borderRadius: `${radii.sm}px`,
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: palette.surface,
              color: palette.text.primary,
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            B
          </button>
          <button
            type="button"
            aria-label="Bullet list"
            title="Bullet list"
            onClick={() => setBlockType('bullet')}
            data-testid="format-bullet"
            style={{
              padding: '6px 10px',
              borderRadius: `${radii.sm}px`,
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: palette.surface,
              color: palette.text.primary,
              cursor: 'pointer',
            }}
          >
            • List
          </button>
          <button
            type="button"
            aria-label="Numbered list"
            title="Numbered list"
            onClick={() => setBlockType('ordered')}
            data-testid="format-ordered"
            style={{
              padding: '6px 10px',
              borderRadius: `${radii.sm}px`,
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: palette.surface,
              color: palette.text.primary,
              cursor: 'pointer',
            }}
          >
            1. List
          </button>
          <button
            type="button"
            aria-label="Checklist"
            title="Checklist"
            onClick={() => setBlockType('checklist')}
            data-testid="format-checklist"
            style={{
              padding: '6px 10px',
              borderRadius: `${radii.sm}px`,
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: palette.surface,
              color: palette.text.primary,
              cursor: 'pointer',
            }}
          >
            ☑ Checklist
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
                  setFolderId(e.target.value ? e.target.value : null);
                  isDirtyRef.current = true;
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
            isDirtyRef.current = true;
          }}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
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
                const textNode = block.content?.[0] as NoteTextInline | undefined;
                const text = textNode?.type === 'text' ? textNode.text : '';
                const isBold = textNode?.marks?.includes('bold');
                return (
                  <textarea
                    key={blockId}
                    ref={(el) => {
                      if (el) blockRefs.current.set(blockId, el);
                    }}
                    value={text}
                    placeholder="Type your thought..."
                    disabled={readOnly}
                    rows={1}
                    onFocus={() => setActiveBlockId(blockId)}
                    onChange={(e) => updateBlockText(blockId, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, blockId)}
                    onCompositionStart={() => {
                      isComposingRef.current = true;
                    }}
                    onCompositionEnd={() => {
                      isComposingRef.current = false;
                    }}
                    data-testid={`block-paragraph-${blockId}`}
                    aria-label="Paragraph block"
                    style={{
                      width: '100%',
                      fontSize: `${typography.webScale.body}px`,
                      fontWeight: isBold ? 700 : 400,
                      lineHeight: typography.lineHeight.bangla,
                      border: 'none',
                      outline: 'none',
                      resize: 'none',
                      backgroundColor: 'transparent',
                      color: palette.text.primary,
                      fontFamily: typography.fontFamily.sans,
                      overflow: 'hidden',
                      minHeight: '28px',
                    }}
                  />
                );
              }
              case 'heading': {
                const blockId = block.id || 'h-0';
                const textNode = block.content?.[0] as NoteTextInline | undefined;
                const text = textNode?.type === 'text' ? textNode.text : '';
                const fontSize =
                  block.level === 1
                    ? `${typography.webScale.pageTitle}px`
                    : block.level === 2
                      ? `${typography.webScale.sectionHeading}px`
                      : `${typography.webScale.body + 2}px`;
                return (
                  <input
                    key={blockId}
                    ref={(el) => {
                      if (el) blockRefs.current.set(blockId, el);
                    }}
                    type="text"
                    value={text}
                    placeholder={`Heading ${block.level}...`}
                    disabled={readOnly}
                    onFocus={() => setActiveBlockId(blockId)}
                    onChange={(e) => updateBlockText(blockId, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, blockId)}
                    onCompositionStart={() => {
                      isComposingRef.current = true;
                    }}
                    onCompositionEnd={() => {
                      isComposingRef.current = false;
                    }}
                    data-testid={`block-heading-${blockId}`}
                    aria-label={`Heading ${block.level} block`}
                    aria-level={block.level}
                    style={{
                      width: '100%',
                      fontSize,
                      fontWeight: 700,
                      border: 'none',
                      outline: 'none',
                      backgroundColor: 'transparent',
                      color: palette.text.primary,
                      fontFamily: typography.fontFamily.sans,
                    }}
                  />
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
                      const text = it.content?.[0]?.type === 'text' ? it.content[0].text : '';
                      const itemId = it.id || 'li-0';
                      return (
                        <li key={itemId} style={{ color: palette.text.primary }}>
                          <input
                            ref={(el) => {
                              if (el) blockRefs.current.set(itemId, el);
                            }}
                            type="text"
                            value={text}
                            placeholder="List item..."
                            disabled={readOnly}
                            onFocus={() => setActiveBlockId(itemId)}
                            onChange={(e) => updateBlockText(itemId, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, itemId)}
                            onCompositionStart={() => {
                              isComposingRef.current = true;
                            }}
                            onCompositionEnd={() => {
                              isComposingRef.current = false;
                            }}
                            data-testid={`block-listitem-${itemId}`}
                            aria-label="Bullet list item"
                            style={{
                              width: '100%',
                              border: 'none',
                              outline: 'none',
                              backgroundColor: 'transparent',
                              color: palette.text.primary,
                              fontSize: `${typography.webScale.body}px`,
                              fontFamily: typography.fontFamily.sans,
                            }}
                          />
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
                      const text = it.content?.[0]?.type === 'text' ? it.content[0].text : '';
                      const itemId = it.id || 'oli-0';
                      return (
                        <li key={itemId} style={{ color: palette.text.primary }}>
                          <input
                            ref={(el) => {
                              if (el) blockRefs.current.set(itemId, el);
                            }}
                            type="text"
                            value={text}
                            placeholder="Numbered item..."
                            disabled={readOnly}
                            onFocus={() => setActiveBlockId(itemId)}
                            onChange={(e) => updateBlockText(itemId, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, itemId)}
                            onCompositionStart={() => {
                              isComposingRef.current = true;
                            }}
                            onCompositionEnd={() => {
                              isComposingRef.current = false;
                            }}
                            data-testid={`block-ordereditem-${itemId}`}
                            aria-label="Ordered list item"
                            style={{
                              width: '100%',
                              border: 'none',
                              outline: 'none',
                              backgroundColor: 'transparent',
                              color: palette.text.primary,
                              fontSize: `${typography.webScale.body}px`,
                              fontFamily: typography.fontFamily.sans,
                            }}
                          />
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
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: `${spacing.xs}px`,
                    }}
                  >
                    {block.items.map((it: NoteChecklistItemNode) => {
                      const text = it.content?.[0]?.type === 'text' ? it.content[0].text : '';
                      const itemId = it.id || 'cli-0';
                      return (
                        <div
                          key={itemId}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: `${spacing.sm}px`,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={it.checked}
                            disabled={readOnly}
                            onChange={(e) => toggleChecklistItem(itemId, e.target.checked)}
                            data-testid={`checkbox-${itemId}`}
                            aria-label={`Checkbox for ${text || 'item'}`}
                            style={{
                              width: '18px',
                              height: '18px',
                              cursor: 'pointer',
                            }}
                          />
                          <input
                            ref={(el) => {
                              if (el) blockRefs.current.set(itemId, el);
                            }}
                            type="text"
                            value={text}
                            placeholder="To-do item..."
                            disabled={readOnly}
                            onFocus={() => setActiveBlockId(itemId)}
                            onChange={(e) => updateBlockText(itemId, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, itemId)}
                            onCompositionStart={() => {
                              isComposingRef.current = true;
                            }}
                            onCompositionEnd={() => {
                              isComposingRef.current = false;
                            }}
                            data-testid={`block-checklistitem-${itemId}`}
                            aria-label="Checklist item text"
                            style={{
                              flex: 1,
                              border: 'none',
                              outline: 'none',
                              backgroundColor: 'transparent',
                              color: it.checked ? palette.text.secondary : palette.text.primary,
                              textDecoration: it.checked ? 'line-through' : 'none',
                              fontSize: `${typography.webScale.body}px`,
                              fontFamily: typography.fontFamily.sans,
                            }}
                          />
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
