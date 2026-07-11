import axios, { AxiosError } from 'axios';
import type { AIResponse } from '../../src/lib/types.js';
import { validateAIResponse } from './schema.js';
import type { AIContext } from './mock-server.js';
import { settingsRepo } from '../db/repositories/settings.js';
import { executeTool, type ToolResult } from './tools.js';
import { API_BASE } from '../config.js';
import { getToken } from '../auth/session.js';
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
  reasoning: string;
};

export type ParseWithToolsResult = {
  response: AIResponse;
  toolCalls: ToolHistoryEntry[];
};

export type AIErrorCode =
  | 'AI_ERROR'
  | 'AI_TIMEOUT'
  | 'AI_INVALID_RESPONSE'
  | 'AI_UNAUTHORIZED'
  | 'AI_SUBSCRIPTION'
  | 'AI_RATE_LIMIT';

export class AIError extends Error {
  readonly code: AIErrorCode;
  readonly cause?: unknown;
  constructor(code: AIErrorCode, message: string, cause?: unknown) {
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

const AI_ENDPOINT = `${API_BASE}/v1/ai/respond`;

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
  const token = getToken();
  if (!token) {
    throw new AIError(
      'AI_UNAUTHORIZED',
      'Oturum bulunamadı. Lütfen giriş yapın.',
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
      const res = await axios.post(AI_ENDPOINT, body, {
        timeout: readTimeoutMs(),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      return res.data;
    } catch (e) {
      const ax = e as AxiosError<{ error?: string; message?: string }>;
      if (ax.code === 'ECONNABORTED' || ax.message?.toLowerCase().includes('timeout')) {
        throw new AIError('AI_TIMEOUT', 'AI sunucusu yanıt vermedi (zaman aşımı).', e);
      }
      const status = ax.response?.status;
      const serverMsg = ax.response?.data?.message;
      if (status === 401) {
        throw new AIError('AI_UNAUTHORIZED', serverMsg || 'Oturumunuz geçersiz. Lütfen tekrar giriş yapın.', e);
      }
      if (status === 403) {
        throw new AIError('AI_SUBSCRIPTION', serverMsg || 'Erişiminiz kısıtlandı.', e);
      }
      if (status === 429) {
        throw new AIError('AI_RATE_LIMIT', serverMsg || 'Saatlik istek limitinize ulaştınız.', e);
      }
      const detail = serverMsg || (status ? `HTTP ${status}` : ax.message);
      throw new AIError('AI_ERROR', `AI sunucusuna ulaşılamadı: ${detail}`, e);
    }
  };

  const raw = await post();
  try {
    return validateAIResponse(coerceJson(raw));
  } catch (err) {
    // Önceden burada ikinci bir post() yapılıyordu; bu sunucuda İKİNCİ bir saatlik kota
    // birimi tüketiyordu (#8) — aynı (genelde deterministik) çıktı için kullanıcı 2 hak
    // kaybediyordu. coerceJson zaten fence/fazla-metin toleranslı; doğrulama başarısızsa
    // kotayı yeniden harcamadan net hata ver.
    const msg = err instanceof Error ? err.message : String(err);
    log.warn('AI yanıtı doğrulanamadı', { error: msg });
    throw new AIError('AI_INVALID_RESPONSE', `AI yanıtı doğrulanamadı: ${msg}`, err);
  }
}

// Tool sonucunu sunucunun kabul edeceği boyuta (güvenli 40KB marj; sunucu limiti 50KB) kırp.
// Dizi sonuçlarında sığdığı kadar baş öğeyi tutup gizlenen sayıyı bildirir; diğer türlerde
// serileştirmeyi kısaltır. Kırpma modele "sonuç kısaltıldı" sinyali de verir.
const TOOL_RESULT_MAX = 40_000;
function capInner(value: unknown): unknown {
  let s: string;
  try {
    s = JSON.stringify(value);
  } catch {
    return value;
  }
  if (s.length <= TOOL_RESULT_MAX) return value;
  if (Array.isArray(value)) {
    const items: unknown[] = [];
    let acc = 0;
    for (const item of value) {
      const is = JSON.stringify(item)?.length ?? 0;
      if (acc + is > TOOL_RESULT_MAX - 300) break;
      items.push(item);
      acc += is;
    }
    return {
      truncated: true,
      total: value.length,
      shown: items.length,
      note: `Sonuç çok büyük (${value.length} öğe); ilk ${items.length} öğe gösteriliyor. Daha dar bir sorgu (ör. tek sınıf/öğretmen) verin.`,
      items,
    };
  }
  return {
    truncated: true,
    note: 'Tool sonucu boyut sınırını aştığı için kısaltıldı; daha dar bir sorgu verin.',
    preview: s.slice(0, TOOL_RESULT_MAX - 300),
  };
}

// ToolResult = { result } | { error }; error dalına dokunma (küçük), result dalının içeriğini kırp.
function capToolResult(r: ToolResult): ToolResult {
  if ('error' in r) return r;
  return { result: capInner(r.result) };
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
    // Çok-turlu tool döngüsü için TOPLAM süre bütçesi: her post()'un kendi timeout'u var ama
    // turların toplamı kullanıcıyı dakikalarca bekletebilir (#9). Toplam aşılırsa durdur.
    const deadline = Date.now() + readTimeoutMs() * maxIterations;

    for (let i = 0; i < maxIterations; i++) {
      if (Date.now() > deadline) {
        throw new AIError('AI_TIMEOUT', 'AI işlemi toplam süre sınırını aştı.');
      }
      const isLastTurn = i === maxIterations - 1;
      const response = await singleRoundtrip(text, context, toolHistory, history, {
        noMoreTools: isLastTurn,
      });

      if (response.kind !== 'tool_call') {
        return { response, toolCalls: toolHistory };
      }

      const toolName = response.tool;
      const args = response.args ?? {};
      const reasoning = typeof response.reasoning === 'string' ? response.reasoning : '';
      const result = executeTool(toolName, args);
      log.info('AI tool çağrısı', {
        tool: toolName,
        args,
        ok: !('error' in result),
        iteration: i + 1,
      });
      // Büyük tool sonuçları (örn. yüzlerce kısıtlı listActiveConstraints) sunucunun 50KB
      // sınırını aşıp bir sonraki turu 422 ile düşürüyordu. İstemcide güvenli bir marjla
      // (40KB) kırp — dizi sonuçlarında baş kısmı + kaç öğenin gizlendiğini bildir.
      toolHistory.push({ role: 'tool', tool: toolName, args, result: capToolResult(result), reasoning });
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
