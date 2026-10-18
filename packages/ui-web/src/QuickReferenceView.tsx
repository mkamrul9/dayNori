import React, { useState, useCallback, useId } from 'react';
import {
  type NoteDocument,
  type QuickReferenceSection,
  type QuickReferenceEntry,
  type ResolvedItemLink,
  extractQuickReferenceSections,
  formatUnavailableLinkNotice,
} from '@daynori/domain';
import { colors, type ThemeMode } from '@daynori/design-tokens';

export interface QuickReferenceViewProps {
  themeMode: ThemeMode;
  noteId: string;
  title: string;
  document: NoteDocument;
  folderName?: string | null;
  isPinned?: boolean;
  tags?: string[];
  links?: ResolvedItemLink[];
  onNavigateToItem?: (itemId: string) => void;
  onEditNote?: () => void;
  testID?: string;
}

export const QuickReferenceView: React.FC<QuickReferenceViewProps> = ({
  themeMode,
  noteId: _noteId,
  title,
  document,
  folderName,
  isPinned = false,
  tags = [],
  links = [],
  onNavigateToItem,
  onEditNote,
  testID = 'quick-reference-view',
}) => {
  const palette = colors[themeMode];
  const liveRegionId = useId();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string>('');

  const sections: QuickReferenceSection[] = extractQuickReferenceSections(document);

  const handleCopy = useCallback(async (entry: QuickReferenceEntry) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(entry.copyableText);
        setCopiedId(entry.id);
        setAnnouncement(`Copied ${entry.label} to clipboard.`);
        setTimeout(() => {
          setCopiedId((prev) => (prev === entry.id ? null : prev));
        }, 2000);
      } else {
        setAnnouncement('Clipboard unavailable.');
      }
    } catch {
      setAnnouncement('Failed to copy to clipboard.');
    }
  }, []);

  const outgoingLinks = links.filter((l) => l.direction === 'outgoing');
  const incomingLinks = links.filter((l) => l.direction === 'incoming');

  return (
    <article
      data-testid={testID}
      aria-labelledby="qr-title"
      style={{
        backgroundColor: palette.surface,
        color: palette.text.primary,
        borderRadius: 8,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        border: `1px solid ${palette.border.subtle}`,
      }}
    >
      {/* Screen-reader live region */}
      <div
        id={liveRegionId}
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          margin: -1,
          padding: 0,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          border: 0,
        }}
      >
        {announcement}
      </div>

      {/* Header */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 12,
          borderBottom: `1px solid ${palette.border.subtle}`,
          paddingBottom: 16,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            {folderName && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: palette.text.secondary,
                  backgroundColor: palette.surfaceRaised,
                  padding: '2px 8px',
                  borderRadius: 4,
                  border: `1px solid ${palette.border.subtle}`,
                }}
              >
                📁 {folderName}
              </span>
            )}
            {isPinned && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: palette.action.primary,
                  backgroundColor: palette.action.subtle,
                  padding: '2px 8px',
                  borderRadius: 4,
                }}
              >
                📌 Pinned
              </span>
            )}
            {tags.map((t) => (
              <span
                key={t}
                style={{
                  fontSize: 12,
                  color: palette.text.secondary,
                  backgroundColor: palette.surfaceRaised,
                  padding: '2px 6px',
                  borderRadius: 4,
                  border: `1px solid ${palette.border.subtle}`,
                }}
              >
                #{t}
              </span>
            ))}
          </div>

          <h1
            id="qr-title"
            data-testid="qr-title"
            style={{
              fontSize: 24,
              fontWeight: 700,
              margin: 0,
              color: palette.text.primary,
            }}
          >
            {title || 'Untitled Reference'}
          </h1>
        </div>

        {onEditNote && (
          <button
            type="button"
            onClick={onEditNote}
            data-testid="qr-edit-button"
            style={{
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 6,
              border: `1px solid ${palette.border.strong}`,
              backgroundColor: palette.surfaceRaised,
              color: palette.text.primary,
              cursor: 'pointer',
            }}
          >
            ✏️ Edit Note
          </button>
        )}
      </header>

      {/* Quick Reference Sections */}
      {sections.length === 0 ? (
        <div
          data-testid="qr-empty-state"
          style={{
            padding: 32,
            textAlign: 'center',
            color: palette.text.secondary,
          }}
        >
          No reference sections or commands detected. Add headings, lists, or syntax items to format
          this note as a quick reference.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {sections.map((sec) => (
            <section
              key={sec.id}
              data-testid={`qr-section-${sec.id}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <h2
                style={{
                  fontSize: sec.level === 1 ? 18 : 16,
                  fontWeight: 600,
                  margin: 0,
                  color: palette.action.primary,
                  borderBottom: `1px dashed ${palette.border.subtle}`,
                  paddingBottom: 4,
                }}
              >
                {sec.title}
              </h2>

              {/* Code / Command Entries */}
              {sec.entries.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sec.entries.map((entry) => {
                    const isCopied = copiedId === entry.id;
                    return (
                      <div
                        key={entry.id}
                        data-testid={`qr-entry-${entry.id}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          backgroundColor: palette.surfaceRaised,
                          padding: '10px 14px',
                          borderRadius: 6,
                          border: `1px solid ${palette.border.subtle}`,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 2,
                            minWidth: 0,
                            flex: 1,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: palette.text.primary,
                            }}
                          >
                            {entry.label}
                          </span>
                          <code
                            style={{
                              fontFamily: 'monospace',
                              fontSize: 13,
                              color: palette.action.primary,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-all',
                            }}
                          >
                            {entry.codeOrValue}
                          </code>
                          {entry.description && (
                            <span style={{ fontSize: 11, color: palette.text.secondary }}>
                              {entry.description}
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => void handleCopy(entry)}
                          data-testid={`qr-copy-button-${entry.id}`}
                          aria-label={`Copy ${entry.label}`}
                          style={{
                            padding: '6px 12px',
                            fontSize: 12,
                            fontWeight: 600,
                            borderRadius: 4,
                            border: `1px solid ${isCopied ? palette.action.primary : palette.border.strong}`,
                            backgroundColor: isCopied ? palette.action.primary : palette.surface,
                            color: isCopied ? palette.text.inverse : palette.text.primary,
                            cursor: 'pointer',
                            flexShrink: 0,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {isCopied ? '✓ Copied!' : 'Copy'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Checklist Entries */}
              {sec.checklistItems.length > 0 && (
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  {sec.checklistItems.map((chk) => (
                    <li
                      key={chk.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 13,
                        color: palette.text.primary,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={chk.checked}
                        readOnly
                        aria-label={chk.text}
                        style={{ cursor: 'default' }}
                      />
                      <span
                        style={{
                          textDecoration: chk.checked ? 'line-through' : 'none',
                          color: chk.checked ? palette.text.muted : palette.text.primary,
                        }}
                      >
                        {chk.text}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      {/* Links & Backlinks Section */}
      <section
        data-testid="qr-links-section"
        style={{
          borderTop: `1px solid ${palette.border.subtle}`,
          paddingTop: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <h3
          style={{
            fontSize: 14,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            margin: 0,
            color: palette.text.secondary,
          }}
        >
          Internal Links & Backlinks
        </h3>

        {links.length === 0 ? (
          <p style={{ fontSize: 13, color: palette.text.secondary, margin: 0 }}>
            No internal item links or backlinks recorded for this guide.
          </p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {/* Outgoing Links */}
            <div>
              <h4
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: palette.text.secondary,
                  margin: '0 0 8px 0',
                }}
              >
                Referenced Items ({outgoingLinks.length})
              </h4>
              {outgoingLinks.length === 0 ? (
                <span style={{ fontSize: 12, color: palette.text.muted }}>None</span>
              ) : (
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  {outgoingLinks.map((link) => (
                    <li key={link.id}>
                      {link.target.isAvailable ? (
                        <button
                          type="button"
                          onClick={() => onNavigateToItem?.(link.target.id)}
                          data-testid={`qr-link-${link.target.id}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 8px',
                            borderRadius: 4,
                            border: `1px solid ${palette.border.subtle}`,
                            backgroundColor: palette.surfaceRaised,
                            color: palette.text.primary,
                            fontSize: 12,
                            fontWeight: 500,
                            cursor: onNavigateToItem ? 'pointer' : 'default',
                            textAlign: 'left',
                            width: '100%',
                          }}
                        >
                          <span>🔗</span>
                          <span style={{ fontWeight: 600 }}>{link.target.title}</span>
                          <span style={{ color: palette.text.secondary, fontSize: 11 }}>
                            ({link.target.kind})
                          </span>
                        </button>
                      ) : (
                        <div
                          data-testid={`qr-unavailable-link-${link.target.id}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 8px',
                            borderRadius: 4,
                            border: `1px dashed ${palette.border.strong}`,
                            backgroundColor: palette.surface,
                            color: palette.text.muted,
                            fontSize: 12,
                          }}
                        >
                          <span>⚠️</span>
                          <span style={{ textDecoration: 'line-through' }}>
                            {link.target.title}
                          </span>
                          <span style={{ fontSize: 11, color: palette.text.secondary }}>
                            — {formatUnavailableLinkNotice(link.target.unavailableReason)}
                          </span>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Incoming Backlinks */}
            <div>
              <h4
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: palette.text.secondary,
                  margin: '0 0 8px 0',
                }}
              >
                Backlinks ({incomingLinks.length})
              </h4>
              {incomingLinks.length === 0 ? (
                <span style={{ fontSize: 12, color: palette.text.muted }}>None</span>
              ) : (
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  {incomingLinks.map((link) => (
                    <li key={link.id}>
                      {link.target.isAvailable ? (
                        <button
                          type="button"
                          onClick={() => onNavigateToItem?.(link.target.id)}
                          data-testid={`qr-backlink-${link.target.id}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 8px',
                            borderRadius: 4,
                            border: `1px solid ${palette.border.subtle}`,
                            backgroundColor: palette.surfaceRaised,
                            color: palette.text.primary,
                            fontSize: 12,
                            fontWeight: 500,
                            cursor: onNavigateToItem ? 'pointer' : 'default',
                            textAlign: 'left',
                            width: '100%',
                          }}
                        >
                          <span>↩️</span>
                          <span style={{ fontWeight: 600 }}>{link.target.title}</span>
                          <span style={{ color: palette.text.secondary, fontSize: 11 }}>
                            ({link.target.kind})
                          </span>
                        </button>
                      ) : (
                        <div
                          data-testid={`qr-unavailable-backlink-${link.target.id}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 8px',
                            borderRadius: 4,
                            border: `1px dashed ${palette.border.strong}`,
                            backgroundColor: palette.surface,
                            color: palette.text.muted,
                            fontSize: 12,
                          }}
                        >
                          <span>⚠️</span>
                          <span style={{ textDecoration: 'line-through' }}>
                            {link.target.title}
                          </span>
                          <span style={{ fontSize: 11, color: palette.text.secondary }}>
                            — {formatUnavailableLinkNotice(link.target.unavailableReason)}
                          </span>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>
    </article>
  );
};
