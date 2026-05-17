import axios, { AxiosError } from 'axios';
import type { AIResponse } from '../../src/lib/types.js';
import { validateAIResponse } from './schema.js';
import { mockParse, type AIContext } from './mock-server.js';
import { settingsRepo } from '../db/repositories/settings.js';
import { executeTool, type ToolResult } from './tools.js';
import { log } from '../utils/logger.js';

/**
 * Sohbet geçmişi — multi-turn context. AI'a yollanan son N mesajdır,
 * en azından son 10 mesaj geri gider (IPC layer'da slicing yapılır).
 *
 * `role: 'tool'` özel: aynı turdaki tool çağrılarını AI'ya geri gönderir
 * (mock için ekstra context, gerçek LLM bunu function_call output'u olarak görür).
 */
export type ConversationHistoryEntry =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string }
  | { role: 'system'; text: string };

export type ParseRequest = {
  text: string;
  context: AIContext;
  /** Multi-turn: önceki kullanıcı/asistan mesajları. */
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

/**
 * AI istemcisi — settings.aiEndpoint'e bakar:
 *   - boş veya "mock://local" → mockParse()
 *   - aksi takdirde axios.post(endpoint)
 *
 * Hata kodları (caller bunları yakalayıp IPC error.code'una çevirir):
 *   - AI_TIMEOUT       — axios timeout
 *   - AI_INVALID_RESPONSE — zod doğrulamasından geçemedi
 *   - AI_ERROR         — diğer ağ/servis hataları
 *
 * Agentic mode (parseWithTools):
 *   - AI "tool_call" döndürürse uygun tool çalıştırılıp sonuç history'e
 *     eklenerek tekrar AI'ya gönderilir.
 *   - Max iterasyon `MAX_TOOL_ITERATIONS` (3) — sonsuz döngü engeli.
 *   - Mock için: mock-server kendi içinde tool sonucu kullanarak tek
 *     seferde query response döndürebilir (deterministik kısayol).
 */
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

function readTimeoutMs(): number {
  try {
    // Yeni anahtar tercih edilir; eski `aiTimeout` yedek (backward compat).
    const raw =
      settingsRepo.get('aiTimeoutSec') ?? settingsRepo.get('aiTimeout');
    const n = parseInt(String(raw ?? ''), 10);
    if (Number.isFinite(n) && n > 0) return n * 1000;
  } catch {
    // settings okunamadıysa default
  }
  return 30_000;
}

function readEndpoint(): string {
  try {
    const v = settingsRepo.get('aiEndpoint');
    return typeof v === 'string' ? v : '';
  } catch {
    return '';
  }
}

/** Tek bir AI istek-cevap turu — endpoint'e POST ya da mock. */
async function singleRoundtrip(
  text: string,
  context: AIContext,
  toolHistory: ToolHistoryEntry[],
  conversationHistory: ConversationHistoryEntry[],
): Promise<AIResponse> {
  const endpoint = readEndpoint();
  const useMock = !endpoint || endpoint === 'mock://local';

  let raw: unknown;
  if (useMock) {
    // Mock için geçmişi tek bir array olarak yolla (history her iki tür de içerebilir).
    raw = await mockParse(text, context, [
      ...conversationHistory,
      ...toolHistory.map(
        (t): ConversationHistoryEntry => ({
          role: 'system' as const,
          text: `tool:${t.tool} ${JSON.stringify(t.result)}`,
        }),
      ),
    ]);
  } else {
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
  }

  try {
    return validateAIResponse(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new AIError('AI_INVALID_RESPONSE', `AI yanıtı doğrulanamadı: ${msg}`, e);
  }
}

export const aiClient = {
  /**
   * Tek round — backward compat. Tool çağrılarını otomatik çözmez.
   * Yeni kodda parseWithTools tercih edilmeli.
   */
  async parse({ text, context, history = [] }: ParseRequest): Promise<AIResponse> {
    return singleRoundtrip(text, context, [], history);
  },

  /**
   * Agentic round — AI tool_call dönerse tool'u çalıştırıp tool history'i
   * büyüterek tekrar AI'ya gönderir. Max 3 iterasyon.
   *
   * Mock server tool sonucunu kendi içinde kullanıp tek seferde
   * query response döndürebileceği için pratikte 1-2 round yeter.
   *
   * `history`: önceki kullanıcı/asistan mesajları (multi-turn context).
   */
  async parseWithTools({
    text,
    context,
    history = [],
  }: ParseRequest): Promise<ParseWithToolsResult> {
    const toolHistory: ToolHistoryEntry[] = [];

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await singleRoundtrip(text, context, toolHistory, history);

      if (response.kind !== 'tool_call') {
        return { response, toolCalls: toolHistory };
      }

      // Tool çağır
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

    // 3 iterasyon dolmuş ve hâlâ tool_call istiyor — son çareyle "anlayamadım"
    // benzeri bir response döndür.
    log.warn('AI tool iterasyon limiti aşıldı', { max: MAX_TOOL_ITERATIONS });
    const fallback: AIResponse = {
      kind: 'query',
      answer:
        'Talebinizi tamamlayamadım (tool çağrı limiti aşıldı). Lütfen daha açık bir biçimde tekrar yazın.',
      confidence: 0.3,
    };
    return { response: fallback, toolCalls: toolHistory };
  },
};
