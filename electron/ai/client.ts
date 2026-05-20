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

/** Varsayılan tool iterasyon limiti. `aiMaxToolIterations` ayarı ile [1,10] aralığında geçersiz kılınabilir. */
export const MAX_TOOL_ITERATIONS = 3;

function readMaxToolIterations(): number {
  try {
    const raw = settingsRepo.get('aiMaxToolIterations');
    const n = parseInt(String(raw ?? ''), 10);
    if (Number.isFinite(n) && n >= 1 && n <= 10) return n;
  } catch {
    // ayar okunamadı — varsayılana düş
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
// Sunucu modu uç noktası — sunucu adresi burada/uygulama tarafında ayarlanır.
// (Ayarlar'da artık URL alanı yok; kullanıcı sunucu adresini kendi yönetir.)
const SERVER_ENDPOINT = '';

/**
 * Aktif AI uç noktası. İki mod var:
 * - 'server' → kullanıcının uzak sunucu uç noktası (henüz boş olabilir)
 * - 'local'  (varsayılan) → localhost'taki yerel LLM
 * Mock kaldırıldı; uç nokta boşsa istek anlamlı bir hata ile başarısız olur.
 */
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

async function singleRoundtrip(
  text: string,
  context: AIContext,
  toolHistory: ToolHistoryEntry[],
  conversationHistory: ConversationHistoryEntry[],
): Promise<AIResponse> {
  const endpoint = readEndpoint();
  if (!endpoint) {
    throw new AIError(
      'AI_ERROR',
      'AI uç noktası ayarlı değil. Ayarlar → AI bölümünden Yerel veya Sunucu uç noktasını girin.',
    );
  }

  let raw: unknown;
  try {
    const res = await axios.post(
      endpoint,
      {
        text,
        context,
        history: conversationHistory,
        toolHistory,
      },
      {
        timeout: readTimeoutMs(),
        headers: { 'Content-Type': 'application/json' },
      },
    );
    raw = res.data;
  } catch (e) {
    const ax = e as AxiosError;
    if (ax.code === 'ECONNABORTED' || ax.message?.toLowerCase().includes('timeout')) {
      throw new AIError('AI_TIMEOUT', 'AI sunucusu yanıt vermedi (zaman aşımı).', e);
    }
    const status = ax.response?.status;
    const detail = status ? `HTTP ${status}` : ax.message;
    throw new AIError('AI_ERROR', `AI sunucusuna ulaşılamadı: ${detail}`, e);
  }

  try {
    return validateAIResponse(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new AIError('AI_INVALID_RESPONSE', `AI yanıtı doğrulanamadı: ${msg}`, e);
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
      const response = await singleRoundtrip(text, context, toolHistory, history);

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
