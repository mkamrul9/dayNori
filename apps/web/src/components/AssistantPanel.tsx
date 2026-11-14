'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { colors, radii, spacing, touchTargets, typography, type ThemeMode } from '@daynori/design-tokens';
import { Button, Feedback, Icon, type FeedbackSeverity } from '@daynori/ui-web';
import type { AiCitation, AiSelectedSources, AiProposal } from '@daynori/contracts';
import {
  ASSISTANT_STARTER_SUGGESTIONS,
  formatAudioDuration,
  formatByteSize,
  getOrganizerDeepLink,
  sanitizeAssistantMarkdown,
  type StarterSuggestion,
} from '@daynori/domain';
import { createWebApiClient } from '../data/webApiClient';
import { NoriAvatar } from './NoriAvatar';

export interface AssistantPanelProps {
  csrfToken: string | null;
  themeMode: ThemeMode;
  personalWorkspaceId: string | null;
  isOpen?: boolean;
  onClose?: () => void;
  isGated?: boolean;
}

/**
 * Phase 92 — Grounded text assistant chat and contextual guidance.
 * Strict read-only guidance: zero automatic writes or proposal execution.
 * Real-time streaming transport, sanitized markdown, citation verification,
 * selected source toggles, and starter suggestion pills.
 */
export function AssistantPanel({
  csrfToken,
  themeMode,
  personalWorkspaceId,
  isOpen,
  onClose,
  isGated: externalGated,
}: AssistantPanelProps) {
  if (isOpen === false) return null;

  const palette = colors[themeMode];
  const router = useRouter();
  const client = useMemo(() => createWebApiClient({ csrfToken }), [csrfToken]);

  const [internalGated, setInternalGated] = useState<boolean>(externalGated ?? false);
  const isGated = externalGated ?? internalGated;

  useEffect(() => {
    if (externalGated !== undefined) return;
    let cancelled = false;
    async function checkGate() {
      if (!personalWorkspaceId) return;
      try {
        await client.getAiConsentStatus();
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (/unavailable in beta|release gate|FORBIDDEN|403/i.test(msg)) {
          setInternalGated(true);
        }
      }
    }
    void checkGate();
    return () => {
      cancelled = true;
    };
  }, [client, personalWorkspaceId, externalGated]);

  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [citations, setCitations] = useState<AiCitation[]>([]);
  const [feedback, setFeedback] = useState<{ severity: FeedbackSeverity; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [turnMeta, setTurnMeta] = useState<{
    turnId: string;
    providerMode: string;
    label: string;
    tokensReserved?: number;
    tokensSettled?: number;
  } | null>(null);

  const [selectedSources, setSelectedSources] = useState<AiSelectedSources>({
    help: true,
    notes: true,
    tasks: true,
    journal: true,
  });

  const [history, setHistory] = useState<
    Array<{ id: string; question: string; answer: string; abstained: boolean; createdAt: string }>
  >([]);

  const [proposals, setProposals] = useState<AiProposal[]>([]);
  const [editingProposalId, setEditingProposalId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCurrency, setEditCurrency] = useState('USD');
  const [proposalBusy, setProposalBusy] = useState(false);

  // Phase 95 Voice capture & transcription states
  const [voicePhase, setVoicePhase] = useState<'idle' | 'recording' | 'stopped' | 'transcribing' | 'reviewing'>('idle');
  const [voiceElapsedSeconds, setVoiceElapsedSeconds] = useState(0);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const [recordedAudioBase64, setRecordedAudioBase64] = useState<string | null>(null);
  const [recordedMimeType, setRecordedMimeType] = useState('audio/webm');
  const [transcriptText, setTranscriptText] = useState('');
  const [transcriptUncertainty, setTranscriptUncertainty] = useState<{ uncertain: boolean; message?: string } | null>(null);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const askAbortRef = useRef<AbortController | null>(null);

  const refreshHistory = useCallback(async () => {
    if (!personalWorkspaceId) return;
    try {
      const res = await client.listAssistantHistory(personalWorkspaceId);
      setHistory(
        res.data.map((t) => ({
          id: t.id,
          question: t.question,
          answer: t.answer,
          abstained: t.abstained,
          createdAt: t.createdAt,
        }))
      );
    } catch {
      /* history optional when AI disabled */
    }
  }, [client, personalWorkspaceId]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    if (!personalWorkspaceId) {
      setQuestion('');
      setDraftReady(false);
      return;
    }
    let cancelled = false;
    void client
      .getAssistantDraft(personalWorkspaceId)
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
    };
  }, [client, personalWorkspaceId]);

  useEffect(() => {
    if (!personalWorkspaceId || !draftReady) return;
    const t = setTimeout(() => {
      if (!question.trim()) {
        void client
          .clearAssistantDraft({ workspaceId: personalWorkspaceId })
          .catch(() => undefined);
        return;
      }
      void client
        .saveAssistantDraft({ workspaceId: personalWorkspaceId, draftQuestion: question })
        .catch(() => undefined);
    }, 800);
    return () => clearTimeout(t);
  }, [client, personalWorkspaceId, question, draftReady]);

  // Handle Escape key for slide-out drawer
  useEffect(() => {
    if (isOpen === undefined || !onClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const ask = useCallback(
    async (overrideQuestion?: string) => {
      const q = (overrideQuestion ?? question).trim();
      if (!personalWorkspaceId || !q) return;

      askAbortRef.current?.abort();
      const ac = new AbortController();
      askAbortRef.current = ac;
      setBusy(true);
      setFeedback(null);
      setCitations([]);
      setStreamingText('');
      setAnswer(null);
      setTurnMeta(null);

      try {
        await client.streamAssistantAsk(
          {
            workspaceId: personalWorkspaceId,
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
                setTurnMeta((prev) =>
                  prev
                    ? {
                        ...prev,
                        tokensReserved: ev.tokensReserved,
                        tokensSettled: ev.tokensSettled,
                      }
                    : null
                );
                void refreshHistory();
              } else if (ev.type === 'error') {
                setFeedback({
                  severity: 'danger',
                  message: `${ev.error.code}: ${ev.error.message}`,
                });
              }
            },
            onError: (err) => {
              if (ac.signal.aborted) {
                setFeedback({
                  severity: 'info',
                  message:
                    'Ask cancelled. Draft kept. Content already sent to a provider cannot be recalled.',
                });
              } else {
                setFeedback({
                  severity: 'danger',
                  message: err.message || 'Streaming ask failed',
                });
              }
            },
          },
          { signal: ac.signal }
        );
      } catch (err) {
        if (ac.signal.aborted) {
          setFeedback({
            severity: 'info',
            message:
              'Ask cancelled. Draft kept. Content already sent to a provider cannot be recalled.',
          });
        } else {
          setFeedback({
            severity: 'danger',
            message: err instanceof Error ? err.message : 'Ask failed',
          });
        }
      } finally {
        if (askAbortRef.current === ac) askAbortRef.current = null;
        setBusy(false);
      }
    },
    [client, personalWorkspaceId, question, selectedSources, refreshHistory]
  );

  const stopVoiceRecording = useCallback(() => {
    if (voiceTimerRef.current) {
      clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop());
      audioStreamRef.current = null;
    }
    setVoicePhase('stopped');
  }, []);

  const cancelVoiceRecording = useCallback(() => {
    if (voiceTimerRef.current) {
      clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop());
      audioStreamRef.current = null;
    }
    audioChunksRef.current = [];
    setRecordedAudioBlob(null);
    setRecordedAudioBase64(null);
    setVoicePhase('idle');
    setVoiceElapsedSeconds(0);
    setTranscriptText('');
    setTranscriptUncertainty(null);
    setVoiceNotice(null);
  }, []);

  const startVoiceRecording = useCallback(async () => {
    setVoiceNotice(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setFeedback({
        severity: 'danger',
        message: 'Audio recording is not supported in this browser. You can type in the box below.',
      });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      audioChunksRef.current = [];
      const mime =
        typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : 'audio/webm';
      setRecordedMimeType(mime.split(';')[0]!);

      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      recorder.onstop = () => {
        const fullBlob = new Blob(audioChunksRef.current, { type: mime.split(';')[0]! });
        setRecordedAudioBlob(fullBlob);
        const reader = new FileReader();
        reader.onloadend = () => {
          const res = reader.result as string;
          const base64 = res.split(',')[1] || '';
          setRecordedAudioBase64(base64);
        };
        reader.readAsDataURL(fullBlob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setVoicePhase('recording');
      setVoiceElapsedSeconds(0);

      if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = setInterval(() => {
        setVoiceElapsedSeconds((prev) => {
          if (prev >= 599) {
            stopVoiceRecording();
            return 600;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      setFeedback({
        severity: 'danger',
        message: 'Microphone permission denied. You can continue typing your question below.',
      });
    }
  }, [stopVoiceRecording]);

  const transcribeVoiceAudio = useCallback(async () => {
    if (!personalWorkspaceId || !recordedAudioBase64) return;
    setVoicePhase('transcribing');
    try {
      const res = await client.transcribeAudio({
        workspaceId: personalWorkspaceId,
        audioBase64: recordedAudioBase64,
        mimeType: recordedMimeType,
        durationSeconds: Math.max(1, voiceElapsedSeconds),
      });
      setTranscriptText(res.data.transcript);
      setTranscriptUncertainty({
        uncertain: res.data.uncertainSpeech,
        message: res.data.uncertainSpeech
          ? 'Uncertain speech or silence detected. Please review and edit the transcript text before creating organizer items.'
          : undefined,
      });
      setVoicePhase('reviewing');
      setVoiceNotice('Audio processed under 0-day transient retention policy. Original audio discarded from server.');
    } catch (err) {
      setVoicePhase('stopped');
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Transcription failed',
      });
    }
  }, [client, personalWorkspaceId, recordedAudioBase64, recordedMimeType, voiceElapsedSeconds]);

  const cancelAsk = useCallback(() => {
    askAbortRef.current?.abort();
    setFeedback({
      severity: 'info',
      message: 'Cancel requested for in-flight ask. Closing the drawer does not abort completed work.',
    });
  }, []);

  const openCitation = useCallback(
    async (c: AiCitation) => {
      if (!personalWorkspaceId) return;
      try {
        const access = await client.checkAiSourceAccess({
          workspaceId: personalWorkspaceId,
          itemId: c.itemId,
        });
        if (!access.data.accessible) {
          setFeedback({
            severity: 'danger',
            message: `Source unavailable (${access.data.reason ?? 'unknown'}). It may be deleted, vault-scoped, or no longer indexed.`,
          });
          return;
        }
        if (access.data.deepLink) {
          router.push(access.data.deepLink);
        } else if (c.itemId.startsWith('help:')) {
          const articleId = c.itemId.replace(/^help:/, '');
          router.push(`/help?article=${encodeURIComponent(articleId)}`);
        } else if (access.data.kind === 'task' || access.data.kind === 'todo') {
          router.push(`/plan?targetId=${encodeURIComponent(c.itemId)}&targetType=task`);
        } else if (access.data.kind === 'journal_entry' || access.data.kind === 'journal') {
          router.push(`/journal?entryId=${encodeURIComponent(c.itemId)}`);
        } else {
          router.push(`/library?noteId=${encodeURIComponent(c.itemId)}`);
        }
      } catch (err) {
        setFeedback({
          severity: 'danger',
          message: err instanceof Error ? err.message : 'Could not open source',
        });
      }
    },
    [client, personalWorkspaceId, router]
  );

  const deleteTurn = useCallback(
    async (turnId: string) => {
      if (!personalWorkspaceId) return;
      try {
        await client.deleteAssistantHistory({ workspaceId: personalWorkspaceId, turnId });
        setHistory((prev) => prev.filter((h) => h.id !== turnId));
        setFeedback({ severity: 'success', message: 'Turn deleted from assistant history.' });
      } catch {
        setFeedback({ severity: 'danger', message: 'Failed to delete turn' });
      }
    },
    [client, personalWorkspaceId]
  );

  const clearHistory = useCallback(async () => {
    if (!personalWorkspaceId) return;
    try {
      await client.deleteAssistantHistory({ workspaceId: personalWorkspaceId });
      setHistory([]);
      setFeedback({ severity: 'success', message: 'Assistant history cleared.' });
    } catch {
      setFeedback({ severity: 'danger', message: 'Failed to clear history' });
    }
  }, [client, personalWorkspaceId]);

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
    if (!target || !personalWorkspaceId) return;
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

      const res = await client.updateAiProposal(target.id, { payload: updatedPayload });
      setProposals((prev) => prev.map((item) => (item.id === target.id ? res.data : item)));
      setEditingProposalId(null);
      setFeedback({ severity: 'success', message: 'Proposal updated. Review and confirm to execute.' });
    } catch (err) {
      setFeedback({ severity: 'danger', message: err instanceof Error ? err.message : 'Failed to update proposal' });
    } finally {
      setProposalBusy(false);
    }
  }, [proposals, editingProposalId, personalWorkspaceId, editTitle, editContent, editDate, editAmount, editCurrency, client]);

  const confirmProposal = useCallback(
    async (proposalId: string) => {
      const target = proposals.find((p) => p.id === proposalId);
      if (!target || !personalWorkspaceId) return;
      setProposalBusy(true);
      try {
        const res = await client.confirmAiProposal(target.id, { confirmationToken: target.confirmationToken });
        setProposals((prev) => prev.map((item) => (item.id === target.id ? res.data : item)));
        setFeedback({ severity: 'success', message: 'Action confirmed and saved! Cloud mutation receipt created.' });
      } catch (err) {
        setFeedback({ severity: 'danger', message: err instanceof Error ? err.message : 'Confirmation failed' });
      } finally {
        setProposalBusy(false);
      }
    },
    [proposals, personalWorkspaceId, client]
  );

  const batchConfirmPlan = useCallback(async () => {
    const pending = proposals.filter((p) => p.status === 'pending');
    if (pending.length === 0 || !personalWorkspaceId) return;
    setProposalBusy(true);
    try {
      const res = await client.batchConfirmAiProposals({
        items: pending.map((p) => ({ proposalId: p.id, confirmationToken: p.confirmationToken })),
      });
      setProposals((prev) =>
        prev.map((item) => {
          const match = res.data.results.find((r) => r.proposalId === item.id);
          return match ? match.proposal : item;
        })
      );
      const hasErrors = res.data.results.some((r) => r.outcome !== 'ok');
      setFeedback({
        severity: hasErrors ? 'warning' : 'success',
        message: hasErrors
          ? 'Batch confirmation finished with partial outcomes. Review step results below.'
          : 'All reviewed actions confirmed and executed successfully!',
      });
    } catch (err) {
      setFeedback({ severity: 'danger', message: err instanceof Error ? err.message : 'Batch confirmation failed' });
    } finally {
      setProposalBusy(false);
    }
  }, [proposals, personalWorkspaceId, client]);

  const cancelProposal = useCallback(
    async (proposalId: string) => {
      const target = proposals.find((p) => p.id === proposalId);
      if (!target || !personalWorkspaceId) return;
      setProposalBusy(true);
      try {
        const res = await client.cancelAiProposal(target.id);
        setProposals((prev) => prev.map((item) => (item.id === target.id ? res.data : item)));
        if (editingProposalId === target.id) setEditingProposalId(null);
        setFeedback({ severity: 'info', message: 'Proposal cancelled. No items were created or modified.' });
      } catch (err) {
        setFeedback({ severity: 'danger', message: err instanceof Error ? err.message : 'Failed to cancel proposal' });
      } finally {
        setProposalBusy(false);
      }
    },
    [proposals, editingProposalId, personalWorkspaceId, client]
  );

  const openCreatedItem = useCallback(
    (target: AiProposal) => {
      if (!target.executionReceipt) return;
      const r = target.executionReceipt as Record<string, unknown>;
      const deepLink =
        typeof r['deepLink'] === 'string'
          ? r['deepLink']
          : getOrganizerDeepLink(String(r['kind'] ?? 'note'), String(r['id']));
      router.push(deepLink);
    },
    [router]
  );

  const createProposalQuick = useCallback(
    async (op: 'note' | 'task' | 'journal' | 'routine' | 'event' | 'folder' | 'section' | 'expense' | 'plan') => {
      if (!personalWorkspaceId) return;
      setProposalBusy(true);
      setFeedback(null);
      try {
        const today = new Date().toISOString().slice(0, 10);
        if (op === 'plan') {
          const planId = crypto.randomUUID();
          const p1 = await client.createAiProposal({
            workspaceId: personalWorkspaceId,
            operation: 'create_personal_folder',
            payload: { name: question.trim() || 'New Project' },
            planId,
            stepIndex: 0,
            dependsOn: [],
          });
          const p2 = await client.createAiProposal({
            workspaceId: personalWorkspaceId,
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
          setFeedback({
            severity: 'info',
            message: 'Review multi-action plan below. Actions will be executed in order.',
          });
        } else if (op === 'routine') {
          const res = await client.createAiProposal({
            workspaceId: personalWorkspaceId,
            operation: 'create_personal_routine',
            payload: {
              title: question.trim() || 'Daily routine',
              frequency: 'daily',
              timezone: 'UTC',
            },
          });
          setProposals([res.data]);
        } else if (op === 'event') {
          const res = await client.createAiProposal({
            workspaceId: personalWorkspaceId,
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
          const res = await client.createAiProposal({
            workspaceId: personalWorkspaceId,
            operation: 'create_personal_folder',
            payload: {
              name: question.trim() || 'New Folder',
            },
          });
          setProposals([res.data]);
        } else if (op === 'section') {
          const res = await client.createAiProposal({
            workspaceId: personalWorkspaceId,
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
          const res = await client.createAiProposal({
            workspaceId: personalWorkspaceId,
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
          const res = await client.createAiProposal({
            workspaceId: personalWorkspaceId,
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
          const res = await client.createAiProposal({
            workspaceId: personalWorkspaceId,
            operation: 'create_personal_note',
            payload: {
              title: question.trim() || 'New note',
              plainText: 'Draft note created from reviewed assistant proposal',
            },
          });
          setProposals([res.data]);
        } else if (op === 'journal') {
          const res = await client.createAiProposal({
            workspaceId: personalWorkspaceId,
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
        setFeedback({
          severity: 'danger',
          message: err instanceof Error ? err.message : 'Could not create proposal',
        });
      } finally {
        setProposalBusy(false);
      }
    },
    [personalWorkspaceId, question, client]
  );

  const sanitizedDisplay = useMemo(() => {
    const raw = streamingText || answer || '';
    return sanitizeAssistantMarkdown(raw);
  }, [streamingText, answer]);

  const isSlideOut = isOpen !== undefined;

  const content = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        boxSizing: 'border-box',
        padding: isSlideOut ? `${spacing.base}px` : 0,
        overflowY: 'auto',
      }}
      data-testid="assistant-panel"
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: `${spacing.sm}px`,
          marginBottom: `${spacing.sm}px`,
        }}
      >
        <div>
          <h2
            style={{
              margin: '0 0 4px 0',
              fontSize: `${typography.webScale.sectionHeading}px`,
              color: palette.text.primary,
              display: 'flex',
              alignItems: 'center',
              gap: `${spacing.xs}px`,
            }}
          >
            <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center' }}>
              <NoriAvatar
                size={24}
                state={
                  voicePhase === 'recording'
                    ? 'listening'
                    : busy || voicePhase === 'transcribing'
                    ? 'thinking'
                    : 'greeting'
                }
                themeMode={themeMode}
              />
            </span>
            Ask Nori Assistant
          </h2>
          <p style={{ margin: 0, fontSize: '13px', color: palette.text.secondary }}>
            Grounded text chat and contextual help. Strictly read-only guidance.
          </p>
        </div>
        {isSlideOut && onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close assistant"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: `${touchTargets.webMin}px`,
              minHeight: `${touchTargets.webMin}px`,
              border: `1px solid ${palette.border.subtle}`,
              borderRadius: `${radii.sm}px`,
              backgroundColor: palette.surface,
              color: palette.text.primary,
              cursor: 'pointer',
              fontSize: '16px',
            }}
          >
            <span aria-hidden="true">
              <Icon name="x" size={16} />
            </span>
          </button>
        ) : null}
      </div>

      {/* Truthful Gated Banner (DEF-V2-008) */}
      {isGated ? (
        <div
          data-testid="assistant-gated-banner"
          role="status"
          style={{
            padding: `${spacing.sm}px ${spacing.md}px`,
            backgroundColor: palette.surfaceRaised,
            borderRadius: `${radii.sm}px`,
            border: `1px solid ${palette.border.subtle}`,
            marginBottom: `${spacing.sm}px`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span aria-hidden="true">
              <Icon name="nori" size={16} />
            </span>
            <strong style={{ fontSize: '13px', color: palette.text.primary }}>
              Ask Nori is Currently Gated (DEF-V2-008)
            </strong>
          </div>
          <p style={{ margin: '0 0 8px', fontSize: '12px', color: palette.text.secondary, lineHeight: 1.4 }}>
            Live AI assistant queries and voice transcription are intentionally disabled in this release under release gate <code>DEF-V2-008</code> pending enterprise provider privacy and operating authorization. Manual note, task, routine, and journal editing remain fully operational.
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '12px' }}>
            <a
              href="/help?article=assistant-optional"
              style={{ color: palette.action.primary, textDecoration: 'underline' }}
            >
              AI Privacy & FAQ
            </a>
            <span style={{ color: palette.text.secondary }} aria-hidden="true">•</span>
            <a
              href="/settings"
              style={{ color: palette.action.primary, textDecoration: 'underline' }}
            >
              Privacy Settings
            </a>
          </div>
        </div>
      ) : (
        /* Fail-closed Notice & Educational Links */
        <div
          style={{
            padding: `${spacing.xs}px ${spacing.sm}px`,
            backgroundColor: palette.surfaceRaised,
            borderRadius: `${radii.sm}px`,
            marginBottom: `${spacing.sm}px`,
            fontSize: '12px',
            color: palette.text.secondary,
          }}
        >
          <span>Provisional local assistant. Production AI activation is gated under DEF-V2-008. </span>
          <a
            href="/help?article=assistant-optional"
            style={{ color: palette.action.primary, textDecoration: 'underline' }}
          >
            AI Privacy & FAQ
          </a>
        </div>
      )}

      {feedback ? (
        <div style={{ marginBottom: spacing.sm }}>
          <Feedback severity={feedback.severity} message={feedback.message} />
        </div>
      ) : null}

      {/* Selected Knowledge Sources Controls */}
      <div
        style={{
          marginBottom: `${spacing.sm}px`,
          padding: `${spacing.xs}px ${spacing.sm}px`,
          border: `1px solid ${palette.border.subtle}`,
          borderRadius: `${radii.sm}px`,
        }}
        aria-label="Selected knowledge sources"
      >
        <span style={{ fontSize: '12px', fontWeight: 600, color: palette.text.primary, display: 'block', marginBottom: '4px' }}>
          Knowledge Sources (only checked & authorized content is queried):
        </span>
        <div style={{ display: 'flex', gap: `${spacing.sm}px`, flexWrap: 'wrap', fontSize: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={selectedSources.help !== false}
              onChange={(e) => setSelectedSources((prev) => ({ ...prev, help: e.target.checked }))}
            />
            Help & Guides
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={selectedSources.notes !== false}
              onChange={(e) => setSelectedSources((prev) => ({ ...prev, notes: e.target.checked }))}
            />
            Notes
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={selectedSources.tasks !== false}
              onChange={(e) => setSelectedSources((prev) => ({ ...prev, tasks: e.target.checked }))}
            />
            Tasks
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={selectedSources.journal !== false}
              onChange={(e) => setSelectedSources((prev) => ({ ...prev, journal: e.target.checked }))}
            />
            Journal
          </label>
        </div>
      </div>

      {/* Contextual Starter Suggestions */}
      <div style={{ marginBottom: `${spacing.sm}px` }} aria-label="Contextual starter suggestions">
        <span style={{ fontSize: '12px', fontWeight: 600, color: palette.text.secondary, display: 'block', marginBottom: '4px' }}>
          Starter Suggestions:
        </span>
        <div style={{ display: 'flex', gap: `${spacing.xs}px`, flexWrap: 'wrap' }}>
          {ASSISTANT_STARTER_SUGGESTIONS.slice(0, 4).map((s: StarterSuggestion) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setQuestion(s.question);
                void ask(s.question);
              }}
              disabled={isGated || busy || !personalWorkspaceId}
              style={{
                fontSize: '11px',
                padding: '3px 8px',
                borderRadius: '12px',
                border: `1px solid ${palette.border.subtle}`,
                backgroundColor: palette.surfaceRaised,
                color: isGated ? palette.text.secondary : palette.text.primary,
                cursor: isGated ? 'not-allowed' : 'pointer',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Voice Capture & Transcription (Phase 95) */}
      <div
        style={{
          marginBottom: `${spacing.sm}px`,
          padding: `${spacing.sm}px`,
          backgroundColor: palette.surfaceRaised,
          borderRadius: `${radii.sm}px`,
          border: `1px solid ${palette.border.subtle}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: `${spacing.xs}px` }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: palette.text.primary, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Icon name="microphone" size={14} color={voicePhase === 'recording' ? palette.status.danger : palette.text.primary} />
            Voice Assistant
          </span>
          {voicePhase === 'idle' ? (
            <Button
              variant="secondary"
              size="compact"
              themeMode={themeMode}
              disabled={isGated}
              onClick={() => void startVoiceRecording()}
              data-tour="assistant-voice-record"
            >
              Record Voice
            </Button>
          ) : null}
        </div>

        {voicePhase === 'recording' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  display: 'inline-block',
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: palette.status.danger,
                }}
              />
              <span style={{ fontSize: '13px', fontWeight: 600, color: palette.status.danger }} aria-live="polite">
                Recording: {formatAudioDuration(voiceElapsedSeconds)} / 10:00
              </span>
            </div>
            <div style={{ display: 'flex', gap: `${spacing.sm}px` }}>
              <Button variant="primary" size="compact" themeMode={themeMode} onClick={stopVoiceRecording}>
                Stop Recording
              </Button>
              <Button variant="secondary" size="compact" themeMode={themeMode} onClick={cancelVoiceRecording}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {voicePhase === 'stopped' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '12px', color: palette.text.secondary }}>
              Recorded: {formatAudioDuration(voiceElapsedSeconds)} ({recordedMimeType}
              {recordedAudioBlob ? `, ${formatByteSize(recordedAudioBlob.size)}` : ''})
            </div>
            <div style={{ fontSize: '11px', color: palette.text.secondary, fontStyle: 'italic' }}>
              Microphone permission only captured audio locally. Transcribing will transmit audio to the secure transcription provider under the 0-day retention policy.
            </div>
            <div style={{ display: 'flex', gap: `${spacing.sm}px` }}>
              <Button
                variant="primary"
                size="compact"
                themeMode={themeMode}
                disabled={isGated}
                onClick={() => void transcribeVoiceAudio()}
                data-tour="assistant-voice-transcribe"
              >
                Transcribe Voice
              </Button>
              <Button variant="secondary" size="compact" themeMode={themeMode} onClick={cancelVoiceRecording}>
                Discard
              </Button>
            </div>
          </div>
        )}

        {voicePhase === 'transcribing' && (
          <div style={{ fontSize: '12px', color: palette.text.primary, padding: '4px 0' }}>
            Transcribing audio with secure transcription provider...
          </div>
        )}

        {voicePhase === 'reviewing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: palette.text.secondary }}>
              Review & Correct Transcript:
            </span>
            {transcriptUncertainty?.uncertain && (
              <div style={{ fontSize: '11px', color: palette.status.warning, padding: '2px 0' }}>
                {transcriptUncertainty.message}
              </div>
            )}
            <textarea
              id="assistant-transcript-edit"
              data-tour="assistant-transcript-edit"
              value={transcriptText}
              onChange={(e) => setTranscriptText(e.target.value)}
              rows={2}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: `${spacing.xs}px`,
                fontSize: '12px',
                borderRadius: `${radii.sm}px`,
                border: `1px solid ${palette.border.subtle}`,
                backgroundColor: palette.surface,
                color: palette.text.primary,
              }}
            />
            {voiceNotice && (
              <div style={{ fontSize: '10px', color: palette.text.secondary }}>
                {voiceNotice}
              </div>
            )}
            <div style={{ display: 'flex', gap: `${spacing.xs}px`, flexWrap: 'wrap' }}>
              <Button
                variant="primary"
                size="compact"
                themeMode={themeMode}
                disabled={!transcriptText.trim()}
                onClick={() => {
                  setQuestion(transcriptText.trim());
                  void ask(transcriptText.trim());
                  cancelVoiceRecording();
                }}
                data-tour="assistant-voice-propose"
              >
                Generate Proposal
              </Button>
              <Button
                variant="secondary"
                size="compact"
                themeMode={themeMode}
                disabled={!transcriptText.trim()}
                onClick={() => {
                  setQuestion(transcriptText.trim());
                  cancelVoiceRecording();
                }}
              >
                Use in Question
              </Button>
              <Button
                variant="secondary"
                size="compact"
                themeMode={themeMode}
                onClick={cancelVoiceRecording}
              >
                Clear
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }} htmlFor="assistant-q">
        Question (personal workspace scope)
      </label>
      <textarea
        id="assistant-q"
        aria-label="Assistant question"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        disabled={isGated}
        rows={3}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: `${spacing.sm}px`,
          marginBottom: `${spacing.sm}px`,
          borderRadius: `${radii.sm}px`,
          border: `1px solid ${palette.border.subtle}`,
          backgroundColor: isGated ? palette.surfaceRaised : palette.surface,
          color: isGated ? palette.text.secondary : palette.text.primary,
          fontSize: '13px',
          fontFamily: 'inherit',
          resize: 'vertical',
          cursor: isGated ? 'not-allowed' : 'text',
        }}
        placeholder={
          isGated
            ? 'Assistant is currently gated under DEF-V2-008. Use manual organizer controls.'
            : 'Ask about your organizer items or Daynori features...'
        }
      />

      <div style={{ display: 'flex', gap: `${spacing.sm}px`, flexWrap: 'wrap', marginBottom: `${spacing.sm}px` }}>
        <Button
          variant="primary"
          size="compact"
          themeMode={themeMode}
          disabled={isGated || busy || !personalWorkspaceId || !question.trim()}
          onClick={() => void ask()}
        >
          {busy ? 'Streaming...' : 'Ask'}
        </Button>
        <Button
          variant="secondary"
          size="compact"
          themeMode={themeMode}
          disabled={!busy}
          onClick={cancelAsk}
        >
          Cancel ask
        </Button>
        {answer && !busy ? (
          <Button
            variant="secondary"
            size="compact"
            themeMode={themeMode}
            onClick={() => void ask()}
          >
            Retry
          </Button>
        ) : null}
      </div>

      {/* Organizer Quick Proposals (Phase 93 Reviewed Creation) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: `${spacing.xs}px`,
          flexWrap: 'wrap',
          marginBottom: `${spacing.sm}px`,
          padding: '4px 8px',
          backgroundColor: palette.surfaceRaised,
          borderRadius: `${radii.sm}px`,
        }}
        aria-label="Organizer proposals"
      >
        <span style={{ fontSize: '11px', color: palette.text.secondary, fontWeight: 600 }}>
          Propose Action:
        </span>
        <button
          type="button"
          onClick={() => void createProposalQuick('note')}
          disabled={proposalBusy || !personalWorkspaceId}
          style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '4px',
            border: `1px solid ${palette.border.subtle}`,
            backgroundColor: palette.surface,
            color: palette.text.primary,
            cursor: 'pointer',
          }}
        >
          + Propose Note
        </button>
        <button
          type="button"
          onClick={() => void createProposalQuick('task')}
          disabled={proposalBusy || !personalWorkspaceId}
          style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '4px',
            border: `1px solid ${palette.border.subtle}`,
            backgroundColor: palette.surface,
            color: palette.text.primary,
            cursor: 'pointer',
          }}
        >
          + Propose Task
        </button>
        <button
          type="button"
          onClick={() => void createProposalQuick('routine')}
          disabled={proposalBusy || !personalWorkspaceId}
          style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '4px',
            border: `1px solid ${palette.border.subtle}`,
            backgroundColor: palette.surface,
            color: palette.text.primary,
            cursor: 'pointer',
          }}
        >
          + Routine
        </button>
        <button
          type="button"
          onClick={() => void createProposalQuick('event')}
          disabled={proposalBusy || !personalWorkspaceId}
          style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '4px',
            border: `1px solid ${palette.border.subtle}`,
            backgroundColor: palette.surface,
            color: palette.text.primary,
            cursor: 'pointer',
          }}
        >
          + Event
        </button>
        <button
          type="button"
          onClick={() => void createProposalQuick('folder')}
          disabled={proposalBusy || !personalWorkspaceId}
          style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '4px',
            border: `1px solid ${palette.border.subtle}`,
            backgroundColor: palette.surface,
            color: palette.text.primary,
            cursor: 'pointer',
          }}
        >
          + Folder
        </button>
        <button
          type="button"
          onClick={() => void createProposalQuick('section')}
          disabled={proposalBusy || !personalWorkspaceId}
          style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '4px',
            border: `1px solid ${palette.border.subtle}`,
            backgroundColor: palette.surface,
            color: palette.text.primary,
            cursor: 'pointer',
          }}
        >
          + Section
        </button>
        <button
          type="button"
          onClick={() => void createProposalQuick('expense')}
          disabled={proposalBusy || !personalWorkspaceId}
          style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '4px',
            border: `1px solid ${palette.border.subtle}`,
            backgroundColor: palette.surface,
            color: palette.text.primary,
            cursor: 'pointer',
          }}
        >
          + Expense
        </button>
        <button
          type="button"
          onClick={() => void createProposalQuick('plan')}
          disabled={proposalBusy || !personalWorkspaceId}
          style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '4px',
            border: `1px solid ${palette.border.subtle}`,
            backgroundColor: palette.surface,
            color: palette.text.primary,
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          + Multi-Plan
        </button>
        <button
          type="button"
          onClick={() => void createProposalQuick('journal')}
          disabled={proposalBusy || !personalWorkspaceId}
          style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '4px',
            border: `1px solid ${palette.border.subtle}`,
            backgroundColor: palette.surface,
            color: palette.text.primary,
            cursor: 'pointer',
          }}
        >
          + Propose Journal
        </button>
      </div>

      {/* Proposal Review Cards / Multi-Action Review (Phase 94) */}
      {proposals.length > 0 ? (
        <div
          data-tour={proposals.length > 1 ? 'assistant-multi-action-review' : 'assistant-proposal-review'}
          data-testid="assistant-proposal-card"
          style={{
            marginTop: `${spacing.sm}px`,
            marginBottom: `${spacing.sm}px`,
            display: 'flex',
            flexDirection: 'column',
            gap: `${spacing.sm}px`,
          }}
          aria-live="polite"
        >
          {proposals.map((item) => {
            const isEditing = editingProposalId === item.id;
            return (
              <div
                key={item.id}
                style={{
                  padding: `${spacing.sm}px`,
                  backgroundColor: palette.surface,
                  border: `1px solid ${
                    item.status === 'confirmed'
                      ? '#2e7d32'
                      : item.status === 'cancelled' || item.status === 'failed'
                      ? '#d32f2f'
                      : item.status === 'skipped'
                      ? '#ed6c02'
                      : palette.border.subtle
                  }`,
                  borderRadius: `${radii.sm}px`,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                }}
              >
                {/* Header & Status Badge */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: `${spacing.xs}px`,
                  }}
                >
                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: palette.text.primary }}>
                    {item.planId ? `Step ${(item.stepIndex ?? 0) + 1} of ${item.reviewSummary.totalSteps ?? proposals.length}: ` : ''}
                    {item.reviewSummary.headline}
                  </h4>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '2px 6px',
                      borderRadius: '4px',
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
                  </span>
                </div>

                {/* Target Metadata & Destination & Dependencies */}
                <div style={{ fontSize: '12px', color: palette.text.secondary, marginBottom: `${spacing.xs}px` }}>
                  {item.reviewSummary.destination ? (
                    <span>Destination: <strong>{item.reviewSummary.destination}</strong> </span>
                  ) : null}
                  {item.reviewSummary.date ? (
                    <span>• Date: <strong>{item.reviewSummary.date}</strong> </span>
                  ) : null}
                  {item.reviewSummary.timezone ? (
                    <span>({item.reviewSummary.timezone}) </span>
                  ) : null}
                  {item.dependsOn && item.dependsOn.length > 0 ? (
                    <span style={{ color: palette.action.primary, fontWeight: 500 }}>
                      • Depends on: Step {item.dependsOn.join(', ')}{' '}
                    </span>
                  ) : null}
                  {item.reviewSummary.effects ? (
                    <span style={{ display: 'block', marginTop: '2px', fontStyle: 'italic' }}>
                      Effects: {item.reviewSummary.effects}
                    </span>
                  ) : null}
                </div>

                {/* Edit Form or Summary Content */}
                {isEditing && item.status === 'pending' ? (
                  <div style={{ marginTop: `${spacing.xs}px`, marginBottom: `${spacing.xs}px` }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '2px' }}>
                      Title / Name
                    </label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '4px 8px',
                        marginBottom: '6px',
                        borderRadius: `${radii.sm}px`,
                        border: `1px solid ${palette.border.subtle}`,
                        fontSize: '12px',
                        backgroundColor: palette.surfaceRaised,
                        color: palette.text.primary,
                      }}
                    />
                    {item.operation === 'create_personal_expense' ? (
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '2px' }}>
                            Amount
                          </label>
                          <input
                            type="text"
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                            style={{
                              width: '100%',
                              boxSizing: 'border-box',
                              padding: '4px 8px',
                              borderRadius: `${radii.sm}px`,
                              border: `1px solid ${palette.border.subtle}`,
                              fontSize: '12px',
                              backgroundColor: palette.surfaceRaised,
                              color: palette.text.primary,
                            }}
                          />
                        </div>
                        <div style={{ width: '80px' }}>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '2px' }}>
                            Currency
                          </label>
                          <input
                            type="text"
                            value={editCurrency}
                            onChange={(e) => setEditCurrency(e.target.value)}
                            style={{
                              width: '100%',
                              boxSizing: 'border-box',
                              padding: '4px 8px',
                              borderRadius: `${radii.sm}px`,
                              border: `1px solid ${palette.border.subtle}`,
                              fontSize: '12px',
                              backgroundColor: palette.surfaceRaised,
                              color: palette.text.primary,
                            }}
                          />
                        </div>
                      </div>
                    ) : null}

                    {item.operation !== 'create_personal_folder' &&
                    item.operation !== 'create_personal_custom_section' &&
                    item.operation !== 'create_personal_expense' ? (
                      <>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '2px' }}>
                          Content / Details
                        </label>
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          rows={2}
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            padding: '4px 8px',
                            marginBottom: '6px',
                            borderRadius: `${radii.sm}px`,
                            border: `1px solid ${palette.border.subtle}`,
                            fontSize: '12px',
                            backgroundColor: palette.surfaceRaised,
                            color: palette.text.primary,
                            fontFamily: 'inherit',
                          }}
                        />
                      </>
                    ) : null}

                    <div style={{ display: 'flex', gap: `${spacing.xs}px` }}>
                      <Button
                        variant="primary"
                        size="compact"
                        themeMode={themeMode}
                        disabled={proposalBusy}
                        onClick={() => void saveEditedProposal()}
                      >
                        Save Changes
                      </Button>
                      <Button
                        variant="secondary"
                        size="compact"
                        themeMode={themeMode}
                        disabled={proposalBusy}
                        onClick={() => setEditingProposalId(null)}
                      >
                        Cancel Edit
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: '12px',
                      padding: '6px 8px',
                      backgroundColor: palette.surfaceRaised,
                      borderRadius: `${radii.sm}px`,
                      marginBottom: `${spacing.xs}px`,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {item.reviewSummary.after}
                  </div>
                )}

                {/* Per-Card Actions */}
                {item.status === 'pending' && !isEditing ? (
                  <div style={{ display: 'flex', gap: `${spacing.xs}px`, marginTop: `${spacing.xs}px` }}>
                    <Button
                      variant="primary"
                      size="compact"
                      themeMode={themeMode}
                      data-tour="assistant-confirm-button"
                      disabled={proposalBusy}
                      onClick={() => void confirmProposal(item.id)}
                    >
                      {proposalBusy ? 'Confirming...' : 'Confirm Step'}
                    </Button>
                    <Button
                      variant="secondary"
                      size="compact"
                      themeMode={themeMode}
                      disabled={proposalBusy}
                      onClick={() => startEditProposal(item)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="secondary"
                      size="compact"
                      themeMode={themeMode}
                      disabled={proposalBusy}
                      onClick={() => void cancelProposal(item.id)}
                    >
                      Cancel Step
                    </Button>
                  </div>
                ) : null}

                {/* Confirmed Receipt & Deep Link */}
                {item.status === 'confirmed' && item.executionReceipt ? (
                  <div style={{ marginTop: `${spacing.xs}px` }}>
                    <div style={{ fontSize: '11px', color: palette.text.secondary, marginBottom: '6px' }}>
                      Receipt: {String((item.executionReceipt as Record<string, unknown>)['operationId'] ?? item.id).slice(0, 8)}…
                      • Rev: r{String((item.executionReceipt as Record<string, unknown>)['revision'] ?? 1)}
                    </div>
                    <div style={{ display: 'flex', gap: `${spacing.xs}px` }}>
                      <Button
                        variant="primary"
                        size="compact"
                        themeMode={themeMode}
                        data-tour="assistant-open-item"
                        onClick={() => openCreatedItem(item)}
                      >
                        Open Created Item
                      </Button>
                      <Button
                        variant="secondary"
                        size="compact"
                        themeMode={themeMode}
                        onClick={() => setProposals((prev) => prev.filter((p) => p.id !== item.id))}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}

          {/* Batch Confirm Button (for Multi-Action Plans with multiple pending proposals) */}
          {proposals.filter((p) => p.status === 'pending').length > 1 ? (
            <div style={{ marginTop: `${spacing.xs}px`, display: 'flex', gap: `${spacing.xs}px` }}>
              <Button
                variant="primary"
                size="compact"
                themeMode={themeMode}
                data-tour="assistant-batch-confirm"
                disabled={proposalBusy}
                onClick={() => void batchConfirmPlan()}
              >
                {proposalBusy
                  ? 'Confirming...'
                  : `Confirm All Reviewed (${proposals.filter((p) => p.status === 'pending').length})`}
              </Button>
              <Button
                variant="secondary"
                size="compact"
                themeMode={themeMode}
                disabled={proposalBusy}
                onClick={() => setProposals([])}
              >
                Dismiss All
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {/* Streaming or Final Output */}
      {sanitizedDisplay ? (
        <div
          style={{
            marginTop: `${spacing.sm}px`,
            padding: `${spacing.sm}px`,
            background: palette.surfaceRaised,
            borderRadius: `${radii.sm}px`,
            fontSize: '13px',
            lineHeight: '1.5',
            color: palette.text.primary,
            border: `1px solid ${palette.border.subtle}`,
          }}
          aria-live="polite"
        >
          {turnMeta ? (
            <div style={{ fontSize: '11px', color: palette.text.secondary, marginBottom: '6px' }}>
              [{turnMeta.label}] Provider: {turnMeta.providerMode}
              {turnMeta.tokensSettled ? ` • Tokens: ${turnMeta.tokensSettled}` : ''}
            </div>
          ) : null}
          <div style={{ whiteSpace: 'pre-wrap' }}>{sanitizedDisplay}</div>
        </div>
      ) : null}

      {/* Verified Citations with Deep Links */}
      {citations.length > 0 ? (
        <div style={{ marginTop: `${spacing.sm}px` }} aria-label="Authorized source links">
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: palette.text.primary }}>
            Referenced sources (access verified):
          </p>
          <ul style={{ paddingLeft: 18, fontSize: 12, margin: 0 }}>
            {citations.map((c) => (
              <li key={`${c.itemId}-${c.revision}`} style={{ marginBottom: '4px' }}>
                <button
                  type="button"
                  onClick={() => void openCitation(c)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: palette.action.primary,
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    padding: 0,
                    font: 'inherit',
                  }}
                >
                  {c.kind === 'help' ? `[Help Guide: ${c.itemId.replace(/^help:/, '')}]` : `[${c.kind} ${c.itemId.slice(0, 8)}… r${c.revision}]`}
                </button>
                {c.excerpt ? ` — ${c.excerpt.slice(0, 70)}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* History section with turn deletion */}
      {history.length > 0 ? (
        <div style={{ marginTop: `${spacing.base}px`, borderTop: `1px solid ${palette.border.subtle}`, paddingTop: `${spacing.sm}px` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: palette.text.primary }}>
              Recent turns (current consent)
            </h3>
            <button
              type="button"
              onClick={() => void clearHistory()}
              style={{
                fontSize: '11px',
                color: palette.text.secondary,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Clear all
            </button>
          </div>
          <ul style={{ paddingLeft: 18, fontSize: 12, margin: 0 }}>
            {history.slice(0, 6).map((h) => (
              <li key={h.id} style={{ marginBottom: '4px' }}>
                <span>
                  Q: {h.question.slice(0, 60)}
                  {h.abstained ? ' (abstained)' : ''}
                </span>{' '}
                <button
                  type="button"
                  onClick={() => void deleteTurn(h.id)}
                  aria-label="Delete this turn"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: palette.text.secondary,
                    cursor: 'pointer',
                    fontSize: '11px',
                    marginLeft: '4px',
                    verticalAlign: 'middle',
                  }}
                >
                  <Icon name="x" size={12} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );

  if (!isSlideOut) {
    return content;
  }

  return (
    <>
      {/* Background click-away backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.35)',
          zIndex: 999,
        }}
        aria-hidden="true"
      />
      {/* Slide-out desktop side panel */}
      <aside
        role="complementary"
        aria-label="Daynori Assistant"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(440px, 100vw)',
          backgroundColor: palette.surface,
          boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.18)',
          borderLeft: `1px solid ${palette.border.subtle}`,
          zIndex: 1000,
          boxSizing: 'border-box',
        }}
      >
        {content}
      </aside>
    </>
  );
}
