import { GptAnalyzeResult } from '../ipc.js';
import {
  buildAnalyzePrompt,
  buildImprovePrompt,
  buildSimplifyPrompt,
  buildSystemPrompt,
} from './prompts.js';
import type {
  AnswerLanguage,
  AnswerLength,
  AnswerLevel,
  AnswerStyle,
} from '../ipc.js';

const MIN_COOLDOWN_MS = 1000; // hard floor in main process

export type OpenAIClientConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
};

export class OpenAIClient {
  private lastCallAt = 0;

  constructor(private cfg: OpenAIClientConfig) {}

  update(cfg: OpenAIClientConfig): void {
    this.cfg = cfg;
  }

  private async chat(prompt: string): Promise<GptAnalyzeResult> {
    const url = `${this.cfg.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const body = {
      model: this.cfg.model,
      temperature: this.cfg.temperature,
      max_tokens: this.cfg.maxTokens,
      response_format: { type: 'json_object' as const },
      messages: [
        { role: 'system' as const, content: buildSystemPrompt() },
        { role: 'user' as const, content: prompt },
      ],
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenAI HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenAI returned empty content.');

    let parsed: GptAnalyzeResult;
    try {
      parsed = JSON.parse(content) as GptAnalyzeResult;
    } catch {
      // Retry once: try to extract first {...} block
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('OpenAI returned non-JSON content.');
      parsed = JSON.parse(match[0]) as GptAnalyzeResult;
    }

    return normalizeResult(parsed);
  }

  ensureCooldown(cooldownMs: number): { ok: boolean; remainingMs: number } {
    const cd = Math.max(MIN_COOLDOWN_MS, cooldownMs);
    const remaining = this.lastCallAt + cd - Date.now();
    if (remaining > 0) return { ok: false, remainingMs: remaining };
    return { ok: true, remainingMs: 0 };
  }

  async analyze(args: {
    question: string;
    questionTranslationVi?: string;
    answerLanguage: AnswerLanguage;
    length: AnswerLength;
    level: AnswerLevel;
    style: AnswerStyle;
  }): Promise<GptAnalyzeResult> {
    const result = await this.chat(buildAnalyzePrompt(args));
    this.lastCallAt = Date.now();
    return result;
  }

  async improve(args: {
    question: string;
    currentAnswer: string;
    answerLanguage: AnswerLanguage;
    length: AnswerLength;
    level: AnswerLevel;
    style: AnswerStyle;
  }): Promise<GptAnalyzeResult> {
    const result = await this.chat(buildImprovePrompt(args));
    this.lastCallAt = Date.now();
    return result;
  }

  async simplify(args: {
    question: string;
    currentAnswer: string;
    answerLanguage: AnswerLanguage;
  }): Promise<GptAnalyzeResult> {
    const result = await this.chat(buildSimplifyPrompt(args));
    this.lastCallAt = Date.now();
    return result;
  }
}

function normalizeResult(raw: any): GptAnalyzeResult {
  return {
    question_meaning_vi: String(raw?.question_meaning_vi ?? ''),
    interviewer_intent_vi: String(raw?.interviewer_intent_vi ?? ''),
    suggested_answer: String(raw?.suggested_answer ?? ''),
    answer_translation_vi:
      raw?.answer_translation_vi == null
        ? null
        : String(raw.answer_translation_vi),
    useful_phrases: Array.isArray(raw?.useful_phrases)
      ? raw.useful_phrases.map((p: any) => ({
          phrase: String(p?.phrase ?? ''),
          meaning_vi: String(p?.meaning_vi ?? ''),
        }))
      : [],
  };
}

export async function testOpenAIConnection(cfg: OpenAIClientConfig): Promise<{
  ok: boolean;
  message: string;
}> {
  if (!cfg.apiKey) return { ok: false, message: 'API key is empty.' };
  try {
    const url = `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 5,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, message: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true, message: 'Connected to OpenAI successfully.' };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
