import { ipcMain } from 'electron';
import { aiClient, AIError, type ConversationHistoryEntry } from '../ai/client.js';
import { buildAIContext } from '../ai/context-builder.js';
import { aiMessagesRepo } from '../db/repositories/ai_messages.js';
import { applyMutations } from '../ai/mutation-executor.js';
import { isGenerationActive } from './generate.js';
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

// Sohbet temizlendiğinde artan epoch; uçuştaki bir ai:parse await'i temizlemeden SONRA dönerse
// mesajları YENİDEN boş DB'ye yazmasın diye kullanılır (#15 — UI boş ama DB'de hayalet geçmiş).
let clearEpoch = 0;

function buildHistory(): ConversationHistoryEntry[] {
  const all = aiMessagesRepo.list();
  // ÖNCE user/assistant'a filtrele, SONRA son N'i al. Tersi (önce slice) tool-call ('system')
  // satırları pencereyi doldurunca gerçek user/assistant bağlamını eziyordu → çok-turlu referans
  // çözümleme (anafora) tool-yoğun oturumda sessizce başarısız oluyordu (#4-history).
  const convo: ConversationHistoryEntry[] = [];
  for (const m of all) {
    if (m.role === 'user') convo.push({ role: 'user', text: m.text });
    else if (m.role === 'assistant') convo.push({ role: 'assistant', text: m.text });
  }
  return convo.slice(-HISTORY_LIMIT);
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

    const epochAtStart = clearEpoch;
    try {
      const { response, toolCalls } = await aiClient.parseWithTools({
        text,
        context,
        history: conversationHistory,
      });

      // Çağrı uçuştayken kullanıcı 'Sohbeti temizle' dediyse (clearEpoch arttı), bu mesajları
      // YENİDEN yazma — yoksa UI boş kalıp DB'de hayalet geçmiş birikiyordu (#15). Yanıtı yine
      // döndür (kullanıcı bu turun cevabını görsün) ama kalıcılaştırma.
      if (clearEpoch !== epochAtStart) {
        return { ok: true, data: response };
      }

      // Mesajları yalnızca BAŞARILI çağrıdan sonra kalıcılaştır; aksi halde başarısız çağrı
      // DB'de yanıtsız bir 'user' mesajı bırakıp sonraki turda sarkık geçmiş üretiyordu (#21).
      let userMsgId: number | null = null;
      try {
        userMsgId = aiMessagesRepo.add({ role: 'user', text });
      } catch (e) {
        log.warn('AI kullanıcı mesajı kaydedilemedi', { error: String(e) });
      }

      // Kullanıcı mesajı yazılamadıysa, tool/assistant satırlarını parentId=null ile yazmak
      // YETİM kayıt bırakıyordu (buildHistory'de öncesinde 'user' olmayan sarkık 'assistant').
      // Kullanıcı satırı yoksa bu turun kalıcılaştırmasını tümden atla; yanıt yine döndürülür.
      if (userMsgId === null) {
        return { ok: true, data: response };
      }

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
      clearEpoch++; // uçuştaki ai:parse'ın temizlenen geçmişi geri yazmasını engelle (#15)
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

  ipcMain.handle(
    'ai:applyScheduleUpdate',
    async (_evt, raw: unknown): Promise<Result<ScheduleUpdateApplyResult>> => {
      // Canlı üretim sürerken gün/saat değişikliği, üretim biterken sonucun bayatlamış
      // saat indekslerine yazılmasına yol açar (#5 ailesi). Üretim bitene dek reddet.
      if (isGenerationActive()) {
        return {
          ok: false,
          error: {
            code: 'BUSY',
            message: 'Program üretimi sürerken plan değiştirilemez. Üretim bitince tekrar deneyin.',
          },
        };
      }
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
      // Canlı üretim sürerken aktivite/sınıf/öğretmen silme/ekleme, üretim biterken sonucun
      // artık var olmayan id'lere FK INSERT yapıp TÜM üretimi çökertmesine yol açıyordu (#5).
      // Üretim bitene dek mutasyonu reddet (veri kaybını önler).
      if (isGenerationActive()) {
        return {
          ok: false,
          error: {
            code: 'BUSY',
            message:
              'Program üretimi sürerken veri değiştirilemez. Üretim bitince (veya iptal edince) tekrar deneyin.',
          },
        };
      }
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
