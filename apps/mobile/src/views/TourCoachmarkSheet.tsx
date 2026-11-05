import { useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, type ThemeMode } from '@daynori/design-tokens';
import { MobileButton, MobileCard } from '@daynori/ui-mobile';
import { buildTourCleanupReview, executeTourCleanup, type TourControl } from '@daynori/domain';
import { createSyncTourCleanupPort } from '@daynori/sync';
import { useNativeTourController, type NativeTourOptions } from './useNativeTourController';
export type { NativeTourSession } from './useNativeTourController';
export const MOBILE_PROOF_TOUR_ID = 'tour.task-create-save';
export interface TourCoachmarkSheetProps extends NativeTourOptions {
  themeMode: ThemeMode;
}

export function TourCoachmarkSheet(props: TourCoachmarkSheetProps) {
  const controller = useNativeTourController(props);
  const { chapter, step, definition, message, control, progress } = controller;
  const [collapsed, setCollapsed] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState('');
  const liveScope = useRef(props);
  liveScope.current = props;
  const palette = colors[props.themeMode];
  useEffect(() => {
    if (!props.visible) return;
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      void control('exit').then((saved) => {
        if (saved) props.onClose();
      });
      return true;
    });
    return () => handler.remove();
  }, [props.visible, props.onClose, control]);

  const cleanup = async () => {
    if (busy) return;
    const report = controller.capture();
    if (selected.length === 0) {
      await report({ type: 'cleanup_confirmed', cleanupEntityIds: [] });
      return;
    }
    if (!props.syncEngine || !props.apiClient || !props.workspaceId) {
      setCleanupMessage('Reconnect to this workspace before removing practice records.');
      return;
    }
    const engine = props.syncEngine;
    const namespace = engine.getAccountNamespace();
    setBusy(true);
    try {
      const result = await executeTourCleanup(
        progress,
        selected,
        createSyncTourCleanupPort(
          engine,
          () => {
            const current = engine.getAccountNamespace();
            return (
              liveScope.current.visible &&
              liveScope.current.syncEngine === engine &&
              liveScope.current.userId === namespace.userId &&
              liveScope.current.workspaceId === namespace.workspaceId &&
              current.userId === namespace.userId &&
              current.workspaceId === namespace.workspaceId
            );
          },
          async (id) =>
            (await props.apiClient!.listItemLinks(namespace.workspaceId, id)).data.length > 0
        )
      );
      if (!(await controller.save(result.state))) return;
      const failed = result.results.filter((r) => r.status === 'failed');
      setSelected(failed.map((r) => r.entityId));
      if (failed.length) {
        setCleanupMessage('Some records were kept or await acknowledgment. Tracking is retained.');
        return;
      }
      await report({ type: 'cleanup_confirmed', cleanupEntityIds: selected });
      setCleanupMessage('Selected practice records moved to Trash. Other records were kept.');
    } catch {
      setCleanupMessage('Cleanup failed. Tracking was retained for retry.');
    } finally {
      setBusy(false);
    }
  };

  if (!props.visible || !definition) return null;
  return (
    <View
      pointerEvents="box-none"
      style={[
        StyleSheet.absoluteFillObject,
        { justifyContent: 'flex-end', zIndex: 140, elevation: 140 },
      ]}
    >
      <MobileCard
        themeMode={props.themeMode}
        style={{ margin: spacing.sm, marginBottom: 72, maxHeight: collapsed ? 120 : 235 }}
      >
        <ScrollView testID="tour-coachmark-sheet" keyboardShouldPersistTaps="handled">
          <Text
            accessibilityRole="header"
            style={{ fontWeight: '700', color: palette.text.primary }}
          >
            {definition.title.defaultText}
          </Text>
          {!collapsed ? (
            <>
              <Text accessibilityLiveRegion="polite" style={{ color: palette.text.primary }}>
                {step?.instruction.defaultText ?? message}
              </Text>
              {message ? <Text style={{ color: palette.text.secondary }}>{message}</Text> : null}
              {step?.completionPredicate === 'cleanup_selection_confirmed' ? (
                <>
                  {buildTourCleanupReview(progress).map((item) => (
                    <Pressable
                      key={item.entityId}
                      accessibilityRole="checkbox"
                      accessibilityState={{
                        checked: selected.includes(item.entityId),
                        disabled: item.defaultKeep || busy,
                      }}
                      disabled={item.defaultKeep || busy}
                      onPress={() =>
                        setSelected((ids) =>
                          ids.includes(item.entityId)
                            ? ids.filter((id) => id !== item.entityId)
                            : [...ids, item.entityId]
                        )
                      }
                    >
                      <Text style={{ color: palette.text.primary }}>
                        {item.entityType} {item.entityId.slice(0, 8)}{' '}
                        {item.defaultKeep ? '(keep)' : ''}
                      </Text>
                    </Pressable>
                  ))}
                  <MobileButton
                    themeMode={props.themeMode}
                    disabled={busy}
                    onPress={() => void cleanup()}
                    testID="tour-cleanup-confirm"
                  >
                    Confirm cleanup selection
                  </MobileButton>
                  {cleanupMessage ? (
                    <Text style={{ color: palette.text.secondary }}>{cleanupMessage}</Text>
                  ) : null}
                </>
              ) : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {chapter?.practiceOptIn &&
                chapter.practiceArtifacts?.some(
                  (item) => item.entityType === step?.entityType && item.creationOperationId
                ) &&
                step &&
                ['entity_saved_locally', 'practice_task_saved_locally'].includes(
                  step.completionPredicate
                ) ? (
                  <MobileButton
                    themeMode={props.themeMode}
                    onPress={() => void controller.reusePractice()}
                  >
                    Use saved practice item
                  </MobileButton>
                ) : null}
                {(
                  [
                    'back',
                    ...(step?.allowInformationalNext ? ['next'] : []),
                    chapter?.lifecycle === 'paused' ? 'resume' : 'pause',
                    'skip_step',
                    'skip_chapter',
                    'restart_chapter',
                  ] as TourControl[]
                ).map((value) => (
                  <MobileButton
                    key={value}
                    themeMode={props.themeMode}
                    variant="secondary"
                    onPress={() => void control(value)}
                  >
                    {value.replace(/_/g, ' ')}
                  </MobileButton>
                ))}
                {step?.route ? (
                  <MobileButton
                    themeMode={props.themeMode}
                    variant="secondary"
                    onPress={() => props.onRequestRoute?.(step.route!)}
                  >
                    Open destination
                  </MobileButton>
                ) : null}
              </View>
            </>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <MobileButton
              themeMode={props.themeMode}
              variant="secondary"
              onPress={() => setCollapsed(!collapsed)}
            >
              {collapsed ? 'Show instructions' : 'Hide instructions'}
            </MobileButton>
            <MobileButton
              themeMode={props.themeMode}
              variant="secondary"
              onPress={() => {
                void control('exit').then((saved) => {
                  if (saved) props.onClose();
                });
              }}
            >
              Exit
            </MobileButton>
          </View>
        </ScrollView>
      </MobileCard>
    </View>
  );
}
