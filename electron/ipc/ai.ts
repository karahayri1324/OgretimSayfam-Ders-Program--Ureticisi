import { ipcMain } from 'electron';
import { aiClient, AIError, type ConversationHistoryEntry } from '../ai/client.js';
import { buildAIContext } from '../ai/context-builder.js';
import { aiMessagesRepo } from '../db/repositories/ai_messages.js';
import { applyMutations } from '../ai/mutation-executor.js';
import {
  applyScheduleUpdate,
  type ScheduleUpdateApplyResult,
} from '../ai/schedule-executor.js';
import {
  DataMutationActionSchema,
  ScheduleUpdateResponseSchema,
} from '../ai/schema.js';
import { z } from 'zod';
import { log } from '../utils/logger.js';
import type {
  Result,
  AIResponse,
  AIMessage,
  AIScheduleUpdateResponse,
  DataMutationAction,
  DataMutationApplyResult,
} from '../../src/lib/types.js';

const HISTORY_LIMIT = 10;

function buildHistory(): ConversationHistoryEntry[] {
  const all = aiMessagesRepo.list();
  const slice = all.slice(-HISTORY_LIMIT);
  const out: ConversationHistoryEntry[] = [];
  for (const m of slice) {
    if (m.role === 'user') out.push({ role: 'user', text: m.text });
    else if (m.role === 'assistant') out.push({ role: 'assistant', text: m.text });
  }
  return out;
}

const ApplyMutationsSchema = z.array(DataMutationActionSchema).min(1);

export function registerAiHandlers(): void {
  ipcMain.handle('ai:parse', async (_evt, text: unknown): Promise<Result<AIResponse>> => {
    if (typeof text !== 'string' || !text.trim()) {
      return {
        ok: false,
        error: { code: 'VALIDATION', message: 'Metin boş olamaz.' },
      };
    }

    let conversationHistory: ConversationHistoryEntry[] = [];
    try {
      conversationHistory = buildHistory();
    } catch (e) {
      log.warn('AI geçmişi okunamadı', { error: String(e) });
    }

    let userMsgId: number | null = null;
    try {
      userMsgId = aiMessagesRepo.add({ role: 'user', text });
    } catch (e) {
      log.warn('AI kullanıcı mesajı kaydedilemedi', { error: String(e) });
    }

    let context;
    try {
      context = buildAIContext();
    } catch (e) {
      log.error('AI context oluşturulamadı', { error: String(e) });
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: 'Okul verisi okunamadı.' },
      };
    }

    try {
      const { response, toolCalls } = await aiClient.parseWithTools({
        text,
        context,
        history: conversationHistory,
      });

      for (const tc of toolCalls) {
        try {
          aiMessagesRepo.add({
            role: 'system',
            text: JSON.stringify({
              kind: 'tool_call',
              tool: tc.tool,
              args: tc.args,
              result: tc.result,
            }),
            parentId: userMsgId,
          });
        } catch (e) {
          log.warn('AI tool çağrısı kaydedilemedi', { error: String(e) });
        }
      }

      try {
        aiMessagesRepo.add({
          role: 'assistant',
          text: JSON.stringify(response),
          parentId: userMsgId,
        });
      } catch (e) {
        log.warn('AI yanıt mesajı kaydedilemedi', { error: String(e) });
      }
      return { ok: true, data: response };
    } catch (e) {
      if (e instanceof AIError) {
        log.error('AI hatası', { code: e.code, message: e.message });
        return {
          ok: false,
          error: { code: e.code, message: e.message },
        };
      }
      const msg = e instanceof Error ? e.message : String(e);
      log.error('AI beklenmedik hata', { error: msg });
      return {
        ok: false,
        error: { code: 'AI_ERROR', message: `AI hatası: ${msg}` },
      };
    }
  });

  ipcMain.handle('ai:history', async (): Promise<Result<AIMessage[]>> => {
    try {
      return { ok: true, data: aiMessagesRepo.list() };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error('AI geçmişi okunamadı', { error: msg });
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: `Geçmiş okunamadı: ${msg}` },
      };
    }
  });

  ipcMain.handle('ai:clearHistory', async (): Promise<Result<null>> => {
    try {
      aiMessagesRepo.clear();
      return { ok: true, data: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error('AI geçmişi temizlenemedi', { error: msg });
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: `Temizleme başarısız: ${msg}` },
      };
    }
  });

  /**
   * AI'nın "data_mutation" yanıtındaki action listesini kullanıcı onayından
   * sonra uygular. Tek tek action'ları sırayla işler; bazı kısımları başarısız
   * olsa da diğerleri devam eder (kısmen başarı). Sonuç objesi UI'a döner.
   */
  /**
   * AI'nın "schedule_update" yanıtını kullanıcı onayından sonra DB'ye uygular.
   * Action'a göre ilgili schedule-executor handler'ı çağırır
   * (extend_breaks | add_hours_to_day | set_hours_per_day | remove_day | add_day).
   *
   * Başarılı yanıtta { days, hours, dayHours } snapshot döner — UI tek
   * seferde useScheduleStore.load veya state set edebilir.
   */
  ipcMain.handle(
    'ai:applyScheduleUpdate',
    async (_evt, raw: unknown): Promise<Result<ScheduleUpdateApplyResult>> => {
      const parsed = ScheduleUpdateResponseSchema.safeParse(raw);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('; ');
        return {
          ok: false,
          error: {
            code: 'VALIDATION',
            message: `Geçersiz schedule_update yanıtı: ${issues}`,
          },
        };
      }
      try {
        const response = parsed.data as AIScheduleUpdateResponse;
        const result = applyScheduleUpdate(response);
        log.info('AI schedule_update uygulandı', {
          action: response.action,
        });
        return { ok: true, data: result };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log.error('AI schedule_update uygulanırken hata', { error: msg });
        return {
          ok: false,
          error: { code: 'DB_ERROR', message: msg },
        };
      }
    },
  );

  ipcMain.handle(
    'ai:applyMutations',
    async (_evt, raw: unknown): Promise<Result<DataMutationApplyResult>> => {
      const parsed = ApplyMutationsSchema.safeParse(raw);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('; ');
        return {
          ok: false,
          error: { code: 'VALIDATION', message: `Geçersiz action listesi: ${issues}` },
        };
      }
      try {
        const actions: DataMutationAction[] = parsed.data as DataMutationAction[];
        const result = applyMutations(actions);
        log.info('AI mutations toplu uygulandı', {
          requested: actions.length,
          applied: result.applied,
          errorCount: result.errors.length,
        });
        return { ok: true, data: result };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log.error('AI mutations uygulanırken hata', { error: msg });
        return {
          ok: false,
          error: { code: 'DB_ERROR', message: `İşlemler uygulanamadı: ${msg}` },
        };
      }
    },
  );
}
