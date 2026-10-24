/** Server-only object transport. User access is authorized by the API before use. */
export class SupabaseObjectStore {
  private readonly origin: string;

  constructor(
    private readonly config: { url: string; serviceRoleKey: string },
    private readonly transport: typeof fetch = fetch
  ) {
    const url = new URL(config.url);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    ) {
      throw new Error('Supabase storage requires an HTTPS origin');
    }
    if (!config.serviceRoleKey) throw new Error('Supabase storage requires a server credential');
    this.origin = url.origin;
  }

  private objectUrl(bucket: string, objectPath: string, authenticated = false): string {
    if (
      bucket !== 'private_assets' ||
      !objectPath ||
      objectPath.length > 1024 ||
      objectPath.split('/').some((part) => !/^[a-zA-Z0-9_-]+$/.test(part))
    ) {
      throw new Error('Invalid private object location');
    }
    return `${this.origin}/storage/v1/object/${authenticated ? 'authenticated/' : ''}${bucket}/${objectPath}`;
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.transport(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
        headers: {
          ...init.headers,
          apikey: this.config.serviceRoleKey,
          Authorization: `Bearer ${this.config.serviceRoleKey}`,
        },
      });
    } catch {
      // Provider responses and request URLs can contain private object names or credentials.
      throw new Error('Private object transport unavailable');
    }
  }

  async getObject(bucket: string, objectPath: string): Promise<Buffer | null> {
    const response = await this.request(this.objectUrl(bucket, objectPath, true), {
      method: 'GET',
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Private object read failed (${response.status})`);
    if (!response.body) throw new Error('Private object response missing body');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        total += chunk.value.length;
        if (total > 52_428_800) throw new Error('Private object exceeds transfer limit');
        chunks.push(chunk.value);
      }
      return Buffer.concat(chunks, total);
    } finally {
      await reader.cancel();
    }
  }

  async putObject(
    bucket: string,
    objectPath: string,
    bytes: Buffer,
    options?: { contentType?: string; upsert?: boolean }
  ): Promise<void> {
    if (bytes.length > 52_428_800) throw new Error('Private object exceeds transfer limit');
    const response = await this.request(this.objectUrl(bucket, objectPath), {
      method: 'POST',
      headers: {
        'Content-Type': options?.contentType ?? 'application/octet-stream',
        'x-upsert': String(options?.upsert ?? false),
      },
      body: new Uint8Array(bytes),
    });
    if (!response.ok) throw new Error(`Private object write failed (${response.status})`);
    await response.body?.cancel();
  }

  async headObject(
    bucket: string,
    objectPath: string
  ): Promise<{ contentLength: number; contentType: string } | null> {
    const response = await this.request(this.objectUrl(bucket, objectPath, true), {
      method: 'HEAD',
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Private object metadata failed (${response.status})`);
    const length = response.headers.get('content-length');
    const contentLength = length === null ? NaN : Number(length);
    if (!Number.isSafeInteger(contentLength) || contentLength < 0 || contentLength > 52_428_800) {
      throw new Error('Invalid private object size');
    }
    return {
      contentLength,
      contentType: response.headers.get('content-type') ?? 'application/octet-stream',
    };
  }

  async deleteObject(bucket: string, objectPath: string): Promise<void> {
    const response = await this.request(this.objectUrl(bucket, objectPath), { method: 'DELETE' });
    if (!response.ok && response.status !== 404)
      throw new Error(`Private object deletion failed (${response.status})`);
    await response.body?.cancel();
  }
}

export function createConfiguredObjectStore(
  env: NodeJS.ProcessEnv = process.env
): SupabaseObjectStore | undefined {
  if (!env['SUPABASE_URL'] && !env['SUPABASE_SERVICE_ROLE_KEY']) return undefined;
  if (!env['SUPABASE_URL'] || !env['SUPABASE_SERVICE_ROLE_KEY'])
    throw new Error('Incomplete Supabase storage configuration');
  return new SupabaseObjectStore({
    url: env['SUPABASE_URL'],
    serviceRoleKey: env['SUPABASE_SERVICE_ROLE_KEY'],
  });
}
