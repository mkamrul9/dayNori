'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { colors, radii, spacing, typography } from '@daynori/design-tokens';
import { Button, Card, Feedback } from '@daynori/ui-web';
import type {
  ModerationReport,
  UpdateModerationReportRequest,
} from '@daynori/contracts';
import { useShell } from '../../../components/ShellContext';
import { useAuth } from '../../../components/AuthContext';
import { OperatorGate } from '../../../components/OperatorGate';
import { createWebApiClient } from '../../../data/webApiClient';

const STATUS_OPTIONS = ['all', 'received', 'triaged', 'actioned', 'dismissed', 'duplicate'] as const;
const CATEGORY_OPTIONS = [
  'all',
  'harassment',
  'hate',
  'sexual_content',
  'spam',
  'scam',
  'violence',
  'illegal',
  'other',
] as const;
const TARGET_TYPE_OPTIONS = ['all', 'message', 'user'] as const;
const DISPOSITION_OPTIONS = [
  'content_removed',
  'user_warned',
  'user_restricted',
  'no_violation',
  'escalated',
  'other',
] as const;

function ModerationTriageBody() {
  const { themeMode } = useShell();
  const palette = colors[themeMode];
  const { csrfToken } = useAuth();

  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterTargetType, setFilterTargetType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Mutation states
  const [selectedDisposition, setSelectedDisposition] = useState<
    UpdateModerationReportRequest['disposition']
  >('content_removed');
  const [actionReason, setActionReason] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'danger' | 'info';
    text: string;
  } | null>(null);

  const apiClient = React.useMemo(() => createWebApiClient({ csrfToken }), [csrfToken]);

  const loadReports = useCallback(async () => {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await apiClient.listModerationReports();
      setReports(res.data.reports);
      if (res.data.reports.length > 0 && !selectedReportId) {
        setSelectedReportId(res.data.reports[0]!.id);
      }
    } catch (err) {
      setStatusMessage({
        type: 'danger',
        text: err instanceof Error ? err.message : 'Failed to load moderation reports',
      });
    } finally {
      setIsLoading(false);
    }
  }, [apiClient, selectedReportId]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const filteredReports = reports.filter((r) => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (filterCategory !== 'all' && r.category !== filterCategory) return false;
    if (filterTargetType !== 'all' && r.targetType !== filterTargetType) return false;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchExplanation = r.explanation?.toLowerCase().includes(query);
      const matchId = r.id.toLowerCase().includes(query);
      const matchRoom = r.roomId?.toLowerCase().includes(query);
      const matchReporter = r.reporterId.toLowerCase().includes(query);
      if (!matchExplanation && !matchId && !matchRoom && !matchReporter) return false;
    }
    return true;
  });

  const selectedReport = reports.find((r) => r.id === selectedReportId) ?? null;

  const handleUpdateStatus = async (
    newStatus: UpdateModerationReportRequest['status'],
    disposition?: UpdateModerationReportRequest['disposition']
  ) => {
    if (!selectedReport) return;
    setIsUpdating(true);
    setStatusMessage(null);
    try {
      const payload: UpdateModerationReportRequest = {
        status: newStatus,
        reason: actionReason.trim() || undefined,
        disposition: disposition ?? (newStatus === 'actioned' ? selectedDisposition : undefined),
      };
      const res = await apiClient.updateModerationReport(selectedReport.id, payload);
      const updated = res.data.reports[0];
      if (updated) {
        setReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        setStatusMessage({
          type: 'success',
          text: `Report ${updated.id.slice(0, 8)} updated to ${updated.status}${
            updated.disposition ? ` (${updated.disposition})` : ''
          }.`,
        });
      }
      setActionReason('');
    } catch (err) {
      setStatusMessage({
        type: 'danger',
        text: err instanceof Error ? err.message : 'Failed to update report status',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="daynori-page">
      <div style={{ marginBottom: spacing.md, display: 'flex', alignItems: 'center', gap: spacing.sm }}>
        <Link
          href="/developer"
          style={{
            color: palette.action.primary,
            textDecoration: 'none',
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          ← Developer tools
        </Link>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: spacing.md,
          flexWrap: 'wrap',
          gap: spacing.sm,
        }}
      >
        <div>
          <h1
            style={{
              margin: `0 0 ${spacing.xs}px`,
              fontSize: typography.webScale.welcomeTitle,
              color: palette.text.primary,
            }}
          >
            Moderation Triage
          </h1>
          <p style={{ margin: 0, color: palette.text.secondary, fontSize: 14 }}>
            Review, triage, and enforce UGC reports across shared rooms and user interactions.
            Complies with Google Play UGC policy and Daynori privacy invariants.
          </p>
        </div>
        <Button
          variant="secondary"
          size="compact"
          themeMode={themeMode}
          onClick={() => void loadReports()}
          disabled={isLoading}
        >
          {isLoading ? 'Refreshing…' : 'Refresh reports'}
        </Button>
      </div>

      {statusMessage && (
        <div style={{ marginBottom: spacing.base }}>
          <Feedback severity={statusMessage.type} message={statusMessage.text} themeMode={themeMode} />
        </div>
      )}

      {/* Filters bar */}
      <Card themeMode={themeMode} style={{ marginBottom: spacing.base }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: spacing.base,
            alignItems: 'center',
          }}
        >
          <div>
            <label
              htmlFor="mod-filter-status"
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: palette.text.secondary,
                marginBottom: 4,
              }}
            >
              Status
            </label>
            <select
              id="mod-filter-status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: radii.sm,
                border: `1px solid ${palette.border.subtle}`,
                background: palette.surface,
                color: palette.text.primary,
                fontSize: 13,
              }}
            >
              {STATUS_OPTIONS.map((st) => (
                <option key={st} value={st}>
                  {st.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="mod-filter-category"
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: palette.text.secondary,
                marginBottom: 4,
              }}
            >
              Category
            </label>
            <select
              id="mod-filter-category"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: radii.sm,
                border: `1px solid ${palette.border.subtle}`,
                background: palette.surface,
                color: palette.text.primary,
                fontSize: 13,
              }}
            >
              {CATEGORY_OPTIONS.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.replace('_', ' ').toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="mod-filter-target"
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: palette.text.secondary,
                marginBottom: 4,
              }}
            >
              Target type
            </label>
            <select
              id="mod-filter-target"
              value={filterTargetType}
              onChange={(e) => setFilterTargetType(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: radii.sm,
                border: `1px solid ${palette.border.subtle}`,
                background: palette.surface,
                color: palette.text.primary,
                fontSize: 13,
              }}
            >
              {TARGET_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: 200 }}>
            <label
              htmlFor="mod-search"
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: palette.text.secondary,
                marginBottom: 4,
              }}
            >
              Search
            </label>
            <input
              id="mod-search"
              type="text"
              placeholder="Search by explanation, report ID, room ID…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px',
                borderRadius: radii.sm,
                border: `1px solid ${palette.border.subtle}`,
                background: palette.surface,
                color: palette.text.primary,
                fontSize: 13,
              }}
            />
          </div>
        </div>
      </Card>

      {/* Main split view: Report list + Detail Drawer */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 1fr) minmax(380px, 1.4fr)',
          gap: spacing.base,
          alignItems: 'start',
        }}
      >
        {/* Reports List */}
        <Card themeMode={themeMode} style={{ padding: 0, overflow: 'hidden' }}>
          <div
            style={{
              padding: `${spacing.sm}px ${spacing.base}px`,
              borderBottom: `1px solid ${palette.border.subtle}`,
              background: palette.surfaceRaised,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: palette.text.primary }}>
              Reports ({filteredReports.length})
            </span>
          </div>

          <div style={{ maxHeight: 600, overflowY: 'auto' }}>
            {filteredReports.length === 0 ? (
              <div style={{ padding: spacing.lg, textAlign: 'center', color: palette.text.secondary }}>
                No moderation reports match the current filters.
              </div>
            ) : (
              filteredReports.map((report) => {
                const isSelected = report.id === selectedReportId;
                return (
                  <button
                    key={report.id}
                    type="button"
                    onClick={() => setSelectedReportId(report.id)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: spacing.base,
                      border: 'none',
                      borderBottom: `1px solid ${palette.border.subtle}`,
                      background: isSelected ? palette.surfaceRaised : palette.surface,
                      cursor: 'pointer',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: radii.sm,
                          textTransform: 'uppercase',
                          background:
                            report.status === 'received'
                              ? palette.status.warning
                              : report.status === 'actioned'
                              ? palette.status.danger
                              : palette.border.subtle,
                          color: '#fff',
                        }}
                      >
                        {report.status}
                      </span>
                      <span style={{ fontSize: 11, color: palette.text.secondary }}>
                        {new Date(report.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: palette.text.primary,
                        marginBottom: 4,
                      }}
                    >
                      {report.category.replace('_', ' ').toUpperCase()} · {report.targetType}
                    </div>

                    <p
                      style={{
                        margin: 0,
                        fontSize: 12,
                        color: palette.text.secondary,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {report.explanation || 'No explanation provided'}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        {/* Selected Report Details & Action Panel */}
        {selectedReport ? (
          <Card themeMode={themeMode}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: spacing.base,
                borderBottom: `1px solid ${palette.border.subtle}`,
                paddingBottom: spacing.sm,
              }}
            >
              <div>
                <h2
                  style={{
                    margin: `0 0 ${spacing.xs}px`,
                    fontSize: typography.webScale.sectionHeading,
                    color: palette.text.primary,
                  }}
                >
                  Report Details
                </h2>
                <div style={{ fontSize: 12, color: palette.text.secondary }}>
                  ID: <code>{selectedReport.id}</code>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '4px 8px',
                    borderRadius: radii.sm,
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    background:
                      selectedReport.status === 'received'
                        ? palette.status.warning
                        : selectedReport.status === 'actioned'
                        ? palette.status.danger
                        : palette.border.strong,
                    color: '#fff',
                  }}
                >
                  {selectedReport.status}
                </span>
                {selectedReport.disposition && (
                  <div style={{ fontSize: 11, color: palette.text.secondary, marginTop: 4 }}>
                    Disposition: <strong>{selectedReport.disposition}</strong>
                  </div>
                )}
              </div>
            </div>

            {/* Metadata Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: spacing.sm,
                marginBottom: spacing.base,
                fontSize: 13,
              }}
            >
              <div>
                <strong style={{ color: palette.text.primary }}>Category:</strong>{' '}
                <span style={{ color: palette.text.secondary }}>{selectedReport.category}</span>
              </div>
              <div>
                <strong style={{ color: palette.text.primary }}>Target Type:</strong>{' '}
                <span style={{ color: palette.text.secondary }}>{selectedReport.targetType}</span>
              </div>
              <div>
                <strong style={{ color: palette.text.primary }}>Reporter ID:</strong>{' '}
                <code style={{ fontSize: 11 }}>{selectedReport.reporterId}</code>
              </div>
              <div>
                <strong style={{ color: palette.text.primary }}>Reported User:</strong>{' '}
                <code style={{ fontSize: 11 }}>
                  {selectedReport.reportedUserId || 'N/A (Targeted Message)'}
                </code>
              </div>
              {selectedReport.roomId && (
                <div>
                  <strong style={{ color: palette.text.primary }}>Room ID:</strong>{' '}
                  <code style={{ fontSize: 11 }}>{selectedReport.roomId}</code>
                </div>
              )}
              {selectedReport.messageId && (
                <div>
                  <strong style={{ color: palette.text.primary }}>Message ID:</strong>{' '}
                  <code style={{ fontSize: 11 }}>{selectedReport.messageId}</code>
                </div>
              )}
              <div>
                <strong style={{ color: palette.text.primary }}>Reported At:</strong>{' '}
                <span style={{ color: palette.text.secondary }}>
                  {new Date(selectedReport.createdAt).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Reporter Explanation */}
            <div style={{ marginBottom: spacing.base }}>
              <strong
                style={{
                  display: 'block',
                  color: palette.text.primary,
                  fontSize: 13,
                  marginBottom: 4,
                }}
              >
                Reporter Explanation
              </strong>
              <div
                style={{
                  padding: spacing.sm,
                  borderRadius: radii.sm,
                  background: palette.surfaceRaised,
                  fontSize: 13,
                  color: palette.text.primary,
                  fontStyle: selectedReport.explanation ? 'normal' : 'italic',
                }}
              >
                {selectedReport.explanation || 'No explanation provided by reporter.'}
              </div>
            </div>

            {/* Frozen Evidence Snapshot */}
            <div style={{ marginBottom: spacing.base }}>
              <strong
                style={{
                  display: 'block',
                  color: palette.text.primary,
                  fontSize: 13,
                  marginBottom: 4,
                }}
              >
                Frozen Evidence Snapshot (Immutable at time of report)
              </strong>
              <pre
                style={{
                  padding: spacing.sm,
                  borderRadius: radii.sm,
                  background: palette.surfaceRaised,
                  fontSize: 12,
                  color: palette.text.primary,
                  maxHeight: 180,
                  overflowY: 'auto',
                  border: `1px solid ${palette.border.subtle}`,
                }}
              >
                {JSON.stringify(selectedReport.evidenceSnapshot, null, 2)}
              </pre>
            </div>

            {/* Operator Actions Section */}
            <div
              style={{
                marginTop: spacing.base,
                paddingTop: spacing.base,
                borderTop: `1px solid ${palette.border.subtle}`,
              }}
            >
              <h3
                style={{
                  margin: `0 0 ${spacing.sm}px`,
                  fontSize: 15,
                  color: palette.text.primary,
                }}
              >
                Take Moderation Action
              </h3>

              <div style={{ marginBottom: spacing.sm }}>
                <label
                  htmlFor="action-reason"
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 600,
                    color: palette.text.secondary,
                    marginBottom: 4,
                  }}
                >
                  Action Reason / Operator Note
                </label>
                <textarea
                  id="action-reason"
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="Explain reason for status change or disposition (max 500 characters)..."
                  maxLength={500}
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: radii.sm,
                    border: `1px solid ${palette.border.subtle}`,
                    background: palette.surface,
                    color: palette.text.primary,
                    fontSize: 13,
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: spacing.sm,
                  alignItems: 'center',
                  marginBottom: spacing.base,
                  flexWrap: 'wrap',
                }}
              >
                <label
                  htmlFor="action-disposition"
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: palette.text.secondary,
                  }}
                >
                  Disposition:
                </label>
                <select
                  id="action-disposition"
                  value={selectedDisposition}
                  onChange={(e) =>
                    setSelectedDisposition(
                      e.target.value as UpdateModerationReportRequest['disposition']
                    )
                  }
                  style={{
                    padding: '6px 10px',
                    borderRadius: radii.sm,
                    border: `1px solid ${palette.border.subtle}`,
                    background: palette.surface,
                    color: palette.text.primary,
                    fontSize: 13,
                  }}
                >
                  {DISPOSITION_OPTIONS.map((disp) => (
                    <option key={disp} value={disp}>
                      {disp.replace('_', ' ').toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.sm }}>
                <Button
                  type="button"
                  variant="primary"
                  size="compact"
                  themeMode={themeMode}
                  disabled={isUpdating}
                  onClick={() => void handleUpdateStatus('actioned', selectedDisposition)}
                >
                  Apply Action ({selectedDisposition})
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="compact"
                  themeMode={themeMode}
                  disabled={isUpdating}
                  onClick={() => void handleUpdateStatus('triaged')}
                >
                  Mark Triaged
                </Button>
                <Button
                  type="button"
                  variant="subtle"
                  size="compact"
                  themeMode={themeMode}
                  disabled={isUpdating}
                  onClick={() => void handleUpdateStatus('dismissed', 'no_violation')}
                >
                  Dismiss (No Violation)
                </Button>
                <Button
                  type="button"
                  variant="subtle"
                  size="compact"
                  themeMode={themeMode}
                  disabled={isUpdating}
                  onClick={() => void handleUpdateStatus('duplicate')}
                >
                  Mark Duplicate
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <Card themeMode={themeMode}>
            <div style={{ padding: spacing.lg, textAlign: 'center', color: palette.text.secondary }}>
              Select a report from the list to view frozen evidence and apply moderation actions.
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function ModerationTriagePage() {
  return (
    <OperatorGate title="Moderation triage">
      <ModerationTriageBody />
    </OperatorGate>
  );
}
