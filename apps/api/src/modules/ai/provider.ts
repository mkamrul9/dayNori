/**
 * Phase 55 — Provider adapters (repaired).
 * Fake/mock for local tests; live OpenAI-compatible adapter stays disabled unless
 * DAYNORI_AI_LIVE_ENABLED=true and credentials exist. No organizer tools.
 *
 * store:false is sent explicitly. It is NOT Zero Data Retention.
 */

import { CURRENT_AI_PROVIDER_DISCLOSURE_VERSION, isAiLiveProviderEnabled } from '@daynori/domain';

export type AiProviderMode = 'disabled' | 'fake' | 'unavailable' | 'live';

export type AiCompletionInput = {
  system: string;
  user: string;
  maxOutputTokens: number;
  signal?: AbortSignal;
};

export type AiCompletionResult = {
  text: string;
  promptTokensEstimate: number;
  completionTokensEstimate: number;
  usageKnown: boolean;
  mode: 'fake' | 'live';
};

export interface AiProviderAdapter {
  mode: AiProviderMode;
  disclosureVersion: string;
  complete(input: AiCompletionInput): Promise<AiCompletionResult>;
}

export type AiHttpTransport = (
  url: string,
  init: RequestInit
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const err = new Error('AI request cancelled');
    (err as { code?: string }).code = 'AI_CANCELLED';
    throw err;
  }
}

export class FakeAiProvider implements AiProviderAdapter {
  mode: AiProviderMode = 'fake';
  disclosureVersion = CURRENT_AI_PROVIDER_DISCLOSURE_VERSION;

  /** Test hook: await this gate before completing (for consent/cancel interleaving). */
  pauseGate: Promise<void> | null = null;

  async complete(input: AiCompletionInput): Promise<AiCompletionResult> {
    assertNotAborted(input.signal);
    if (this.pauseGate) {
      await Promise.race([
        this.pauseGate,
        new Promise<never>((_, reject) => {
          input.signal?.addEventListener(
            'abort',
            () => {
              const err = new Error('AI request cancelled');
              (err as { code?: string }).code = 'AI_CANCELLED';
              reject(err);
            },
            { once: true }
          );
        }),
      ]);
    }
    assertNotAborted(input.signal);

    const cited = [...input.user.matchAll(/\[source:([0-9a-f-]{36})#r(\d+)\]/gi)].map((m) => ({
      itemId: m[1]!,
      revision: Number(m[2]),
    }));
    if (cited.length === 0) {
      return {
        text: 'ABSTAIN: insufficient authorized sources',
        promptTokensEstimate: estimateTokens(input.system + input.user),
        completionTokensEstimate: 12,
        usageKnown: true,
        mode: 'fake',
      };
    }
    const lines = cited.map((c) => `[source:${c.itemId}#r${c.revision}]`);
    const text = `Based on authorized sources:\n${lines.join('\n')}`;
    return {
      text,
      promptTokensEstimate: estimateTokens(input.system + input.user),
      completionTokensEstimate: estimateTokens(text),
      usageKnown: true,
      mode: 'fake',
    };
  }
}

export class UnavailableAiProvider implements AiProviderAdapter {
  mode: AiProviderMode = 'unavailable';
  disclosureVersion = CURRENT_AI_PROVIDER_DISCLOSURE_VERSION;

  async complete(): Promise<AiCompletionResult> {
    throw Object.assign(new Error('AI provider unavailable'), { code: 'AI_PROVIDER_UNAVAILABLE' });
  }
}

/**
 * Live OpenAI Chat Completions adapter (provisional candidate).
 * Explicit store:false — does not claim ZDR/region guarantees.
 */
export class OpenAiCompatibleProvider implements AiProviderAdapter {
  mode: AiProviderMode = 'live';
  disclosureVersion = CURRENT_AI_PROVIDER_DISCLOSURE_VERSION;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://api.openai.com/v1',
    private readonly model = 'gpt-4o-mini',
    private readonly transport: AiHttpTransport = fetch as AiHttpTransport,
    private readonly timeoutMs = 30_000
  ) {
    if (this.disclosureVersion !== CURRENT_AI_PROVIDER_DISCLOSURE_VERSION) {
      throw new Error('AI_PROVIDER_DISCLOSURE_MISMATCH');
    }
  }

  /** Last request body (tests / diagnostics — never log private content in production sinks). */
  lastRequestBody: Record<string, unknown> | null = null;

  async complete(input: AiCompletionInput): Promise<AiCompletionResult> {
    assertNotAborted(input.signal);
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    input.signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const body = {
      model: this.model,
      temperature: 0,
      max_tokens: input.maxOutputTokens,
      store: false,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
    };
    this.lastRequestBody = body;

    try {
      const res = await this.transport(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        redirect: 'error',
      });
      if (!res.ok) {
        throw Object.assign(new Error(`Provider HTTP ${res.status}`), {
          code: 'AI_PROVIDER_ERROR',
        });
      }
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
        usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
      };
      const rawText = json.choices?.[0]?.message?.content;
      if (typeof rawText !== 'string') {
        throw Object.assign(new Error('Malformed provider response'), {
          code: 'AI_PROVIDER_MALFORMED',
        });
      }
      const text = rawText.trim() || 'ABSTAIN: empty provider response';
      if (text.length > 20_000) {
        throw Object.assign(new Error('Provider response too large'), {
          code: 'AI_PROVIDER_MALFORMED',
        });
      }
      const promptKnown = typeof json.usage?.prompt_tokens === 'number';
      const completionKnown = typeof json.usage?.completion_tokens === 'number';
      return {
        text,
        promptTokensEstimate: promptKnown
          ? Number(json.usage!.prompt_tokens)
          : estimateTokens(input.system + input.user),
        completionTokensEstimate: completionKnown
          ? Number(json.usage!.completion_tokens)
          : estimateTokens(text),
        usageKnown: promptKnown && completionKnown,
        mode: 'live',
      };
    } finally {
      clearTimeout(timer);
      input.signal?.removeEventListener('abort', onAbort);
    }
  }
}

export function resolveAiProvider(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
  options?: { transport?: AiHttpTransport; fake?: FakeAiProvider }
): AiProviderAdapter {
  const preferFake =
    (env['DAYNORI_AI_PROVIDER'] ?? 'fake') === 'fake' || env['NODE_ENV'] === 'test';
  if (preferFake || !isAiLiveProviderEnabled(env)) {
    if ((env['DAYNORI_AI_PROVIDER'] ?? '') === 'openai' && !isAiLiveProviderEnabled(env)) {
      return new UnavailableAiProvider();
    }
    return options?.fake ?? new FakeAiProvider();
  }
  const key = env['OPENAI_API_KEY'] ?? env['DAYNORI_OPENAI_API_KEY'];
  if (!key) return new UnavailableAiProvider();
  return new OpenAiCompatibleProvider(
    key,
    env['OPENAI_BASE_URL'] ?? 'https://api.openai.com/v1',
    env['OPENAI_MODEL'] ?? 'gpt-4o-mini',
    options?.transport
  );
}
