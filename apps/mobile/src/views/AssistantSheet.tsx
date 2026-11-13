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
  formatAudioDuration,
  MockAudioRecorderAdapter,
  sanitizeAssistantMarkdown,
  type NativeAudioRecorderAdapter,
  type StarterSuggestion,
} from '@daynori/domain';
import type { DaynoriApiClient } from '@daynori/api-client';

export interface AssistantSheetProps {
  themeMode: ThemeMode;
  workspaceId: string;
  apiClient: DaynoriApiClient;
  onClose: () => void;
  onOpenSource?: (kind: string, itemId: string) => void;
  recorderAdapter?: NativeAudioRecorderAdapter;
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
  recorderAdapter,
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

  // Phase 95 Voice states
  const [voicePhase, setVoicePhase] = useState<'idle' | 'recording' | 'stopped' | 'transcribing' | 'reviewing'>('idle');
  const [voiceElapsedSeconds, setVoiceElapsedSeconds] = useState(0);
  const [transcriptText, setTranscriptText] = useState('');
  const [transcriptUncertainty, setTranscriptUncertainty] = useState<string | null>(null);
  const recorder = useMemo(() => recorderAdapter ?? new MockAudioRecorderAdapter(), [recorderAdapter]);
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [selectedSources, setSelectedSources] = useState<AiSelectedSources>({
    help: true,
    notes: true,
    tasks: true,
    journal: true,
  });

  const [history, setHistory] = useState<
    Array<{ id: string; question: string; answer: string; abstained: boolean }>
  >([]);

  const [proposals, setProposals] = useState<AiProposal[]>([]);
  const [editingProposalId, setEditingProposalId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCurrency, setEditCurrency] = useState('USD');
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

