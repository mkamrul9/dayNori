import {
  HealthResponseSchema,
  SmokeResponseSchema,
  type HealthResponse,
  type SmokeResponse,
} from '@daynori/contracts';

export interface ApiClientOptions {
  baseUrl: string;
  fetchFn?: typeof fetch;
}

export class DaynoriApiClient {
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetch = options.fetchFn ?? globalThis.fetch;
  }

  async getHealth(): Promise<HealthResponse> {
    const response = await this.fetch(`${this.baseUrl}/health`);
    if (!response.ok) {
      throw new Error(`Health check failed with status: ${response.status}`);
    }
    const json = await response.json();
    return HealthResponseSchema.parse(json);
  }

  async getSmoke(): Promise<SmokeResponse> {
    const response = await this.fetch(`${this.baseUrl}/api/v1/smoke`);
    if (!response.ok) {
      throw new Error(`Smoke check failed with status: ${response.status}`);
    }
    const json = await response.json();
    return SmokeResponseSchema.parse(json);
  }
}

export function createApiClient(options: ApiClientOptions): DaynoriApiClient {
  return new DaynoriApiClient(options);
}
