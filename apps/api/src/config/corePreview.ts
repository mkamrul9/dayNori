/** The free preview has no scanner or worker. Reject new work that requires either. */
export function isUnavailableInCorePreview(method: string, rawUrl: string): boolean {
  const path = new URL(rawUrl, 'http://api.internal').pathname;
  if (path.startsWith('/v1/storage/')) return true;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS' || method === 'DELETE') {
    return false;
  }
  return (
    /\/files(?:\/|$)/.test(path) ||
    /\/attachments(?:\/|$)/.test(path) ||
    /\/reminders(?:\/|$)/.test(path) ||
    path.startsWith('/v1/devices') ||
    path.startsWith('/v1/web-push')
  );
}
