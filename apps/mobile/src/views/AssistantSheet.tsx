import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import { MobileButton } from '@daynori/ui-mobile';
import type { AiCitation, AiProposal } from '@daynori/contracts';
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
 * Android assistant UI (Phase 56 provisional local, repaired).
 * Fake/gated provider only. Vault never accessed. Model text cannot confirm writes.
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
  const [citations, setCitations] = useState<AiCitation[]>([]);
  const [proposal, setProposal] = useState<AiProposal | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const askAbortRef = useRef<AbortController | null>(null);

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

  const ask = useCallback(async () => {
    if (!question.trim()) return;
    askAbortRef.current?.abort();
    const ac = new AbortController();
    askAbortRef.current = ac;
    setBusy(true);
    setMessage(null);
    setProposal(null);
    setCitations([]);
    try {
      const res = await apiClient.askAssistant(
        {
          workspaceId,
          question: question.trim(),
          allowSuggestProposal: true,
        },
        { signal: ac.signal }
      );
      if (ac.signal.aborted) {
        setMessage('Ask cancelled. Transmitted content cannot be recalled.');
        return;
      }
      setAnswer(
        `[${res.data.label}] ${res.data.abstained ? '(insufficient context) ' : ''}${res.data.answer}`
      );
      setCitations(res.data.citations);
      setProposal(res.data.suggestedProposal);
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
  }, [apiClient, question, workspaceId]);

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
          setMessage(`Source OK: ${access.data.kind} ${c.itemId.slice(0, 8)}…`);
        }
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Could not open source');
      }
    },
    [apiClient, onOpenSource, workspaceId]
  );

  const confirmProposal = useCallback(async () => {
    if (!proposal) return;
    setBusy(true);
    try {
      const res = await apiClient.confirmAiProposal(proposal.id, {
        confirmationToken: proposal.confirmationToken,
      });
      setProposal(res.data);
      setMessage(`Confirmed: ${res.data.reviewSummary.headline}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Confirm failed');
    } finally {
      setBusy(false);
    }
  }, [apiClient, proposal]);

  const declineProposal = useCallback(async () => {
    if (!proposal) return;
    setBusy(true);
    try {
      await apiClient.cancelAiProposal(proposal.id);
      setProposal(null);
      setMessage('Proposal declined — no write performed.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Decline failed');
    } finally {
      setBusy(false);
    }
  }, [apiClient, proposal]);

  return (
    <ScrollView
      testID={testID}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
      accessibilityLabel="Assistant provisional local"
    >
      <Text style={[styles.title, { color: palette.text.primary }]}>
        Assistant (provisional local)
      </Text>
      <Text style={[styles.body, { color: palette.text.secondary }]}>
        Personal-workspace answers with source links. Fake/gated provider — not evaluated live
        intelligence. Vault is never unlocked. Writes require Confirm on a stored proposal.
      </Text>

      {message ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.body, { color: palette.text.primary, marginBottom: spacing.sm }]}
        >
          {message}
        </Text>
      ) : null}

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
        placeholder='Ask, or "propose task: Buy milk"'
        placeholderTextColor={palette.text.secondary}
      />

      <MobileButton
        variant="primary"
        themeMode={themeMode}
        disabled={busy}
        onPress={() => void ask()}
        accessibilityLabel="Ask assistant"
      >
        Ask
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
      <MobileButton
        variant="secondary"
        themeMode={themeMode}
        onPress={onClose}
        accessibilityLabel="Close assistant"
      >
        Close
      </MobileButton>

      {answer ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[
            styles.answer,
            { color: palette.text.primary, backgroundColor: palette.surfaceRaised },
          ]}
        >
          {answer}
        </Text>
      ) : null}

      {citations.length > 0 ? (
        <View accessibilityLabel="Authorized source links">
          <Text style={[styles.label, { color: palette.text.primary }]}>Referenced sources</Text>
          {citations.map((c) => (
            <MobileButton
              key={`${c.itemId}-${c.revision}`}
              variant="secondary"
              themeMode={themeMode}
              onPress={() => void openCitation(c)}
              accessibilityLabel={`Open source ${c.kind} revision ${c.revision}`}
            >
              {c.kind} {c.itemId.slice(0, 8)}… r{c.revision}
            </MobileButton>
          ))}
        </View>
      ) : null}

      {proposal && proposal.status === 'pending' ? (
        <View
          style={[styles.proposal, { borderColor: palette.border.subtle }]}
          accessibilityLabel="Review proposed organizer action"
        >
          <Text style={[styles.label, { color: palette.text.primary }]}>
            {proposal.reviewSummary.headline}
          </Text>
          <Text style={[styles.body, { color: palette.text.secondary }]}>
            {proposal.reviewSummary.before
              ? `Before: ${proposal.reviewSummary.before}\n`
              : 'Before: (new item)\n'}
            After: {proposal.reviewSummary.after}
          </Text>
          <MobileButton
            variant="primary"
            themeMode={themeMode}
            disabled={busy}
            onPress={() => void confirmProposal()}
            accessibilityLabel="Confirm proposed create or update"
          >
            Confirm create/update
          </MobileButton>
          <MobileButton
            variant="secondary"
            themeMode={themeMode}
            disabled={busy}
            onPress={() => void declineProposal()}
            accessibilityLabel="Decline proposed action"
          >
            Decline
          </MobileButton>
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
  answer: {
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.sm,
    fontSize: 12,
  },
  proposal: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radii.sm,
    gap: spacing.sm,
  },
});
