/**
 * Phase 55 — Provider adapters.
 * Fake/mock for local tests; live OpenAI-compatible adapter stays disabled unless
 * DAYNORI_AI_LIVE_ENABLED=true and credentials exist. No organizer tools.
 */

import { isAiLiveProviderEnabled } from '@daynori/domain';

export type AiProviderMode = 'disabled' | 'fake' | 'unavailable' | 'live';

export type AiCompletionInput = {
  system: string;
  user: string;
  maxOutputTokens: number;
};

export type AiCompletionResult = {
  text: string;
  promptTokensEstimate: number;
  completionTokensEstimate: number;
  mode: 'fake' | 'live';
};

export interface AiProviderAdapter {
  mode: AiProviderMode;
  complete(input: AiCompletionInput): Promise<AiCompletionResult>;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export class FakeAiProvider implements AiProviderAdapter {
  mode: AiProviderMode = 'fake';

  async complete(input: AiCompletionInput): Promise<AiCompletionResult> {
    // Deterministic: echo citation markers from context; never invent item ids.
    const cited = [...input.user.matchAll(/\[source:([0-9a-f-]{36})#r(\d+)\]/gi)].map(
      (m) => ({ itemId: m[1]!, revision: Number(m[2]) })
    );
    if (cited.length === 0) {
      return {
        text: 'ABSTAIN: insufficient authorized sources',
        promptTokensEstimate: estimateTokens(input.system + input.user),
        completionTokensEstimate: 12,
        mode: 'fake',
      };
    }
    const lines = cited.map((c) => `- ${c.itemId}#r${c.revision}`);
    return {
      text: `Based on authorized sources:\n${lines.join('\n')}`,
      promptTokensEstimate: estimateTokens(input.system + input.user),
      completionTokensEstimate: estimateTokens(lines.join('\n')) + 8,
      mode: 'fake',
    };
  }
}

export class UnavailableAiProvider implements AiProviderAdapter {
  mode: AiProviderMode = 'unavailable';

  async complete(): Promise<AiCompletionResult> {
    throw Object.assign(new Error('AI provider unavailable'), { code: 'AI_PROVIDER_UNAVAILABLE' });
  }
}

/**
 * Live OpenAI Chat Completions adapter (provisional candidate).
 * Does not claim ZDR/region guarantees. Secrets stay server-side.
 */
export class OpenAiCompatibleProvider implements AiProviderAdapter {
  mode: AiProviderMode = 'live';

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://api.openai.com/v1',
    private readonly model = 'gpt-4o-mini'
  ) {}

  async complete(input: AiCompletionInput): Promise<AiCompletionResult> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        max_tokens: input.maxOutputTokens,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw Object.assign(new Error(`Provider HTTP ${res.status}`), {
        code: 'AI_PROVIDER_ERROR',
      });
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = json.choices?.[0]?.message?.content?.trim() ?? '';
    return {
      text: text || 'ABSTAIN: empty provider response',
      promptTokensEstimate: json.usage?.prompt_tokens ?? estimateTokens(input.system + input.user),
      completionTokensEstimate: json.usage?.completion_tokens ?? estimateTokens(text),
      mode: 'live',
    };
  }
}

export function resolveAiProvider(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): AiProviderAdapter {
  const preferFake = (env['DAYNORI_AI_PROVIDER'] ?? 'fake') === 'fake' || env['NODE_ENV'] === 'test';
  if (preferFake || !isAiLiveProviderEnabled(env)) {
    if ((env['DAYNORI_AI_PROVIDER'] ?? '') === 'openai' && !isAiLiveProviderEnabled(env)) {
      return new UnavailableAiProvider();
    }
    return new FakeAiProvider();
  }
  const key = env['OPENAI_API_KEY'] ?? env['DAYNORI_OPENAI_API_KEY'];
  if (!key) return new UnavailableAiProvider();
  return new OpenAiCompatibleProvider(
    key,
    env['OPENAI_BASE_URL'] ?? 'https://api.openai.com/v1',
    env['OPENAI_MODEL'] ?? 'gpt-4o-mini'
  );
}
