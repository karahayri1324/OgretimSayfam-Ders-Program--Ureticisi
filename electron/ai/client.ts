import axios, { AxiosError } from 'axios';
import type { AIResponse } from '../../src/lib/types.js';
import { validateAIResponse } from './schema.js';
import type { AIContext } from './mock-server.js';
import { settingsRepo } from '../db/repositories/settings.js';
import { executeTool, type ToolResult } from './tools.js';
import { log } from '../utils/logger.js';

export type ConversationHistoryEntry =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string }
  | { role: 'system'; text: string };

export type ParseRequest = {
  text: string;
  context: AIContext;
  history?: ConversationHistoryEntry[];
};

export type ToolHistoryEntry = {
  role: 'tool';
  tool: string;
  args: Record<string, unknown>;
  result: ToolResult;
};

export type ParseWithToolsResult = {
  response: AIResponse;
  toolCalls: ToolHistoryEntry[];
};

export class AIError extends Error {
  readonly code: 'AI_ERROR' | 'AI_TIMEOUT' | 'AI_INVALID_RESPONSE';
  readonly cause?: unknown;
  constructor(code: 'AI_ERROR' | 'AI_TIMEOUT' | 'AI_INVALID_RESPONSE', message: string, cause?: unknown) {
    super(message);
    this.code = code;
    this.cause = cause;
    this.name = 'AIError';
  }
}

export const MAX_TOOL_ITERATIONS = 3;

function readMaxToolIterations(): number {
  try {
    const raw = settingsRepo.get('aiMaxToolIterations');
    const n = parseInt(String(raw ?? ''), 10);
    if (Number.isFinite(n) && n >= 1 && n <= 10) return n;
  } catch {
  }
  return MAX_TOOL_ITERATIONS;
}

function readTimeoutMs(): number {
  try {
    const raw =
      settingsRepo.get('aiTimeoutSec') ?? settingsRepo.get('aiTimeout');
    const n = parseInt(String(raw ?? ''), 10);
    if (Number.isFinite(n) && n > 0) return n * 1000;
  } catch {
  }
  return 30_000;
}

const LOCAL_DEFAULT_ENDPOINT = 'http://localhost:8000';
const SERVER_ENDPOINT = '';

function readEndpoint(): string {
  try {
    const mode = settingsRepo.get('aiMode');
    if (mode === 'server') {
      const v = settingsRepo.get('aiServerEndpoint');
      const ep = typeof v === 'string' ? v.trim() : '';
      return ep || SERVER_ENDPOINT;
    }
    const v = settingsRepo.get('aiLocalEndpoint');
    const ep = typeof v === 'string' ? v.trim() : '';
    return ep || LOCAL_DEFAULT_ENDPOINT;
  } catch {
    return LOCAL_DEFAULT_ENDPOINT;
  }
}

function coerceJson(raw: unknown): unknown {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return raw;
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) s = fence[1].trim();
  try {
    return JSON.parse(s);
  } catch {
  }
  const i = s.indexOf('{');
  const j = s.lastIndexOf('}');
  if (i >= 0 && j > i) {
    try {
      return JSON.parse(s.slice(i, j + 1));
    } catch {
    }
  }
  return raw;
}

type RoundtripOpts = { noMoreTools?: boolean };

async function singleRoundtrip(
  text: string,
  context: AIContext,
  toolHistory: ToolHistoryEntry[],
  conversationHistory: ConversationHistoryEntry[],
  opts: RoundtripOpts = {},
): Promise<AIResponse> {
  const endpoint = readEndpoint();
  if (!endpoint) {
    throw new AIError(
      'AI_ERROR',
      'AI uç noktası ayarlı değil. Ayarlar → AI bölümünden Yerel veya Sunucu uç noktasını girin.',
    );
  }

  const body = {
    text,
    context,
    history: conversationHistory,
    toolHistory,
    noMoreTools: opts.noMoreTools === true,
  };

  const post = async (): Promise<unknown> => {
    try {
      const res = await axios.post(endpoint, body, {
        timeout: readTimeoutMs(),
        headers: { 'Content-Type': 'application/json' },
      });
      return res.data;
    } catch (e) {
      const ax = e as AxiosError;
      if (ax.code === 'ECONNABORTED' || ax.message?.toLowerCase().includes('timeout')) {
        throw new AIError('AI_TIMEOUT', 'AI sunucusu yanıt vermedi (zaman aşımı).', e);
      }
      const status = ax.response?.status;
      const detail = status ? `HTTP ${status}` : ax.message;
      throw new AIError('AI_ERROR', `AI sunucusuna ulaşılamadı: ${detail}`, e);
    }
  };

  const raw = await post();
  try {
    return validateAIResponse(coerceJson(raw));
  } catch (firstErr) {
    log.warn('AI yanıtı doğrulanamadı, yeniden deneniyor', {
      error: firstErr instanceof Error ? firstErr.message : String(firstErr),
    });
    let raw2: unknown;
    try {
      raw2 = await post();
    } catch (e) {
      throw e;
    }
    try {
      return validateAIResponse(coerceJson(raw2));
    } catch (secondErr) {
      const msg = secondErr instanceof Error ? secondErr.message : String(secondErr);
      throw new AIError('AI_INVALID_RESPONSE', `AI yanıtı doğrulanamadı: ${msg}`, secondErr);
    }
  }
}

export const aiClient = {
  async parse({ text, context, history = [] }: ParseRequest): Promise<AIResponse> {
    return singleRoundtrip(text, context, [], history);
  },

  async parseWithTools({
    text,
    context,
    history = [],
  }: ParseRequest): Promise<ParseWithToolsResult> {
    const toolHistory: ToolHistoryEntry[] = [];
    const maxIterations = readMaxToolIterations();

    for (let i = 0; i < maxIterations; i++) {
      const isLastTurn = i === maxIterations - 1;
      const response = await singleRoundtrip(text, context, toolHistory, history, {
        noMoreTools: isLastTurn,
      });

      if (response.kind !== 'tool_call') {
        return { response, toolCalls: toolHistory };
      }

      const toolName = response.tool;
      const args = response.args ?? {};
      const result = executeTool(toolName, args);
      log.info('AI tool çağrısı', {
        tool: toolName,
        args,
        ok: !('error' in result),
        iteration: i + 1,
      });
      toolHistory.push({ role: 'tool', tool: toolName, args, result });
    }

    log.warn('AI tool iterasyon limiti aşıldı', { max: maxIterations });
    const fallback: AIResponse = {
      kind: 'query',
      answer:
        'Talebinizi tamamlayamadım (tool çağrı limiti aşıldı). Lütfen daha açık bir biçimde tekrar yazın.',
      confidence: 0.3,
    };
    return { response: fallback, toolCalls: toolHistory };
  },
};