  const stopVoiceRecording = useCallback(async () => {
    if (voiceTimerRef.current) {
      clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
    try {
      await recorder.stopRecordingAsync();
      setVoicePhase('stopped');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to stop recording');
      setVoicePhase('idle');
    }
  }, [recorder]);

  const cancelVoiceRecording = useCallback(async () => {
    if (voiceTimerRef.current) {
      clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
    try {
      await recorder.discardRecordingAsync();
    } catch {
      /* ignore */
    }
    setVoicePhase('idle');
    setVoiceElapsedSeconds(0);
    setTranscriptText('');
    setTranscriptUncertainty(null);
  }, [recorder]);

  const startVoiceRecording = useCallback(async () => {
    try {
      const perm = await recorder.requestPermissionsAsync();
      if (!perm.granted) {
        setMessage('Microphone permission denied. You can continue typing below.');
        return;
      }
      await recorder.startRecordingAsync();
      setVoicePhase('recording');
      setVoiceElapsedSeconds(0);

      if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = setInterval(() => {
        setVoiceElapsedSeconds((prev) => {
          if (prev >= 599) {
            void stopVoiceRecording();
            return 600;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Microphone permission denied.');
    }
  }, [recorder, stopVoiceRecording]);

  const transcribeVoiceAudio = useCallback(async () => {
    setVoicePhase('transcribing');
    try {
      const res = await apiClient.transcribeAudio({
        workspaceId,
        audioBase64: 'bW9ja19hdWRpb19kYXRhX2Zvcl9tb2JpbGU=',
        mimeType: 'audio/mp4',
        durationSeconds: Math.max(1, voiceElapsedSeconds),
      });
      setTranscriptText(res.data.transcript);
      if (res.data.uncertainSpeech) {
        setTranscriptUncertainty('Uncertain recognition detected. Please review and edit the transcript.');
      } else {
        setTranscriptUncertainty(null);
      }
      setVoicePhase('reviewing');
    } catch (err) {
      setVoicePhase('stopped');
      setMessage(err instanceof Error ? err.message : 'Transcription failed');
    }
  }, [apiClient, voiceElapsedSeconds, workspaceId]);

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
      } catch {
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
    } catch {
      setMessage('Failed to clear history');
    }
  }, [apiClient, workspaceId]);

  const startEditProposal = useCallback((p: AiProposal) => {
    const payload = p.payload as Record<string, unknown>;
    setEditTitle(String(payload['title'] ?? payload['name'] ?? ''));
    setEditContent(String(payload['plainText'] ?? payload['details'] ?? ''));
    setEditDate(String(payload['entryDate'] ?? payload['dueDate'] ?? payload['startDate'] ?? payload['transactionDate'] ?? ''));
    setEditAmount(String(payload['amount'] ?? ''));
    setEditCurrency(String(payload['currency'] ?? 'USD'));
    setEditingProposalId(p.id);
  }, []);

  const saveEditedProposal = useCallback(async () => {
    const target = proposals.find((p) => p.id === editingProposalId);
    if (!target) return;
    setProposalBusy(true);
    try {
      const p = target.payload as Record<string, unknown>;
      const updatedPayload: Record<string, unknown> = { ...p };
      if (editTitle) {
        if (target.operation === 'create_personal_folder' || target.operation === 'create_personal_custom_section') {
          updatedPayload['name'] = editTitle.trim();
        } else {
          updatedPayload['title'] = editTitle.trim();
        }
      }
      if (target.operation === 'create_personal_journal_entry') {
        if (editDate) updatedPayload['entryDate'] = editDate.trim();
        updatedPayload['plainText'] = editContent;
      } else if (target.operation === 'create_personal_note') {
        updatedPayload['plainText'] = editContent;
      } else if (target.operation === 'create_personal_task' || target.operation === 'update_personal_task') {
        if (editDate) updatedPayload['dueDate'] = editDate.trim();
        updatedPayload['details'] = editContent;
      } else if (target.operation === 'create_personal_calendar_event') {
        if (editDate) {
          updatedPayload['startDate'] = editDate.trim();
          updatedPayload['endDate'] = editDate.trim();
        }
        if (editContent) updatedPayload['details'] = editContent;
      } else if (target.operation === 'create_personal_expense') {
        if (editAmount) updatedPayload['amount'] = editAmount.trim();
        if (editCurrency) updatedPayload['currency'] = editCurrency.trim().toUpperCase();
        if (editDate) updatedPayload['transactionDate'] = editDate.trim();
      }

      const res = await apiClient.updateAiProposal(target.id, { payload: updatedPayload });
      setProposals((prev) => prev.map((item) => (item.id === target.id ? res.data : item)));
      setEditingProposalId(null);
      setMessage('Proposal updated. Review and confirm to execute.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to update proposal');
    } finally {
      setProposalBusy(false);
    }
  }, [proposals, editingProposalId, editTitle, editContent, editDate, editAmount, editCurrency, apiClient]);

  const confirmProposal = useCallback(
    async (proposalId: string) => {
      const target = proposals.find((p) => p.id === proposalId);
      if (!target) return;
      setProposalBusy(true);
      try {
        const res = await apiClient.confirmAiProposal(target.id, { confirmationToken: target.confirmationToken });
        setProposals((prev) => prev.map((item) => (item.id === target.id ? res.data : item)));
        setMessage('Action confirmed and saved! Cloud mutation receipt created.');
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Confirmation failed');
      } finally {
        setProposalBusy(false);
      }
    },
    [proposals, apiClient]
  );

  const batchConfirmPlan = useCallback(async () => {
    const pending = proposals.filter((p) => p.status === 'pending');
    if (pending.length === 0) return;
    setProposalBusy(true);
    try {
      const res = await apiClient.batchConfirmAiProposals({
        items: pending.map((p) => ({ proposalId: p.id, confirmationToken: p.confirmationToken })),
      });
      setProposals((prev) =>
        prev.map((item) => {
          const match = res.data.results.find((r) => r.proposalId === item.id);
          return match ? match.proposal : item;
        })
      );
      const hasErrors = res.data.results.some((r) => r.outcome !== 'ok');
      setMessage(
        hasErrors
          ? 'Batch confirmation finished with partial outcomes. Review step results below.'
          : 'All reviewed actions confirmed and executed successfully!'
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Batch confirmation failed');
    } finally {
      setProposalBusy(false);
    }
  }, [proposals, apiClient]);

  const cancelProposal = useCallback(
    async (proposalId: string) => {
      const target = proposals.find((p) => p.id === proposalId);
      if (!target) return;
      setProposalBusy(true);
      try {
        const res = await apiClient.cancelAiProposal(target.id);
        setProposals((prev) => prev.map((item) => (item.id === target.id ? res.data : item)));
        if (editingProposalId === target.id) setEditingProposalId(null);
        setMessage('Proposal cancelled. No items were created or modified.');
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Failed to cancel proposal');
      } finally {
        setProposalBusy(false);
      }
    },
    [proposals, editingProposalId, apiClient]
  );

  const openCreatedItem = useCallback(
    (target: AiProposal) => {
      if (!target.executionReceipt) return;
      const r = target.executionReceipt as Record<string, unknown>;
      const kind = String(r['kind'] ?? 'note');
      const id = String(r['id']);
      onOpenSource?.(kind, id);
    },
    [onOpenSource]
  );

  const createProposalQuick = useCallback(
    async (op: 'note' | 'task' | 'journal' | 'routine' | 'event' | 'folder' | 'section' | 'expense' | 'plan') => {
      setProposalBusy(true);
      setMessage(null);
      try {
        const today = new Date().toISOString().slice(0, 10);
        if (op === 'plan') {
          const planId = 'plan-' + Date.now();
          const p1 = await apiClient.createAiProposal({
            workspaceId,
            operation: 'create_personal_folder',
            payload: { name: question.trim() || 'New Project' },
            planId,
            stepIndex: 0,
            dependsOn: [],
          });
          const p2 = await apiClient.createAiProposal({
            workspaceId,
            operation: 'create_personal_note',
            payload: {
              title: `${question.trim() || 'Project'} Overview`,
              plainText: 'Overview document inside project folder',
              folderId: '$ref:0',
            },
            planId,
            stepIndex: 1,
            dependsOn: ['0'],
          });
          setProposals([p1.data, p2.data]);
          setMessage('Review multi-action plan below. Actions will be executed in order.');
        } else if (op === 'routine') {
          const res = await apiClient.createAiProposal({
            workspaceId,
            operation: 'create_personal_routine',
            payload: {
              title: question.trim() || 'Daily routine',
              frequency: 'daily',
              timezone: 'UTC',
            },
          });
          setProposals([res.data]);
        } else if (op === 'event') {
          const res = await apiClient.createAiProposal({
            workspaceId,
            operation: 'create_personal_calendar_event',
            payload: {
              title: question.trim() || 'Scheduled event',
              allDay: true,
              startDate: today,
              endDate: today,
              timezone: 'UTC',
            },
          });
          setProposals([res.data]);
        } else if (op === 'folder') {
          const res = await apiClient.createAiProposal({
            workspaceId,
            operation: 'create_personal_folder',
            payload: {
              name: question.trim() || 'New Folder',
            },
          });
          setProposals([res.data]);
        } else if (op === 'section') {
          const res = await apiClient.createAiProposal({
            workspaceId,
            operation: 'create_personal_custom_section',
            payload: {
              name: question.trim() || 'Custom Dashboard',
              initialSchema: {
                version: 1,
                blocks: [
                  {
                    id: 'block-view-1',
                    type: 'existing_record_view',
                    title: 'Tasks',
                    targetKind: 'tasks',
                    filter: {},
                    displayMode: 'list',
                    limit: 20,
                    sortBy: 'updated_at',
                    sortDirection: 'desc',
                  },
                ],
              },
            },
          });
          setProposals([res.data]);
        } else if (op === 'expense') {
          const res = await apiClient.createAiProposal({
            workspaceId,
            operation: 'create_personal_expense',
            payload: {
              amount: '25.00',
              currency: 'USD',
              transactionDate: today,
              kind: 'expense',
            },
          });
          setProposals([res.data]);
        } else if (op === 'task') {
          const res = await apiClient.createAiProposal({
            workspaceId,
            operation: 'create_personal_task',
            payload: {
              title: question.trim() || 'New task',
              details: 'Created from reviewed assistant proposal',
              priority: 'normal',
              status: 'todo',
            },
          });
          setProposals([res.data]);
        } else if (op === 'note') {
          const res = await apiClient.createAiProposal({
            workspaceId,
            operation: 'create_personal_note',
            payload: {
              title: question.trim() || 'New note',
              plainText: 'Draft note created from reviewed assistant proposal',
            },
          });
          setProposals([res.data]);
        } else {
          const res = await apiClient.createAiProposal({
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
          setProposals([res.data]);
        }
        setEditingProposalId(null);
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
        Ask Nori Assistant
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

      {/* Voice Capture & Transcription (Phase 95) */}
      <View
        style={{
          marginBottom: spacing.sm,
          padding: spacing.sm,
          backgroundColor: palette.surfaceRaised,
          borderRadius: radii.sm,
          borderWidth: 1,
          borderColor: palette.border.subtle,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="microphone" size={14} color={voicePhase === 'recording' ? palette.status.danger : palette.text.primary} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: palette.text.primary }}>Voice Assistant</Text>
          </View>
          {voicePhase === 'idle' ? (
            <TouchableOpacity
              testID="assistant-voice-record-btn"
              accessibilityLabel="Start voice recording"
              onPress={() => void startVoiceRecording()}
              style={[styles.chip, { backgroundColor: palette.surface }]}
            >
              <Text style={{ fontSize: 11, color: palette.text.primary }}>Record Voice</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {voicePhase === 'recording' && (
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: palette.status.danger }}>
              Recording: {formatAudioDuration(voiceElapsedSeconds)} / 10:00
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                testID="assistant-voice-stop-btn"
                accessibilityLabel="Stop recording"
                onPress={() => void stopVoiceRecording()}
                style={[styles.chip, { backgroundColor: palette.status.danger, paddingHorizontal: 12 }]}
              >
                <Text style={{ fontSize: 12, color: '#fff', fontWeight: '600' }}>Stop</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityLabel="Cancel recording"
                onPress={() => void cancelVoiceRecording()}
                style={[styles.chip, { backgroundColor: palette.surface }]}
              >
                <Text style={{ fontSize: 12, color: palette.text.primary }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {voicePhase === 'stopped' && (
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 11, color: palette.text.secondary }}>
              Recorded: {formatAudioDuration(voiceElapsedSeconds)}
            </Text>
            <Text style={{ fontSize: 10, color: palette.text.secondary, fontStyle: 'italic' }}>
              Transcribing transmits audio under 0-day retention policy.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                testID="assistant-voice-transcribe-btn"
                accessibilityLabel="Transcribe voice recording"
                onPress={() => void transcribeVoiceAudio()}
                style={[styles.chip, { backgroundColor: palette.action.primary, paddingHorizontal: 12 }]}
              >
                <Text style={{ fontSize: 12, color: '#fff', fontWeight: '600' }}>Transcribe Voice</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityLabel="Discard recording"
                onPress={() => void cancelVoiceRecording()}
                style={[styles.chip, { backgroundColor: palette.surface }]}
              >
                <Text style={{ fontSize: 12, color: palette.text.primary }}>Discard</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {voicePhase === 'transcribing' && (
          <Text style={{ fontSize: 11, color: palette.text.primary }}>
            Transcribing audio with secure provider...
          </Text>
        )}

        {voicePhase === 'reviewing' && (
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: palette.text.secondary }}>
              Review & Correct Transcript:
            </Text>
            {transcriptUncertainty ? (
              <Text style={{ fontSize: 10, color: palette.status.warning }}>
                {transcriptUncertainty}
              </Text>
            ) : null}
            <TextInput
              testID="assistant-transcript-input"
              accessibilityLabel="Editable transcript text"
              value={transcriptText}
              onChangeText={setTranscriptText}
              multiline
              style={[
                styles.input,
                {
                  fontSize: 12,
                  minHeight: 48,
                  borderColor: palette.border.subtle,
                  backgroundColor: palette.surface,
                  color: palette.text.primary,
                },
              ]}
            />
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <TouchableOpacity
                testID="assistant-voice-propose-btn"
                accessibilityLabel="Generate proposal from transcript"
                disabled={!transcriptText.trim()}
                onPress={() => {
                  setQuestion(transcriptText.trim());
                  void ask(transcriptText.trim());
                  void cancelVoiceRecording();
                }}
                style={[styles.chip, { backgroundColor: palette.action.primary }]}
              >
                <Text style={{ fontSize: 11, color: '#fff', fontWeight: '600' }}>Generate Proposal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityLabel="Use transcript in question"
                disabled={!transcriptText.trim()}
                onPress={() => {
                  setQuestion(transcriptText.trim());
                  void cancelVoiceRecording();
                }}
                style={[styles.chip, { backgroundColor: palette.surface }]}
              >
                <Text style={{ fontSize: 11, color: palette.text.primary }}>Use in Question</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityLabel="Clear voice transcript"
                onPress={() => void cancelVoiceRecording()}
                style={[styles.chip, { backgroundColor: palette.surface }]}
              >
                <Text style={{ fontSize: 11, color: palette.text.primary }}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
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
          onPress={() => void createProposalQuick('routine')}
          style={[styles.chip, { backgroundColor: palette.surfaceRaised }]}
        >
          <Text style={{ fontSize: 11, color: palette.text.primary }}>+ Routine</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={proposalBusy}
          onPress={() => void createProposalQuick('event')}
          style={[styles.chip, { backgroundColor: palette.surfaceRaised }]}
        >
          <Text style={{ fontSize: 11, color: palette.text.primary }}>+ Event</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={proposalBusy}
          onPress={() => void createProposalQuick('folder')}
          style={[styles.chip, { backgroundColor: palette.surfaceRaised }]}
        >
          <Text style={{ fontSize: 11, color: palette.text.primary }}>+ Folder</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={proposalBusy}
          onPress={() => void createProposalQuick('section')}
          style={[styles.chip, { backgroundColor: palette.surfaceRaised }]}
        >
          <Text style={{ fontSize: 11, color: palette.text.primary }}>+ Section</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={proposalBusy}
          onPress={() => void createProposalQuick('expense')}
          style={[styles.chip, { backgroundColor: palette.surfaceRaised }]}
        >
          <Text style={{ fontSize: 11, color: palette.text.primary }}>+ Expense</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={proposalBusy}
          onPress={() => void createProposalQuick('plan')}
          style={[styles.chip, { backgroundColor: palette.surfaceRaised }]}
        >
          <Text style={{ fontSize: 11, fontWeight: '700', color: palette.action.primary }}>+ Plan</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={proposalBusy}
          onPress={() => void createProposalQuick('journal')}
          style={[styles.chip, { backgroundColor: palette.surfaceRaised }]}
        >
          <Text style={{ fontSize: 11, color: palette.text.primary }}>+ Journal</Text>
        </TouchableOpacity>
      </View>

      {/* Proposal Review Cards / Multi-Action Review (Phase 94) */}
      {proposals.length > 0 ? (
        <View style={{ marginVertical: spacing.xs, gap: 8 }}>
          {proposals.map((item) => {
            const isEditing = editingProposalId === item.id;
            return (
              <View
                key={item.id}
                testID="assistant-proposal-card"
                style={[
                  styles.answerBox,
                  {
                    backgroundColor: palette.surface,
                    borderColor:
                      item.status === 'confirmed'
                        ? '#2e7d32'
                        : item.status === 'cancelled' || item.status === 'failed'
                        ? '#d32f2f'
                        : item.status === 'skipped'
                        ? '#ed6c02'
                        : palette.border.subtle,
                  },
                ]}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: palette.text.primary, flex: 1 }}>
                    {item.planId ? `Step ${(item.stepIndex ?? 0) + 1} of ${item.reviewSummary.totalSteps ?? proposals.length}: ` : ''}
                    {item.reviewSummary.headline}
                  </Text>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '600',
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 4,
                      backgroundColor:
                        item.status === 'confirmed'
                          ? '#e8f5e9'
                          : item.status === 'cancelled' || item.status === 'failed'
                          ? '#ffebee'
                          : item.status === 'skipped'
                          ? '#fff3e0'
                          : '#fff8e1',
                      color:
                        item.status === 'confirmed'
                          ? '#2e7d32'
                          : item.status === 'cancelled' || item.status === 'failed'
                          ? '#c62828'
                          : item.status === 'skipped'
                          ? '#e65100'
                          : '#f57f17',
                    }}
                  >
                    {item.status === 'confirmed'
                      ? 'Saved (Cloud Persisted)'
                      : item.status === 'cancelled'
                      ? 'Cancelled'
                      : item.status === 'failed'
                      ? 'Failed'
                      : item.status === 'skipped'
                      ? 'Skipped (Prerequisite Incomplete)'
                      : 'Local Draft (Unsaved)'}
                  </Text>
                </View>

                <Text style={{ fontSize: 11, color: palette.text.secondary, marginBottom: 4 }}>
                  {item.reviewSummary.destination ? `Destination: ${item.reviewSummary.destination} ` : ''}
                  {item.reviewSummary.date ? `• Date: ${item.reviewSummary.date} ` : ''}
                  {item.reviewSummary.timezone ? `(${item.reviewSummary.timezone}) ` : ''}
                  {item.dependsOn && item.dependsOn.length > 0 ? `• Depends on: Step ${item.dependsOn.join(', ')} ` : ''}
                  {item.reviewSummary.effects ? `• Effects: ${item.reviewSummary.effects}` : ''}
                </Text>

                {isEditing && item.status === 'pending' ? (
                  <View style={{ marginVertical: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: palette.text.primary, marginBottom: 2 }}>
                      Title / Name
                    </Text>
                    <TextInput
                      value={editTitle}
                      onChangeText={setEditTitle}
                      style={[styles.input, { backgroundColor: palette.surfaceRaised, color: palette.text.primary, height: 36, marginBottom: 4 }]}
                    />

                    {item.operation === 'create_personal_expense' ? (
                      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 4 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: palette.text.primary, marginBottom: 2 }}>
                            Amount
                          </Text>
                          <TextInput
                            value={editAmount}
                            onChangeText={setEditAmount}
                            style={[styles.input, { backgroundColor: palette.surfaceRaised, color: palette.text.primary, height: 36 }]}
                          />
                        </View>
                        <View style={{ width: 80 }}>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: palette.text.primary, marginBottom: 2 }}>
                            Currency
                          </Text>
                          <TextInput
                            value={editCurrency}
                            onChangeText={setEditCurrency}
                            style={[styles.input, { backgroundColor: palette.surfaceRaised, color: palette.text.primary, height: 36 }]}
                          />
                        </View>
                      </View>
                    ) : null}

                    {item.operation !== 'create_personal_folder' &&
                    item.operation !== 'create_personal_custom_section' &&
                    item.operation !== 'create_personal_expense' ? (
                      <>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: palette.text.primary, marginBottom: 2 }}>
                          Content / Details
                        </Text>
                        <TextInput
                          value={editContent}
                          onChangeText={setEditContent}
                          multiline
                          style={[styles.input, { backgroundColor: palette.surfaceRaised, color: palette.text.primary, height: 60, marginBottom: 4 }]}
                        />
                      </>
                    ) : null}

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
                        onPress={() => setEditingProposalId(null)}
                        accessibilityLabel="Cancel editing proposal"
                      >
                        Cancel Edit
                      </MobileButton>
                    </View>
                  </View>
                ) : (
                  <Text style={{ fontSize: 12, color: palette.text.primary, marginVertical: 4 }}>
                    {item.reviewSummary.after}
                  </Text>
                )}

                {item.status === 'pending' && !isEditing ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    <MobileButton
                      variant="primary"
                      themeMode={themeMode}
                      disabled={proposalBusy}
                      onPress={() => void confirmProposal(item.id)}
                      accessibilityLabel="Confirm step"
                    >
                      {proposalBusy ? 'Confirming...' : 'Confirm Step'}
                    </MobileButton>
                    <MobileButton
                      variant="secondary"
                      themeMode={themeMode}
                      disabled={proposalBusy}
                      onPress={() => startEditProposal(item)}
                      accessibilityLabel="Edit step"
                    >
                      Edit
                    </MobileButton>
                    <MobileButton
                      variant="secondary"
                      themeMode={themeMode}
                      disabled={proposalBusy}
                      onPress={() => void cancelProposal(item.id)}
                      accessibilityLabel="Cancel step"
                    >
                      Cancel Step
                    </MobileButton>
                  </View>
                ) : null}

                {item.status === 'confirmed' && item.executionReceipt ? (
                  <View style={{ marginTop: 6 }}>
                    <Text style={{ fontSize: 11, color: palette.text.secondary, marginBottom: 4 }}>
                      Receipt: {String((item.executionReceipt as Record<string, unknown>)['operationId'] ?? item.id).slice(0, 8)}…
                      • Rev: r{String((item.executionReceipt as Record<string, unknown>)['revision'] ?? 1)}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <MobileButton
                        variant="primary"
                        themeMode={themeMode}
                        onPress={() => openCreatedItem(item)}
                        accessibilityLabel="Open created item"
                      >
                        Open Created Item
                      </MobileButton>
                      <MobileButton
                        variant="secondary"
                        themeMode={themeMode}
                        onPress={() => setProposals((prev) => prev.filter((p) => p.id !== item.id))}
                        accessibilityLabel="Dismiss step"
                      >
                        Dismiss
                      </MobileButton>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}

          {proposals.filter((p) => p.status === 'pending').length > 1 ? (
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
              <MobileButton
                variant="primary"
                themeMode={themeMode}
                disabled={proposalBusy}
                onPress={() => void batchConfirmPlan()}
                accessibilityLabel="Confirm all reviewed steps"
              >
                {proposalBusy
                  ? 'Confirming...'
                  : `Confirm All (${proposals.filter((p) => p.status === 'pending').length})`}
              </MobileButton>
              <MobileButton
                variant="secondary"
                themeMode={themeMode}
                disabled={proposalBusy}
                onPress={() => setProposals([])}
                accessibilityLabel="Dismiss all steps"
              >
                Dismiss All
              </MobileButton>
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
