import type { DatabaseClient } from './worker.js';

export interface FeedbackDeliveryResult {
  status: 'completed' | 'failed';
  details: Record<string, unknown>;
}

/**
 * Handles durable background delivery jobs for user feedback/bug/contact reports.
 * Keeps report persistence and external delivery status distinct.
 * Never invents a monitored inbox or false delivery receipt.
 */
export async function handleFeedbackDeliveryJob(
  client: DatabaseClient,
  payload: Record<string, unknown>
): Promise<FeedbackDeliveryResult> {
  const reporterId = payload['reporterId'] as string | undefined;
  const clientReportId = payload['clientReportId'] as string | undefined;

  const webhookUrl = process.env['FEEDBACK_DELIVERY_WEBHOOK_URL']?.trim();
  const emailTo = process.env['FEEDBACK_DELIVERY_EMAIL_TO']?.trim();
  const isConfigured = Boolean(webhookUrl || emailTo);

  if (!isConfigured) {
    if (client && reporterId && clientReportId) {
      await client.query(
        `
        UPDATE app.feedback_reports
        SET delivery_status = 'unconfigured',
            updated_at = now()
        WHERE reporter_id = $1 AND client_report_id = $2
        `,
        [reporterId, clientReportId]
      );
    }
    return {
      status: 'completed',
      details: {
        deliveryStatus: 'unconfigured',
        notice: 'No external destination configured',
      },
    };
  }

  // If webhook is configured, dispatch HTTP POST with bounded timeout
  if (webhookUrl) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientReportId,
          reportType: payload['reportType'],
          category: payload['category'],
          summary: payload['summary'],
          replyEmail: payload['replyEmail'],
          deliveredAt: new Date().toISOString(),
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Webhook responded with status ${res.status}`);
      }

      if (client && reporterId && clientReportId) {
        await client.query(
          `
          UPDATE app.feedback_reports
          SET delivery_status = 'delivered',
              updated_at = now()
          WHERE reporter_id = $1 AND client_report_id = $2
          `,
          [reporterId, clientReportId]
        );
      }

      return {
        status: 'completed',
        details: {
          deliveryStatus: 'delivered',
          destination: webhookUrl,
        },
      };
    } catch (err) {
      if (client && reporterId && clientReportId) {
        await client.query(
          `
          UPDATE app.feedback_reports
          SET delivery_status = 'failed',
              updated_at = now()
          WHERE reporter_id = $1 AND client_report_id = $2
          `,
          [reporterId, clientReportId]
        );
      }
      throw err;
    }
  }

  return {
    status: 'completed',
    details: {
      deliveryStatus: 'queued',
      destination: emailTo,
    },
  };
}

/**
 * Handles bounded retention cleanup for expired feedback reports.
 * Deletes terminal reports (resolved, closed, dismissed, duplicate)
 * exceeding retentionDays (default 90).
 */
export async function handleFeedbackRetentionCleanupJob(
  client: DatabaseClient,
  payload: Record<string, unknown>
): Promise<FeedbackDeliveryResult> {
  const retentionDays =
    typeof payload['retentionDays'] === 'number' ? payload['retentionDays'] : 90;

  if (client) {
    const res = await client.query<{ purge_expired_feedback_reports: number }>(
      `SELECT app.purge_expired_feedback_reports($1) AS purge_expired_feedback_reports`,
      [retentionDays]
    );
    const purgedCount = res.rows[0]?.purge_expired_feedback_reports ?? 0;
    return {
      status: 'completed',
      details: {
        taskType: 'feedback_retention_cleanup',
        purgedCount,
        retentionDays,
      },
    };
  }

  return {
    status: 'completed',
    details: {
      taskType: 'feedback_retention_cleanup',
      purgedCount: 0,
      retentionDays,
    },
  };
}
