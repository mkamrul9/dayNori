import type {
  TourChapterDefinition,
  TourChapterProgress,
  TourProgressState,
  TourStepRecord,
} from './types.js';

export function getDefaultTourProgress(): TourProgressState {
  return {
    version: 1,
    chapters: [],
    migratedFromOnboardingV1: false,
    migratedAt: null,
  };
}

export function emptyChapterProgress(
  def: TourChapterDefinition,
  at: string = new Date().toISOString()
): TourChapterProgress {
  return {
    chapterId: def.id,
    definitionVersion: def.definitionVersion,
    contentVersion: def.contentVersion,
    lifecycle: 'not_started',
    currentStepId: def.steps[0]?.id ?? null,
    runId: null,
    steps: def.steps.map(
      (s): TourStepRecord => ({
        stepId: s.id,
        outcome: 'unfinished',
        completedAt: null,
        skippedAt: null,
        operationId: null,
        entityId: null,
        attemptId: null,
      })
    ),
    practiceEntityIds: [],
    updatedAt: at,
    blockedReason: null,
  };
}

export function findChapterProgress(
  state: TourProgressState,
  chapterId: string
): TourChapterProgress | undefined {
  return state.chapters.find((c) => c.chapterId === chapterId);
}

export function upsertChapterProgress(
  state: TourProgressState,
  chapter: TourChapterProgress
): TourProgressState {
  const others = state.chapters.filter((c) => c.chapterId !== chapter.chapterId);
  return {
    ...state,
    chapters: [...others, chapter],
  };
}

export function validateTourProgressState(input: unknown): TourProgressState {
  if (!input || typeof input !== 'object') {
    return getDefaultTourProgress();
  }
  const obj = input as Record<string, unknown>;
  const chaptersRaw = Array.isArray(obj['chapters']) ? obj['chapters'] : [];
  const chapters: TourChapterProgress[] = [];

  for (const raw of chaptersRaw.slice(0, 40)) {
    if (!raw || typeof raw !== 'object') continue;
    const c = raw as Record<string, unknown>;
    const chapterId = typeof c['chapterId'] === 'string' ? c['chapterId'].slice(0, 128) : '';
    if (!chapterId) continue;
    const stepsRaw = Array.isArray(c['steps']) ? c['steps'] : [];
    const steps: TourStepRecord[] = stepsRaw.slice(0, 40).map((s) => {
      const row = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
      const outcome = row['outcome'];
      const safeOutcome =
        outcome === 'completed' ||
        outcome === 'skipped' ||
        outcome === 'blocked' ||
        outcome === 'unfinished'
          ? outcome
          : 'unfinished';
      return {
        stepId: typeof row['stepId'] === 'string' ? row['stepId'].slice(0, 128) : 'unknown',
        outcome: safeOutcome,
        completedAt: typeof row['completedAt'] === 'string' ? row['completedAt'] : null,
        skippedAt: typeof row['skippedAt'] === 'string' ? row['skippedAt'] : null,
        operationId: typeof row['operationId'] === 'string' ? row['operationId'].slice(0, 128) : null,
        entityId: typeof row['entityId'] === 'string' ? row['entityId'].slice(0, 128) : null,
        attemptId: typeof row['attemptId'] === 'string' ? row['attemptId'].slice(0, 128) : null,
      };
    });
    const lifecycle = c['lifecycle'];
    const safeLifecycle =
      lifecycle === 'not_started' ||
      lifecycle === 'active' ||
      lifecycle === 'paused' ||
      lifecycle === 'completed' ||
      lifecycle === 'skipped' ||
      lifecycle === 'blocked'
        ? lifecycle
        : 'not_started';
    const practiceEntityIds = Array.isArray(c['practiceEntityIds'])
      ? c['practiceEntityIds']
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
          .slice(0, 20)
      : [];
    chapters.push({
      chapterId,
      definitionVersion:
        typeof c['definitionVersion'] === 'number' && c['definitionVersion'] > 0
          ? Math.floor(c['definitionVersion'])
          : 1,
      contentVersion:
        typeof c['contentVersion'] === 'number' && c['contentVersion'] > 0
          ? Math.floor(c['contentVersion'])
          : 1,
      lifecycle: safeLifecycle,
      currentStepId: typeof c['currentStepId'] === 'string' ? c['currentStepId'] : null,
      runId: typeof c['runId'] === 'string' ? c['runId'] : null,
      steps,
      practiceEntityIds,
      updatedAt:
        typeof c['updatedAt'] === 'string' ? c['updatedAt'] : new Date().toISOString(),
      blockedReason: typeof c['blockedReason'] === 'string' ? c['blockedReason'] : null,
    });
  }

  return {
    version: 1,
    chapters,
    migratedFromOnboardingV1: obj['migratedFromOnboardingV1'] === true,
    migratedAt: typeof obj['migratedAt'] === 'string' ? obj['migratedAt'] : null,
  };
}

