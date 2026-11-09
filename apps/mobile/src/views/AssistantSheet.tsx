import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import { MobileButton, Icon } from '@daynori/ui-mobile';
import type { AiCitation, AiSelectedSources, AiProposal } from '@daynori/contracts';
import {
  ASSISTANT_STARTER_SUGGESTIONS,
  sanitizeAssistantMarkdown,
  type StarterSuggestion,
} from '@daynori/domain';
import type { DaynoriApiClient } from '@daynori/api-client';

export interface AssistantSheetProps {
  themeMode: ThemeMode;
  workspaceId: string;
  apiClient: DaynoriApiClient;
  onClose: () => void;
  onOpenSource?: (kind: string, itemId: string) => void;
  testID?: string;
}

/**
 * Android assistant UI (Phase 92 grounded chat & contextual guidance).
 * Strict read-only guidance: zero automatic writes.
 * Real-time streaming transport, sanitized text, citation verification,
 * selected source toggles, and starter suggestion pills.
 */
export function AssistantSheet({
  themeMode,
  workspaceId,
  apiClient,
  onClose,
  onOpenSource,
  testID = 'assistant-sheet',
}: AssistantSheetProps) {
  const palette = colors[themeMode];
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [citations, setCitations] = useState<AiCitation[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [turnMeta, setTurnMeta] = useState<{
    turnId: string;
    providerMode: string;
    label: string;
  } | null>(null);

  const [selectedSources, setSelectedSources] = useState<AiSelectedSources>({
    help: true,
    notes: true,
    tasks: true,
    journal: true,
  });

  const [history, setHistory] = useState<
    Array<{ id: string; question: string; answer: string; abstained: boolean }>
  >([]);

  const [proposal, setProposal] = useState<AiProposal | null>(null);
  const [isEditingProposal, setIsEditingProposal] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editDate, setEditDate] = useState('');
  const [proposalBusy, setProposalBusy] = useState(false);

  const askAbortRef = useRef<AbortController | null>(null);

  const refreshHistory = useCallback(async () => {
    try {
      const res = await apiClient.listAssistantHistory(workspaceId);
      setHistory(
        res.data.map((t) => ({
          id: t.id,
          question: t.question,
          answer: t.answer,
          abstained: t.abstained,
        }))
      );
    } catch {
      /* history optional */
    }
  }, [apiClient, workspaceId]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    let cancelled = false;
    void apiClient
      .getAssistantDraft(workspaceId)
      .then((res) => {
        if (cancelled) return;
        if (res.data?.draftQuestion) setQuestion(res.data.draftQuestion);
        setDraftReady(true);
      })
      .catch(() => {
        if (!cancelled) setDraftReady(true);
      });
    return () => {
      cancelled = true;
      askAbortRef.current?.abort();
    };
  }, [apiClient, workspaceId]);

  useEffect(() => {
    if (!draftReady) return;
    const t = setTimeout(() => {
      if (!question.trim()) {
        void apiClient.clearAssistantDraft({ workspaceId }).catch(() => undefined);
        return;
      }
      void apiClient
        .saveAssistantDraft({ workspaceId, draftQuestion: question })
        .catch(() => undefined);
    }, 800);
    return () => clearTimeout(t);
  }, [apiClient, workspaceId, question, draftReady]);

  const ask = useCallback(
    async (overrideQuestion?: string) => {
      const q = (overrideQuestion ?? question).trim();
      if (!q) return;

      askAbortRef.current?.abort();
      const ac = new AbortController();
      askAbortRef.current = ac;
      setBusy(true);
      setMessage(null);
      setCitations([]);
      setStreamingText('');
      setAnswer(null);
      setTurnMeta(null);

      try {
        await apiClient.streamAssistantAsk(
          {
            workspaceId,
            question: q,
            selectedSources,
          },
          {
            onEvent: (ev) => {
              if (ev.type === 'start') {
                setTurnMeta({
                  turnId: ev.turnId,
                  providerMode: ev.providerMode,
                  label: ev.label,
                });
              } else if (ev.type === 'context') {
                setCitations(ev.citations);
              } else if (ev.type === 'chunk') {
                setStreamingText((prev) => prev + ev.text);
              } else if (ev.type === 'done') {
                setAnswer(ev.answer);
                setStreamingText('');
                setCitations(ev.citations);
                void refreshHistory();
              } else if (ev.type === 'error') {
                setMessage(`${ev.error.code}: ${ev.error.message}`);
              }
            },
            onError: (err) => {
              setMessage(
                ac.signal.aborted
                  ? 'Ask cancelled. Draft kept. Content already sent cannot be recalled.'
                  : err.message || 'Ask failed'
              );
            },
          },
          { signal: ac.signal }
        );
      } catch (err) {
        setMessage(
          ac.signal.aborted
            ? 'Ask cancelled. Draft kept.'
            : err instanceof Error
              ? err.message
              : 'Ask failed'
        );
      } finally {
        if (askAbortRef.current === ac) askAbortRef.current = null;
        setBusy(false);
      }
    },
    [apiClient, question, workspaceId, selectedSources, refreshHistory]
  );

  const cancelAsk = useCallback(() => {
    askAbortRef.current?.abort();
    setMessage('Cancel requested for in-flight ask.');
  }, []);

  const openCitation = useCallback(
    async (c: AiCitation) => {
      try {
        const access = await apiClient.checkAiSourceAccess({
          workspaceId,
          itemId: c.itemId,
        });
        if (!access.data.accessible) {
          setMessage(
            `Source unavailable (${access.data.reason ?? 'unknown'}). It may be deleted or no longer indexed.`
          );
          return;
        }
        if (onOpenSource && access.data.kind) {
          onOpenSource(access.data.kind, c.itemId);
        } else {
          setMessage(`Source verified: ${access.data.kind} ${c.itemId.slice(0, 8)}…`);
        }
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Could not open source');
      }
    },
    [apiClient, onOpenSource, workspaceId]
  );

  const deleteTurn = useCallback(
    async (turnId: string) => {
      try {
        await apiClient.deleteAssistantHistory({ workspaceId, turnId });
        setHistory((prev) => prev.filter((h) => h.id !== turnId));
        setMessage('Turn deleted from assistant history.');
      } catch (err) {
        setMessage('Failed to delete turn');
      }
    },
    [apiClient, workspaceId]
  );

  const clearHistory = useCallback(async () => {
    try {
      await apiClient.deleteAssistantHistory({ workspaceId });
      setHistory([]);
      setMessage('Assistant history cleared.');
    } catch (err) {
      setMessage('Failed to clear history');
    }
  }, [apiClient, workspaceId]);

  const startEditProposal = useCallback(() => {
    if (!proposal) return;
    const p = proposal.payload as Record<string, unknown>;
    setEditTitle(String(p['title'] ?? ''));
    setEditContent(String(p['plainText'] ?? p['details'] ?? ''));
    setEditDate(String(p['entryDate'] ?? p['dueDate'] ?? ''));
    setIsEditingProposal(true);
  }, [proposal]);

  const saveEditedProposal = useCallback(async () => {
    if (!proposal) return;
    setProposalBusy(true);
    try {
      const p = proposal.payload as Record<string, unknown>;
      const updatedPayload: Record<string, unknown> = {
        ...p,
        title: editTitle.trim(),
      };
      if (proposal.operation === 'create_personal_journal_entry') {
        if (editDate) updatedPayload['entryDate'] = editDate.trim();
        updatedPayload['plainText'] = editContent;
      } else if (proposal.operation === 'create_personal_note') {
        updatedPayload['plainText'] = editContent;
      } else if (proposal.operation === 'create_personal_task' || proposal.operation === 'update_personal_task') {
        if (editDate) updatedPayload['dueDate'] = editDate.trim();
        updatedPayload['details'] = editContent;
      }

      const res = await apiClient.updateAiProposal(proposal.id, { payload: updatedPayload });
      setProposal(res.data);
      setIsEditingProposal(false);
      setMessage('Proposal updated. Review and confirm to execute.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to update proposal');
    } finally {
      setProposalBusy(false);
    }
  }, [proposal, editTitle, editContent, editDate, apiClient]);

  const confirmProposal = useCallback(async () => {
    if (!proposal) return;
    setProposalBusy(true);
    try {
      const res = await apiClient.confirmAiProposal(proposal.id, { confirmationToken: proposal.confirmationToken });
      setProposal(res.data);
      setMessage('Action confirmed and saved! Cloud mutation receipt created.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Confirmation failed');
    } finally {
      setProposalBusy(false);
    }
  }, [proposal, apiClient]);

  const cancelProposal = useCallback(async () => {
    if (!proposal) return;
    setProposalBusy(true);
    try {
      const res = await apiClient.cancelAiProposal(proposal.id);
      setProposal(res.data);
      setIsEditingProposal(false);
      setMessage('Proposal cancelled. No items were created or modified.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to cancel proposal');
    } finally {
      setProposalBusy(false);
    }
  }, [proposal, apiClient]);

  const openCreatedItem = useCallback(() => {
    if (!proposal || !proposal.executionReceipt) return;
    const r = proposal.executionReceipt as Record<string, unknown>;
    const kind = String(r['kind'] ?? 'note');
    const id = String(r['id']);
    onOpenSource?.(kind, id);
  }, [proposal, onOpenSource]);

  const createProposalQuick = useCallback(
    async (op: 'note' | 'task' | 'journal') => {
      setProposalBusy(true);
      setMessage(null);
      try {
        const today = new Date().toISOString().slice(0, 10);
        let res;
        if (op === 'task') {
          res = await apiClient.createAiProposal({
            workspaceId,
            operation: 'create_personal_task',
            payload: {
              title: question.trim() || 'New task',
              details: 'Created from reviewed assistant proposal',
              priority: 'normal',
              status: 'todo',
            },
          });
        } else if (op === 'note') {
          res = await apiClient.createAiProposal({
            workspaceId,
            operation: 'create_personal_note',
            payload: {
              title: question.trim() || 'New note',
              plainText: 'Draft note created from reviewed assistant proposal',
            },
          });
        } else {
          res = await apiClient.createAiProposal({
            workspaceId,
            operation: 'create_personal_journal_entry',
            payload: {
              entryDate: today,
              title: question.trim() || null,
              plainText: question.trim()
                ? `Journal entry: ${question.trim()}`
                : 'Today’s thoughts and reflections.',
              timezone: 'UTC',
            },
          });
        }
        setProposal(res.data);
        setIsEditingProposal(false);
        setMessage('Review proposal below. No data is saved until you confirm.');
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Could not create proposal');
      } finally {
        setProposalBusy(false);
      }
    },
    [workspaceId, question, apiClient]
  );

  const sanitizedDisplay = useMemo(() => {
    const raw = streamingText || answer || '';
    return sanitizeAssistantMarkdown(raw);
  }, [streamingText, answer]);

  return (
    <ScrollView
      testID={testID}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
      accessibilityLabel="Assistant provisional local"
    >
      <Text style={[styles.title, { color: palette.text.primary }]}>
        Daynori Assistant
      </Text>
      <Text style={[styles.body, { color: palette.text.secondary }]}>
        Personal-workspace answers with verified source links. Fake/gated provider — not evaluated live
        intelligence. Vault is never accessed. Strictly read-only guidance.
      </Text>

      {message ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.body, { color: palette.text.primary, marginBottom: spacing.sm }]}
        >
          {message}
        </Text>
      ) : null}

      {/* Selected Knowledge Sources */}
      <View style={[styles.sourcesBox, { borderColor: palette.border.subtle }]}>
        <Text style={[styles.sourceHeader, { color: palette.text.primary }]}>
          Knowledge Sources (only checked sources queried):
        </Text>
        <View style={styles.sourceRow}>
          <TouchableOpacity
            onPress={() => setSelectedSources((prev) => ({ ...prev, help: !prev.help }))}
            style={[styles.chip, selectedSources.help !== false && styles.chipActive]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {selectedSources.help !== false ? <Icon name="check" size={12} color={palette.text.primary} /> : null}
              <Text style={{ fontSize: 12, color: palette.text.primary }}>Help Guides</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setSelectedSources((prev) => ({ ...prev, notes: !prev.notes }))}
            style={[styles.chip, selectedSources.notes !== false && styles.chipActive]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {selectedSources.notes !== false ? <Icon name="check" size={12} color={palette.text.primary} /> : null}
              <Text style={{ fontSize: 12, color: palette.text.primary }}>Notes</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setSelectedSources((prev) => ({ ...prev, tasks: !prev.tasks }))}
            style={[styles.chip, selectedSources.tasks !== false && styles.chipActive]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {selectedSources.tasks !== false ? <Icon name="check" size={12} color={palette.text.primary} /> : null}
              <Text style={{ fontSize: 12, color: palette.text.primary }}>Tasks</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setSelectedSources((prev) => ({ ...prev, journal: !prev.journal }))}
            style={[styles.chip, selectedSources.journal !== false && styles.chipActive]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {selectedSources.journal !== false ? <Icon name="check" size={12} color={palette.text.primary} /> : null}
              <Text style={{ fontSize: 12, color: palette.text.primary }}>Journal</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Starter Suggestions */}
      <View style={{ marginBottom: spacing.sm }}>
        <Text style={[styles.sourceHeader, { color: palette.text.secondary }]}>
          Starter Suggestions:
        </Text>
        <View style={styles.sourceRow}>
          {ASSISTANT_STARTER_SUGGESTIONS.slice(0, 3).map((s: StarterSuggestion) => (
            <TouchableOpacity
              key={s.id}
              disabled={busy}
              onPress={() => {
                setQuestion(s.question);
                void ask(s.question);
              }}
              style={[styles.chip, { backgroundColor: palette.surfaceRaised }]}
            >
              <Text style={{ fontSize: 11, color: palette.text.primary }}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <Text style={[styles.label, { color: palette.text.primary }]}>Question</Text>
      <TextInput
        accessibilityLabel="Assistant question"
        value={question}
        onChangeText={setQuestion}
        multiline
        style={[
          styles.input,
          {
            color: palette.text.primary,
            borderColor: palette.border.subtle,
            backgroundColor: palette.surfaceRaised,
          },
        ]}
        placeholder="Ask about your organizer items or Daynori features..."
        placeholderTextColor={palette.text.secondary}
      />

      <MobileButton
        variant="primary"
        themeMode={themeMode}
        disabled={busy || !question.trim()}
        onPress={() => void ask()}
        accessibilityLabel="Ask assistant"
      >
        {busy ? 'Streaming...' : 'Ask'}
      </MobileButton>
      <MobileButton
        variant="secondary"
        themeMode={themeMode}
        disabled={!busy}
        onPress={cancelAsk}
        accessibilityLabel="Cancel in-flight ask"
      >
        Cancel ask
      </MobileButton>
      {answer && !busy ? (
        <MobileButton
          variant="secondary"
          themeMode={themeMode}
          onPress={() => void ask()}
          accessibilityLabel="Retry question"
        >
          Retry
        </MobileButton>
      ) : null}
      <MobileButton
        variant="secondary"
        themeMode={themeMode}
        onPress={onClose}
        accessibilityLabel="Close assistant"
      >
        Close
      </MobileButton>

      {/* Organizer Quick Proposals (Phase 93 Reviewed Creation) */}
      <View style={{ marginVertical: spacing.xs, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <TouchableOpacity
          disabled={proposalBusy}
          onPress={() => void createProposalQuick('note')}
          style={[styles.chip, { backgroundColor: palette.surfaceRaised }]}
        >
          <Text style={{ fontSize: 11, color: palette.text.primary }}>+ Note</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={proposalBusy}
          onPress={() => void createProposalQuick('task')}
          style={[styles.chip, { backgroundColor: palette.surfaceRaised }]}
        >
          <Text style={{ fontSize: 11, color: palette.text.primary }}>+ Task</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={proposalBusy}
          onPress={() => void createProposalQuick('journal')}
          style={[styles.chip, { backgroundColor: palette.surfaceRaised }]}
        >
          <Text style={{ fontSize: 11, color: palette.text.primary }}>+ Journal</Text>
        </TouchableOpacity>
      </View>

      {/* Proposal Review Card */}
      {proposal ? (
        <View
          testID="assistant-proposal-card"
          style={[
            styles.answerBox,
            {
              backgroundColor: palette.surface,
              borderColor:
                proposal.status === 'confirmed'
                  ? '#2e7d32'
                  : proposal.status === 'cancelled'
                  ? '#d32f2f'
                  : palette.border.subtle,
            },
          ]}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: palette.text.primary, flex: 1 }}>
              {proposal.reviewSummary.headline}
            </Text>
            <Text
              style={{
                fontSize: 10,
                fontWeight: '600',
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 4,
                backgroundColor:
                  proposal.status === 'confirmed'
                    ? '#e8f5e9'
                    : proposal.status === 'cancelled'
                    ? '#ffebee'
                    : '#fff8e1',
                color:
                  proposal.status === 'confirmed'
                    ? '#2e7d32'
                    : proposal.status === 'cancelled'
                    ? '#c62828'
                    : '#f57f17',
              }}
            >
              {proposal.status === 'confirmed'
                ? 'Saved (Cloud Persisted)'
                : proposal.status === 'cancelled'
                ? 'Cancelled'
                : 'Local Draft (Unsaved)'}
            </Text>
          </View>

          <Text style={{ fontSize: 11, color: palette.text.secondary, marginBottom: 4 }}>
            {proposal.reviewSummary.destination ? `Destination: ${proposal.reviewSummary.destination} ` : ''}
            {proposal.reviewSummary.date ? `• Date: ${proposal.reviewSummary.date} ` : ''}
            {proposal.reviewSummary.timezone ? `(${proposal.reviewSummary.timezone})` : ''}
          </Text>

          {isEditingProposal && proposal.status === 'pending' ? (
            <View style={{ marginVertical: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: palette.text.primary, marginBottom: 2 }}>
                Title
              </Text>
              <TextInput
                value={editTitle}
                onChangeText={setEditTitle}
                style={[styles.input, { backgroundColor: palette.surfaceRaised, color: palette.text.primary, height: 36, marginBottom: 4 }]}
              />

              {(proposal.operation === 'create_personal_journal_entry' ||
                proposal.operation === 'create_personal_task' ||
                proposal.operation === 'update_personal_task') && (
                <>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: palette.text.primary, marginBottom: 2 }}>
                    Date (YYYY-MM-DD)
                  </Text>
                  <TextInput
                    value={editDate}
                    onChangeText={setEditDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={palette.text.secondary}
                    style={[styles.input, { backgroundColor: palette.surfaceRaised, color: palette.text.primary, height: 36, marginBottom: 4 }]}
                  />
                </>
              )}

              <Text style={{ fontSize: 11, fontWeight: '600', color: palette.text.primary, marginBottom: 2 }}>
                Content / Details
              </Text>
              <TextInput
                value={editContent}
                onChangeText={setEditContent}
                multiline
                style={[styles.input, { backgroundColor: palette.surfaceRaised, color: palette.text.primary, height: 60, marginBottom: 4 }]}
              />

              <View style={{ flexDirection: 'row', gap: 6 }}>
                <MobileButton
                  variant="primary"
                  themeMode={themeMode}
                  disabled={proposalBusy}
                  onPress={() => void saveEditedProposal()}
                  accessibilityLabel="Save proposal changes"
                >
                  Save Changes
                </MobileButton>
                <MobileButton
                  variant="secondary"
                  themeMode={themeMode}
                  disabled={proposalBusy}
                  onPress={() => setIsEditingProposal(false)}
                  accessibilityLabel="Cancel editing proposal"
                >
                  Cancel Edit
                </MobileButton>
              </View>
            </View>
          ) : (
            <Text style={{ fontSize: 12, color: palette.text.primary, marginVertical: 4 }}>
              {proposal.reviewSummary.after}
            </Text>
          )}

          {proposal.status === 'pending' && !isEditingProposal ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              <MobileButton
                variant="primary"
                themeMode={themeMode}
                disabled={proposalBusy}
                onPress={() => void confirmProposal()}
                accessibilityLabel="Confirm and save proposal"
              >
                {proposalBusy ? 'Confirming...' : 'Confirm & Save'}
              </MobileButton>
              <MobileButton
                variant="secondary"
                themeMode={themeMode}
                disabled={proposalBusy}
                onPress={startEditProposal}
                accessibilityLabel="Edit proposal"
              >
                Edit
              </MobileButton>
              <MobileButton
                variant="secondary"
                themeMode={themeMode}
                disabled={proposalBusy}
                onPress={() => void cancelProposal()}
                accessibilityLabel="Cancel proposal"
              >
                Cancel
              </MobileButton>
            </View>
          ) : null}

          {proposal.status === 'confirmed' && proposal.executionReceipt ? (
            <View style={{ marginTop: 6 }}>
              <Text style={{ fontSize: 11, color: palette.text.secondary, marginBottom: 4 }}>
                Receipt: {String((proposal.executionReceipt as Record<string, unknown>)['operationId'] ?? proposal.id).slice(0, 8)}…
                • Rev: r{String((proposal.executionReceipt as Record<string, unknown>)['revision'] ?? 1)}
              </Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <MobileButton
                  variant="primary"
                  themeMode={themeMode}
                  onPress={openCreatedItem}
                  accessibilityLabel="Open created item"
                >
                  Open Created Item
                </MobileButton>
                <MobileButton
                  variant="secondary"
                  themeMode={themeMode}
                  onPress={() => setProposal(null)}
                  accessibilityLabel="Dismiss proposal card"
                >
                  Dismiss
                </MobileButton>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      {sanitizedDisplay ? (
        <View
          style={[
            styles.answerBox,
            { backgroundColor: palette.surfaceRaised, borderColor: palette.border.subtle },
          ]}
        >
          {turnMeta ? (
            <Text style={{ fontSize: 11, color: palette.text.secondary, marginBottom: 4 }}>
              [{turnMeta.label}] {turnMeta.providerMode}
            </Text>
          ) : null}
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.answerText, { color: palette.text.primary }]}
          >
            {sanitizedDisplay}
          </Text>
        </View>
      ) : null}

      {citations.length > 0 ? (
        <View accessibilityLabel="Authorized source links" style={{ marginTop: spacing.sm }}>
          <Text style={[styles.label, { color: palette.text.primary }]}>Referenced sources</Text>
          {citations.map((c) => (
            <MobileButton
              key={`${c.itemId}-${c.revision}`}
              variant="secondary"
              themeMode={themeMode}
              onPress={() => void openCitation(c)}
              accessibilityLabel={`Open source ${c.kind} revision ${c.revision}`}
            >
              {c.kind === 'help' ? `Help: ${c.itemId.replace(/^help:/, '')}` : `${c.kind} ${c.itemId.slice(0, 8)}… r${c.revision}`}
            </MobileButton>
          ))}
        </View>
      ) : null}

      {history.length > 0 ? (
        <View style={{ marginTop: spacing.md, borderTopWidth: 1, borderTopColor: palette.border.subtle, paddingTop: spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
            <Text style={[styles.label, { color: palette.text.primary, marginTop: 0 }]}>Recent turns</Text>
            <TouchableOpacity onPress={() => void clearHistory()}>
              <Text style={{ fontSize: 12, color: palette.text.secondary }}>Clear all</Text>
            </TouchableOpacity>
          </View>
          {history.slice(0, 4).map((h) => (
            <View key={h.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 2 }}>
              <Text style={{ fontSize: 12, color: palette.text.primary, flex: 1 }} numberOfLines={1}>
                Q: {h.question}
              </Text>
              <TouchableOpacity onPress={() => void deleteTurn(h.id)} accessibilityLabel="Delete turn" style={{ paddingLeft: 8 }}>
                <Icon name="x" size={14} color={palette.text.secondary} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.md, gap: spacing.sm },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 4 },
  body: { fontSize: 13, lineHeight: 18, marginBottom: spacing.sm },
  label: { fontSize: 14, fontWeight: '600', marginTop: spacing.sm },
  input: {
    minHeight: 88,
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: spacing.sm,
    textAlignVertical: 'top',
    marginBottom: spacing.sm,
  },
  sourcesBox: {
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  sourceHeader: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  sourceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#8884',
  },
  chipActive: {
    backgroundColor: '#8882',
  },
  answerBox: {
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  answerText: {
    fontSize: 13,
    lineHeight: 18,
  },
});
