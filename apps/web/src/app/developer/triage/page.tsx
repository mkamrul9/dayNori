'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { colors, radii, spacing, typography } from '@daynori/design-tokens';
import {
  Button,
  Card,
  Feedback,
  Icon,
  TextArea,
} from '@daynori/ui-web';
import {
  filterDiagnosticsForTriageDisplay,
  isValidFeedbackStatusTransition,
  type FeedbackInternalNote,
  type FeedbackPriority,
  type FeedbackReportStatus,
  type FeedbackReportType,
  type FeedbackTriageAuditRecord,
  type FeedbackTriageItem,
} from '@daynori/domain';
import { useShell } from '../../../components/ShellContext';
import { useAuth } from '../../../components/AuthContext';
import { OperatorGate } from '../../../components/OperatorGate';
import { createWebApiClient } from '../../../data/webApiClient';

function FeedbackTriageBody() {
  const { themeMode } = useShell();
  const palette = colors[themeMode];
  const { csrfToken } = useAuth();

  const [reports, setReports] = useState<FeedbackTriageItem[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<FeedbackTriageItem | null>(null);
  const [internalNotes, setInternalNotes] = useState<FeedbackInternalNote[]>([]);
  const [auditTrail, setAuditTrail] = useState<FeedbackTriageAuditRecord[]>([]);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Mutation states
  const [targetStatus, setTargetStatus] = useState<FeedbackReportStatus | ''>('');
  const [targetPriority, setTargetPriority] = useState<FeedbackPriority | ''>('');
  const [duplicateInput, setDuplicateInput] = useState<string>('');
  const [newNoteText, setNewNoteText] = useState<string>('');
  const [responseText, setResponseText] = useState<string>('');
  const [retentionDays, setRetentionDays] = useState<number>(90);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'danger'; text: string } | null>(null);

  const apiClient = createWebApiClient({ csrfToken });

  // Load reports list
  const loadReports = useCallback(async () => {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await apiClient.listFeedbackTriage({
        page: 1,
        pageSize: 50,
        status: filterStatus !== 'all' ? (filterStatus as FeedbackReportStatus) : undefined,
        reportType: filterType !== 'all' ? (filterType as FeedbackReportType) : undefined,
        priority: filterPriority !== 'all' ? (filterPriority as FeedbackPriority) : undefined,
        search: searchQuery.trim() || undefined,
      });
      setReports(res.data);
      if (res.data.length > 0 && !selectedReportId) {
        setSelectedReportId(res.data[0]!.id);
      }
    } catch (err) {
      setStatusMessage({
        type: 'danger',
        text: err instanceof Error ? err.message : 'Failed to load triage reports',
      });
    } finally {
      setIsLoading(false);
    }
  }, [apiClient, filterStatus, filterType, filterPriority, searchQuery, selectedReportId]);

  useEffect(() => {
    void loadReports();
  }, [filterStatus, filterType, filterPriority]);

  // Load active report details, notes, and audit
  const loadReportDetails = useCallback(
    async (reportId: string) => {
      try {
        const reportRes = await apiClient.getFeedbackTriageReport(reportId);
        setSelectedReport(reportRes.data);
        setTargetStatus(reportRes.data.status);
        setTargetPriority(reportRes.data.priority || 'medium');
        setDuplicateInput(reportRes.data.duplicateOfId || '');
        setResponseText(reportRes.data.responseText || '');

        const [notesRes, auditRes] = await Promise.all([
          apiClient.listFeedbackInternalNotes(reportId),
          apiClient.listFeedbackTriageAudit(reportId),
        ]);
        setInternalNotes(notesRes.data);
        setAuditTrail(auditRes.data);
      } catch (err) {
        setStatusMessage({
          type: 'danger',
          text: err instanceof Error ? err.message : 'Failed to load report details',
        });
      }
    },
    [apiClient]
  );

  useEffect(() => {
    if (selectedReportId) {
      void loadReportDetails(selectedReportId);
    } else {
      setSelectedReport(null);
      setInternalNotes([]);
      setAuditTrail([]);
    }
  }, [selectedReportId, loadReportDetails]);

  // Update Status
  const handleUpdateStatus = async () => {
    if (!selectedReport || !targetStatus || targetStatus === selectedReport.status) return;
    setIsUpdating(true);
    try {
      const updated = await apiClient.updateFeedbackTriageReport(selectedReport.id, {
        status: targetStatus,
      });
      setSelectedReport(updated.data);
      setStatusMessage({ type: 'success', text: `Status updated to ${targetStatus}` });
      await loadReports();
      await loadReportDetails(selectedReport.id);
    } catch (err) {
      setStatusMessage({
        type: 'danger',
        text: err instanceof Error ? err.message : 'Failed to update status',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // Update Priority
  const handleUpdatePriority = async () => {
    if (!selectedReport || !targetPriority || targetPriority === selectedReport.priority) return;
    setIsUpdating(true);
    try {
      const updated = await apiClient.updateFeedbackTriageReport(selectedReport.id, {
        priority: targetPriority,
      });
      setSelectedReport(updated.data);
      setStatusMessage({ type: 'success', text: `Priority updated to ${targetPriority}` });
      await loadReports();
      await loadReportDetails(selectedReport.id);
    } catch (err) {
      setStatusMessage({
        type: 'danger',
        text: err instanceof Error ? err.message : 'Failed to update priority',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // Link Duplicate
  const handleLinkDuplicate = async () => {
    if (!selectedReport) return;
    setIsUpdating(true);
    try {
      const dupId = duplicateInput.trim() || null;
      const updated = await apiClient.updateFeedbackTriageReport(selectedReport.id, {
        duplicateOfId: dupId,
      });
      setSelectedReport(updated.data);
      setStatusMessage({
        type: 'success',
        text: dupId ? `Linked duplicate of report ${dupId}` : 'Cleared duplicate link',
      });
      await loadReports();
      await loadReportDetails(selectedReport.id);
    } catch (err) {
      setStatusMessage({
        type: 'danger',
        text: err instanceof Error ? err.message : 'Failed to link duplicate',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // Add Internal Note
  const handleAddNote = async () => {
    if (!selectedReport || !newNoteText.trim()) return;
    setIsUpdating(true);
    try {
      await apiClient.createFeedbackInternalNote(selectedReport.id, {
        note: newNoteText.trim(),
      });
      setNewNoteText('');
      setStatusMessage({ type: 'success', text: 'Internal note added' });
      await loadReportDetails(selectedReport.id);
    } catch (err) {
      setStatusMessage({
        type: 'danger',
        text: err instanceof Error ? err.message : 'Failed to add internal note',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // Send Response to Reporter
  const handleSendResponse = async () => {
    if (!selectedReport || !responseText.trim()) return;
    setIsUpdating(true);
    try {
      const updated = await apiClient.updateFeedbackTriageReport(selectedReport.id, {
        responseText: responseText.trim(),
      });
      setSelectedReport(updated.data);
      setStatusMessage({ type: 'success', text: 'Response delivered to reporter' });
      await loadReportDetails(selectedReport.id);
    } catch (err) {
      setStatusMessage({
        type: 'danger',
        text: err instanceof Error ? err.message : 'Failed to send response',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // Retention Purge
  const handlePurge = async () => {
    if (!window.confirm(`Purge terminal reports older than ${retentionDays} days?`)) return;
    setIsUpdating(true);
    try {
      const res = await apiClient.purgeExpiredFeedback({ retentionDays });
      setStatusMessage({
        type: 'success',
        text: `Purged ${res.data.purgedCount} expired reports (cutoff: ${new Date(res.data.cutoffDate).toLocaleDateString()})`,
      });
      await loadReports();
    } catch (err) {
      setStatusMessage({
        type: 'danger',
        text: err instanceof Error ? err.message : 'Failed to purge expired reports',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const safeDiagnostics = selectedReport ? filterDiagnosticsForTriageDisplay(selectedReport.diagnostics) : null;

  return (
    <div className="daynori-page" style={{ maxWidth: 1200, margin: '0 auto', padding: spacing.base }}>
      {/* Header */}
      <div style={{ marginBottom: spacing.md }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
          <Link href="/developer" style={{ color: palette.text.secondary, textDecoration: 'none', fontSize: 13 }}>
            &larr; Developer tools
          </Link>
          <span style={{ color: palette.text.muted }}>/</span>
          <span style={{ color: palette.text.primary, fontSize: 13, fontWeight: 600 }}>Support Triage</span>
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: typography.webScale.welcomeTitle,
            color: palette.text.primary,
          }}
        >
          Feedback & Support Triage
        </h1>
        <p style={{ margin: `${spacing.xs}px 0 0`, color: palette.text.secondary, fontSize: 14 }}>
          Restricted operator inbox. Review, triage, and respond to durable bug reports, suggestions, and contact submissions.
        </p>
      </div>

      {statusMessage && (
        <div style={{ marginBottom: spacing.md }}>
          <Feedback
            severity={statusMessage.type}
            message={statusMessage.text}
            themeMode={themeMode}
            onDismiss={() => setStatusMessage(null)}
          />
        </div>
      )}

      {/* Filter Bar */}
      <Card themeMode={themeMode} style={{ marginBottom: spacing.md, padding: spacing.sm }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: 12, color: palette.text.secondary, display: 'block', marginBottom: 2 }}>
              Status
            </label>
            <select
              value={filterStatus}
              data-testid="select-filter-status"
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: radii.sm,
                backgroundColor: palette.surfaceRaised,
                color: palette.text.primary,
                border: `1px solid ${palette.border.subtle}`,
                fontSize: 13,
              }}
            >
              <option value="all">All Statuses</option>
              <option value="new">New</option>
              <option value="received">Received</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="investigating">Investigating</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
              <option value="duplicate">Duplicate</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12, color: palette.text.secondary, display: 'block', marginBottom: 2 }}>
              Type
            </label>
            <select
              value={filterType}
              data-testid="select-filter-type"
              onChange={(e) => setFilterType(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: radii.sm,
                backgroundColor: palette.surfaceRaised,
                color: palette.text.primary,
                border: `1px solid ${palette.border.subtle}`,
                fontSize: 13,
              }}
            >
              <option value="all">All Types</option>
              <option value="bug">Bug</option>
              <option value="suggestion">Suggestion</option>
              <option value="contact">Contact</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12, color: palette.text.secondary, display: 'block', marginBottom: 2 }}>
              Priority
            </label>
            <select
              value={filterPriority}
              data-testid="select-filter-priority"
              onChange={(e) => setFilterPriority(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: radii.sm,
                backgroundColor: palette.surfaceRaised,
                color: palette.text.primary,
                border: `1px solid ${palette.border.subtle}`,
                fontSize: 13,
              }}
            >
              <option value="all">All Priorities</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={{ fontSize: 12, color: palette.text.secondary, display: 'block', marginBottom: 2 }}>
              Search Summary/Description
            </label>
            <input
              type="text"
              data-testid="input-search-query"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void loadReports();
              }}
              placeholder="Search reports..."
              style={{
                width: '100%',
                padding: '6px 10px',
                borderRadius: radii.sm,
                backgroundColor: palette.surfaceRaised,
                color: palette.text.primary,
                border: `1px solid ${palette.border.subtle}`,
                fontSize: 13,
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ alignSelf: 'flex-end' }}>
            <Button themeMode={themeMode} variant="secondary" onClick={() => void loadReports()}>
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      {/* Main Grid: Left List, Right Detail */}
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: spacing.md, alignItems: 'start' }}>
        {/* Reports List */}
        <Card themeMode={themeMode} style={{ padding: spacing.sm, maxHeight: 750, overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
            <strong style={{ fontSize: 13, color: palette.text.secondary }}>
              Reports ({reports.length})
            </strong>
            {isLoading && <span style={{ fontSize: 12, color: palette.text.muted }}>Loading...</span>}
          </div>

          {reports.length === 0 && !isLoading ? (
            <div style={{ padding: spacing.md, textAlign: 'center', color: palette.text.secondary, fontSize: 13 }}>
              No reports match current filters.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
              {reports.map((report) => {
                const isSelected = report.id === selectedReportId;
                return (
                  <div
                    key={report.id}
                    data-testid={`triage-item-${report.id}`}
                    onClick={() => setSelectedReportId(report.id)}
                    style={{
                      padding: spacing.sm,
                      borderRadius: radii.sm,
                      backgroundColor: isSelected ? palette.action.subtle : palette.surfaceRaised,
                      border: `1px solid ${isSelected ? palette.action.primary : palette.border.subtle}`,
                      cursor: 'pointer',
                      transition: 'border-color 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          color:
                            report.reportType === 'bug'
                              ? palette.status.danger
                              : report.reportType === 'suggestion'
                              ? palette.action.primary
                              : palette.status.warning,
                        }}
                      >
                        {report.reportType}
                      </span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <span
                          style={{
                            fontSize: 10,
                            padding: '1px 6px',
                            borderRadius: radii.sm,
                            backgroundColor: palette.background,
                            color: palette.text.secondary,
                            fontWeight: 600,
                          }}
                        >
                          {report.priority || 'medium'}
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            padding: '1px 6px',
                            borderRadius: radii.sm,
                            backgroundColor:
                              report.status === 'resolved'
                                ? palette.status.successBg
                                : palette.background,
                            color:
                              report.status === 'resolved'
                                ? palette.status.success
                                : palette.text.primary,
                            fontWeight: 600,
                          }}
                        >
                          {report.status}
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: palette.text.primary,
                        marginBottom: 4,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {report.summary}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: palette.text.secondary }}>
                      <span>Category: {report.category}</span>
                      <span>{new Date(report.createdAt).toLocaleDateString()}</span>
                    </div>

                    {Boolean(report.internalNotesCount && report.internalNotesCount > 0) && (
                      <div style={{ marginTop: 4, fontSize: 11, color: palette.action.primary }}>
                        <Icon name="help" /> {report.internalNotesCount} notes
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Report Detail Pane */}
        <div>
          {selectedReport ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
              {/* Header and Summary */}
              <Card themeMode={themeMode} style={{ padding: spacing.md }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm }}>
                  <div>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        color:
                          selectedReport.reportType === 'bug'
                            ? palette.status.danger
                            : selectedReport.reportType === 'suggestion'
                            ? palette.action.primary
                            : palette.status.warning,
                      }}
                    >
                      {selectedReport.reportType} Report
                    </span>
                    <h2 style={{ margin: `4px 0`, fontSize: typography.webScale.sectionHeading, color: palette.text.primary }}>
                      {selectedReport.summary}
                    </h2>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 12, color: palette.text.secondary }}>
                    <div>Report ID: <code>{selectedReport.id.slice(0, 8)}...</code></div>
                    <div>Created: {new Date(selectedReport.createdAt).toLocaleString()}</div>
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: palette.surfaceRaised,
                    padding: spacing.sm,
                    borderRadius: radii.sm,
                    marginBottom: spacing.sm,
                    whiteSpace: 'pre-wrap',
                    fontSize: 14,
                    color: palette.text.primary,
                    lineHeight: 1.5,
                  }}
                >
                  {selectedReport.description}
                </div>

                {/* Bug Details if applicable */}
                {selectedReport.reportType === 'bug' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, fontSize: 13, marginBottom: spacing.sm }}>
                    {selectedReport.stepsToReproduce && (
                      <div>
                        <strong style={{ color: palette.text.secondary }}>Steps to reproduce:</strong>
                        <div style={{ padding: spacing.xs, color: palette.text.primary }}>{selectedReport.stepsToReproduce}</div>
                      </div>
                    )}
                    {selectedReport.expectedBehavior && (
                      <div>
                        <strong style={{ color: palette.text.secondary }}>Expected behavior:</strong>
                        <div style={{ padding: spacing.xs, color: palette.text.primary }}>{selectedReport.expectedBehavior}</div>
                      </div>
                    )}
                    {selectedReport.actualBehavior && (
                      <div>
                        <strong style={{ color: palette.text.secondary }}>Actual behavior:</strong>
                        <div style={{ padding: spacing.xs, color: palette.text.primary }}>{selectedReport.actualBehavior}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Safe Diagnostics */}
                {safeDiagnostics && (
                  <div
                    style={{
                      marginTop: spacing.sm,
                      padding: spacing.sm,
                      backgroundColor: palette.background,
                      borderRadius: radii.sm,
                      border: `1px solid ${palette.border.subtle}`,
                    }}
                  >
                    <strong style={{ fontSize: 12, color: palette.text.secondary, display: 'block', marginBottom: 4 }}>
                      Technical Diagnostics (Sanitized)
                    </strong>
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 8px', fontSize: 11 }}>
                      <span style={{ color: palette.text.secondary }}>Platform:</span>
                      <code>{safeDiagnostics.platform}</code>
                      <span style={{ color: palette.text.secondary }}>App Version:</span>
                      <code>{safeDiagnostics.appVersion}</code>
                      <span style={{ color: palette.text.secondary }}>Browser / OS:</span>
                      <code>{safeDiagnostics.browserOrOs}</code>
                      <span style={{ color: palette.text.secondary }}>Route:</span>
                      <code>{safeDiagnostics.routeTemplate}</code>
                      <span style={{ color: palette.text.secondary }}>Correlation ID:</span>
                      <code>{safeDiagnostics.correlationId}</code>
                    </div>
                  </div>
                )}

                {/* Attachment note */}
                <div style={{ marginTop: spacing.sm, fontSize: 11, color: palette.text.muted }}>
                  Private file attachments: {selectedReport.attachments.length} attached. Hosted storage gated under Phase 75 capability boundaries.
                </div>
              </Card>

              {/* Triage Controls: Status, Priority, Duplicate */}
              <Card themeMode={themeMode} style={{ padding: spacing.md }}>
                <h3 style={{ margin: `0 0 ${spacing.sm}px`, fontSize: 15, color: palette.text.primary }}>
                  Triage Actions
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: spacing.md, alignItems: 'end' }}>
                  {/* Status update */}
                  <div>
                    <label style={{ fontSize: 12, color: palette.text.secondary, display: 'block', marginBottom: 4 }}>
                      Change Status (Current: <strong>{selectedReport.status}</strong>)
                    </label>
                    <div style={{ display: 'flex', gap: spacing.xs }}>
                      <select
                        value={targetStatus}
                        data-testid="select-target-status"
                        onChange={(e) => setTargetStatus(e.target.value as FeedbackReportStatus)}
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          borderRadius: radii.sm,
                          backgroundColor: palette.surfaceRaised,
                          color: palette.text.primary,
                          border: `1px solid ${palette.border.subtle}`,
                          fontSize: 13,
                        }}
                      >
                        {(['new', 'acknowledged', 'investigating', 'resolved', 'closed', 'duplicate', 'dismissed'] as FeedbackReportStatus[])
                          .filter((st) => isValidFeedbackStatusTransition(selectedReport.status, st))
                          .map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                      </select>
                      <Button
                        themeMode={themeMode}
                        variant="primary"
                        data-testid="btn-update-status"
                        disabled={isUpdating || targetStatus === selectedReport.status}
                        onClick={handleUpdateStatus}
                      >
                        Apply
                      </Button>
                    </div>
                  </div>

                  {/* Priority update */}
                  <div>
                    <label style={{ fontSize: 12, color: palette.text.secondary, display: 'block', marginBottom: 4 }}>
                      Change Priority (Current: <strong>{selectedReport.priority || 'medium'}</strong>)
                    </label>
                    <div style={{ display: 'flex', gap: spacing.xs }}>
                      <select
                        value={targetPriority}
                        data-testid="select-target-priority"
                        onChange={(e) => setTargetPriority(e.target.value as FeedbackPriority)}
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          borderRadius: radii.sm,
                          backgroundColor: palette.surfaceRaised,
                          color: palette.text.primary,
                          border: `1px solid ${palette.border.subtle}`,
                          fontSize: 13,
                        }}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                      <Button
                        themeMode={themeMode}
                        variant="secondary"
                        data-testid="btn-update-priority"
                        disabled={isUpdating || targetPriority === selectedReport.priority}
                        onClick={handleUpdatePriority}
                      >
                        Apply
                      </Button>
                    </div>
                  </div>

                  {/* Duplicate link */}
                  <div>
                    <label style={{ fontSize: 12, color: palette.text.secondary, display: 'block', marginBottom: 4 }}>
                      Link Duplicate (Target Report UUID)
                    </label>
                    <div style={{ display: 'flex', gap: spacing.xs }}>
                      <input
                        type="text"
                        data-testid="input-duplicate-id"
                        value={duplicateInput}
                        onChange={(e) => setDuplicateInput(e.target.value)}
                        placeholder="Target report UUID"
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          borderRadius: radii.sm,
                          backgroundColor: palette.surfaceRaised,
                          color: palette.text.primary,
                          border: `1px solid ${palette.border.subtle}`,
                          fontSize: 13,
                        }}
                      />
                      <Button
                        themeMode={themeMode}
                        variant="secondary"
                        data-testid="btn-link-duplicate"
                        disabled={isUpdating}
                        onClick={handleLinkDuplicate}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Developer Response to Reporter (Verified Contact Inbox Route) */}
              <Card themeMode={themeMode} style={{ padding: spacing.md }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs }}>
                  <Icon name="help" />
                  <h3 style={{ margin: 0, fontSize: 15, color: palette.text.primary }}>
                    Verified Developer Response
                  </h3>
                </div>
                <p style={{ margin: `0 0 ${spacing.sm}px`, color: palette.text.secondary, fontSize: 13 }}>
                  This message will be durably delivered to the reporter and visible when they inspect this report on <code>/support</code>.
                </p>

                {selectedReport.responseText && (
                  <div
                    style={{
                      padding: spacing.sm,
                      borderRadius: radii.sm,
                      backgroundColor: palette.surfaceRaised,
                      border: `1px solid ${palette.border.subtle}`,
                      marginBottom: spacing.sm,
                    }}
                  >
                    <div style={{ fontSize: 12, color: palette.text.secondary, marginBottom: 2 }}>
                      Last response sent on {selectedReport.respondedAt ? new Date(selectedReport.respondedAt).toLocaleString() : 'recently'}:
                    </div>
                    <div style={{ fontSize: 13, color: palette.text.primary, whiteSpace: 'pre-wrap' }}>
                      {selectedReport.responseText}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                  <TextArea
                    themeMode={themeMode}
                    id="developer-response-input"
                    data-testid="input-developer-response"
                    label="Compose or update response"
                    value={responseText}
                    onChange={(val) => setResponseText(typeof val === 'string' ? val : (val as unknown as { target: { value: string } }).target.value)}
                    rows={3}
                    placeholder="Enter message to deliver to the reporter..."
                  />
                  <div>
                    <Button
                      themeMode={themeMode}
                      variant="primary"
                      data-testid="btn-send-developer-response"
                      disabled={isUpdating || !responseText.trim()}
                      onClick={handleSendResponse}
                    >
                      Deliver response to reporter
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Internal Developer Notes */}
              <Card themeMode={themeMode} style={{ padding: spacing.md }}>
                <h3 style={{ margin: `0 0 ${spacing.xs}px`, fontSize: 15, color: palette.text.primary }}>
                  Confidential Internal Notes
                </h3>
                <p style={{ margin: `0 0 ${spacing.sm}px`, color: palette.text.muted, fontSize: 12 }}>
                  Internal notes are restricted strictly to platform operators. They are never visible to reporters or ordinary users.
                </p>

                {internalNotes.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, marginBottom: spacing.md }}>
                    {internalNotes.map((n) => (
                      <div
                        key={n.id}
                        data-testid={`internal-note-${n.id}`}
                        style={{
                          padding: spacing.sm,
                          borderRadius: radii.sm,
                          backgroundColor: palette.surfaceRaised,
                          border: `1px solid ${palette.border.subtle}`,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: palette.text.secondary, marginBottom: 2 }}>
                          <span>Operator ID: <code>{n.authorId.slice(0, 8)}...</code></span>
                          <span>{new Date(n.createdAt).toLocaleString()}</span>
                        </div>
                        <div style={{ fontSize: 13, color: palette.text.primary, whiteSpace: 'pre-wrap' }}>
                          {n.note}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: palette.text.secondary, marginBottom: spacing.sm }}>
                    No internal notes yet.
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                  <TextArea
                    themeMode={themeMode}
                    id="new-internal-note-input"
                    data-testid="input-internal-note"
                    label="Add confidential note"
                    value={newNoteText}
                    onChange={(val) => setNewNoteText(typeof val === 'string' ? val : (val as unknown as { target: { value: string } }).target.value)}
                    rows={2}
                    placeholder="Enter internal operator notes..."
                  />
                  <div>
                    <Button
                      themeMode={themeMode}
                      variant="secondary"
                      data-testid="btn-add-internal-note"
                      disabled={isUpdating || !newNoteText.trim()}
                      onClick={handleAddNote}
                    >
                      Add note
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Audit Trail */}
              <Card themeMode={themeMode} style={{ padding: spacing.md }}>
                <h3 style={{ margin: `0 0 ${spacing.sm}px`, fontSize: 15, color: palette.text.primary }}>
                  Triage Audit Trail
                </h3>
                {auditTrail.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                    {auditTrail.map((ev) => (
                      <div
                        key={ev.id}
                        data-testid={`audit-event-${ev.id}`}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '4px 8px',
                          borderRadius: radii.sm,
                          backgroundColor: palette.background,
                        }}
                      >
                        <div>
                          <strong style={{ color: palette.text.primary }}>{ev.action}</strong>
                          <span style={{ color: palette.text.secondary, marginLeft: 6 }}>
                            {JSON.stringify(ev.details)}
                          </span>
                        </div>
                        <span style={{ color: palette.text.muted }}>
                          {new Date(ev.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: palette.text.secondary }}>
                    No audit records recorded yet.
                  </div>
                )}
              </Card>
            </div>
          ) : (
            <Card themeMode={themeMode} style={{ padding: spacing.lg, textAlign: 'center', color: palette.text.secondary }}>
              Select a report from the list to view details and triage.
            </Card>
          )}
        </div>
      </div>

      {/* Retention Purge Maintenance */}
      <Card themeMode={themeMode} style={{ marginTop: spacing.lg, padding: spacing.md }}>
        <h3 style={{ margin: `0 0 ${spacing.xs}px`, fontSize: 15, color: palette.text.primary }}>
          Report Retention Maintenance
        </h3>
        <p style={{ margin: `0 0 ${spacing.sm}px`, color: palette.text.secondary, fontSize: 13 }}>
          Purge terminal reports (resolved, closed, dismissed, duplicate) that exceed the retention window.
        </p>
        <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center' }}>
          <label style={{ fontSize: 13, color: palette.text.primary }}>Retention period (days):</label>
          <input
            type="number"
            data-testid="input-retention-days"
            value={retentionDays}
            min={1}
            max={365}
            onChange={(e) => setRetentionDays(parseInt(e.target.value, 10) || 90)}
            style={{
              width: 80,
              padding: '6px 10px',
              borderRadius: radii.sm,
              backgroundColor: palette.surfaceRaised,
              color: palette.text.primary,
              border: `1px solid ${palette.border.subtle}`,
              fontSize: 13,
            }}
          />
          <Button
            themeMode={themeMode}
            variant="danger"
            data-testid="btn-purge-expired"
            disabled={isUpdating}
            onClick={handlePurge}
          >
            Purge expired reports
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default function DeveloperFeedbackTriagePage() {
  return (
    <OperatorGate title="Feedback & Support Triage">
      <FeedbackTriageBody />
    </OperatorGate>
  );
}