/**
 * Merge concurrent tour progress without inventing step completion by max index.
 * Union completed/skipped step outcomes; prefer newer updatedAt for current position when lifecycles agree.
 */
export function mergeTourProgressStates(
  local: TourProgressState,
  server: TourProgressState
): TourProgressState {
  const byId = new Map<string, TourChapterProgress>();
  for (const c of server.chapters) byId.set(c.chapterId, c);
  for (const localChapter of local.chapters) {
    const serverChapter = byId.get(localChapter.chapterId);
    if (!serverChapter) {
      byId.set(localChapter.chapterId, localChapter);
      continue;
    }
    byId.set(localChapter.chapterId, mergeChapterProgress(localChapter, serverChapter));
  }
  return {
    version: 1,
    chapters: Array.from(byId.values()),
    migratedFromOnboardingV1:
      local.migratedFromOnboardingV1 || server.migratedFromOnboardingV1,
    migratedAt: server.migratedAt || local.migratedAt || null,
  };
}

function mergeChapterProgress(
  local: TourChapterProgress,
  server: TourChapterProgress
): TourChapterProgress {
  const stepMap = new Map<string, TourStepRecord>();
  for (const s of server.steps) stepMap.set(s.stepId, s);
  for (const s of local.steps) {
    const other = stepMap.get(s.stepId);
    if (!other) {
      stepMap.set(s.stepId, s);
      continue;
    }
    stepMap.set(s.stepId, mergeStepRecord(s, other));
  }
  const newer = local.updatedAt >= server.updatedAt ? local : server;
  const lifecycle =
    local.lifecycle === 'completed' || server.lifecycle === 'completed'
      ? 'completed'
      : local.lifecycle === 'skipped' || server.lifecycle === 'skipped'
        ? 'skipped'
        : newer.lifecycle;

  return {
    chapterId: local.chapterId,
    definitionVersion: Math.max(local.definitionVersion, server.definitionVersion),
    contentVersion: Math.max(local.contentVersion, server.contentVersion),
    lifecycle,
    currentStepId: newer.currentStepId,
    runId: newer.runId || local.runId || server.runId,
    steps: Array.from(stepMap.values()),
    practiceEntityIds: Array.from(
      new Set([...server.practiceEntityIds, ...local.practiceEntityIds])
    ).slice(0, 20),
    updatedAt: newer.updatedAt,
    blockedReason: newer.blockedReason ?? null,
  };
}

function mergeStepRecord(a: TourStepRecord, b: TourStepRecord): TourStepRecord {
  const rank = (o: TourStepRecord['outcome']) =>
    o === 'completed' ? 3 : o === 'skipped' ? 2 : o === 'blocked' ? 1 : 0;
  const winner = rank(a.outcome) >= rank(b.outcome) ? a : b;
  return {
    stepId: a.stepId,
    outcome: winner.outcome,
    completedAt: a.completedAt || b.completedAt || null,
    skippedAt: a.skippedAt || b.skippedAt || null,
    operationId: a.operationId || b.operationId || null,
    entityId: a.entityId || b.entityId || null,
    attemptId: a.attemptId || b.attemptId || null,
  };
}
