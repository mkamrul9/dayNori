export const UNCONFIGURED_DELIVERY_NOTICE =
  'Receipt acknowledged by server. External developer inbox is not configured in this preview.';

export const CONFIGURED_DELIVERY_QUEUED_NOTICE =
  'Receipt acknowledged by server. Delivery to support destination queued.';

export const CONFIGURED_DELIVERY_COMPLETED_NOTICE =
  'Receipt acknowledged by server. Delivered to support queue.';

export interface ExternalDeliveryConfig {
  webhookUrl?: string;
  emailTo?: string;
  ticketEndpoint?: string;
}

/**
 * Checks whether an external developer delivery destination is configured.
 * Never invents a monitored inbox or false delivery promise.
 */
export function isExternalDeliveryConfigured(config: ExternalDeliveryConfig): boolean {
  if (config.webhookUrl && config.webhookUrl.trim().length > 0) return true;
  if (config.emailTo && config.emailTo.trim().length > 0) return true;
  if (config.ticketEndpoint && config.ticketEndpoint.trim().length > 0) return true;
  return false;
}
