import { useState, useRef, useEffect } from 'react';
import {
  Send,
  Sparkles,
  Check,
  X,
  AlertTriangle,
  Info,
  Wrench,
  Database,
  Trash2,
  Copy,
  Eraser,
  Wand2,
  UserPlus,
  GraduationCap,
  PlayCircle,
} from 'lucide-react';
import { tr } from '../../lib/i18n';
import { cn } from '../../lib/cn';
import { useAIChatStore } from '../../store/ai-chat';
import { useConstraintsStore } from '../../store/constraints';
import { useTeachersStore } from '../../store/teachers';
import { useSubjectsStore } from '../../store/subjects';
import { useClassesStore } from '../../store/classes';
import { useRoomsStore } from '../../store/rooms';
import { useActivitiesStore } from '../../store/activities';
import { useScheduleStore } from '../../store/schedule';
import { useGenerateStore } from '../../store/generate';
import { useToastStore } from '../../store/toast';
import { useNavigate } from 'react-router-dom';
import type {
  AIConstraint,
  AIResponse,
  AIScheduleUpdateResponse,
  AIRunSolverResponse,
  DataMutationAction,
  DataMutationApplyResult,
} from '../../lib/types';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  response?: AIResponse;
  status?: 'pending' | 'confirmed' | 'rejected';
};

export default function AIPanel() {
  const [collapsed, setCollapsed] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const runSolver = useGenerateStore((s) => s.run);
  const messages = useAIChatStore((s) => s.messages);
  const addMessage = useAIChatStore((s) => s.addMessage);
  const updateMessage = useAIChatStore((s) => s.updateMessage);
  const clearMessages = useAIChatStore((s) => s.clear);
  const pendingPrompt = useAIChatStore((s) => s.pendingPrompt);
  const consumePendingPrompt = useAIChatStore((s) => s.consumePendingPrompt);
  const panelOpenSignal = useAIChatStore((s) => s.panelOpenSignal);
  const { addConstraint } = useConstraintsStore();
  const loadTeachers = useTeachersStore((s) => s.load);
  const loadSubjects = useSubjectsStore((s) => s.load);
  const loadClasses = useClassesStore((s) => s.load);
  const loadRooms = useRoomsStore((s) => s.load);
  const loadActivities = useActivitiesStore((s) => s.load);
  const loadSchedule = useScheduleStore((s) => s.load);
  const toastSuccess = useToastStore((s) => s.success);
  const toastError = useToastStore((s) => s.error);
  const toastInfo = useToastStore((s) => s.info);
  const toastWarn = useToastStore((s) => s.warn);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

  /**
   * Panel açma sinyali — Welcome/Quick-action gibi panel-dışı kaynaklar
   * çağırdığında collapsed=false yap. Sinyal sayısı arttığında tetiklenir.
   */
  useEffect(() => {
    if (panelOpenSignal > 0) setCollapsed(false);
  }, [panelOpenSignal]);

  /**
   * pendingPrompt store'a bir prompt geldiğinde:
   *   - mode='fill' → input'a yaz + focus
   *   - mode='send' → otomatik gönder
   * Tükettikten sonra store'u temizle (consumePendingPrompt nullable döner).
   */
  useEffect(() => {
    if (!pendingPrompt) return;
    const pending = consumePendingPrompt();
    if (!pending) return;
    if (pending.mode === 'send') {
      // doğrudan handleSend ile gönder
      void doSend(pending.text);
    } else {
      setInput(pending.text);
      // textarea'yı kullanıcıya görünür kılalım
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(
          pending.text.length,
          pending.text.length,
        );
      }, 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt]);

  /** Discriminated union helper — kind eksikse "constraint" sayar. */
  function responseText(res: AIResponse): string {
    const kind = res.kind ?? 'constraint';
    switch (kind) {
      case 'query':
        return (res as { answer: string }).answer;
      case 'tool_call':
        return `Tool çağrısı: ${(res as { tool: string }).tool}`;
      case 'schedule_update':
        return (res as { explanation: string }).explanation;
      case 'data_mutation':
        return (res as { explanation: string }).explanation;
      case 'constraint':
      default:
        return (res as { explanation: string }).explanation;
    }
  }

  /** İlgili stores'ları uygulanan işlem türlerine göre yeniden yükler. */
  async function reloadAffectedStores(actions: DataMutationAction[]): Promise<void> {
    const ops = new Set(actions.map((a) => a.op));
    const promises: Array<Promise<unknown>> = [];
    if ([...ops].some((o) => o.includes('teacher'))) promises.push(loadTeachers());
    if ([...ops].some((o) => o.includes('subject'))) promises.push(loadSubjects());
    if ([...ops].some((o) => o.includes('class'))) promises.push(loadClasses());
    if ([...ops].some((o) => o.includes('room'))) promises.push(loadRooms());
    if ([...ops].some((o) => o.includes('activity'))) promises.push(loadActivities());
    if ([...ops].some((o) => o.includes('day') || o.includes('hour'))) {
      promises.push(loadSchedule());
    }
    await Promise.all(promises);
  }

  /**
   * Verilen metni AI'a gönderir. handleSend (input'tan) ve pendingPrompt
   * (mode='send') gibi otomatik gönderim path'lerinin ortak yardımcısı.
   */
  async function doSend(raw: string): Promise<void> {
    const text = raw.trim();
    if (!text || loading) return;
    setInput('');
    const userMsgId = crypto.randomUUID();
    addMessage({ id: userMsgId, role: 'user', text });

    setLoading(true);
    try {
      const res = await window.api.ai.parse(text);
      if (!res.ok) {
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          text: `Hata: ${res.error.message}`,
        });
      } else {
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          text: responseText(res.data),
          response: res.data,
          status: 'pending',
        });
      }
    } catch (e) {
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        text: `Bağlantı hatası: ${String(e)}`,
      });
    } finally {
      setLoading(false);
    }
  }

  function handleSend(): void {
    void doSend(input);
  }

  /**
   * Mesaj geçmişini hem UI'dan hem de DB (ai_messages) tarafından temizler.
   * Onay diyaloğu standart browser confirm — toast ile sonucu duyurur.
   */
  async function handleClearChat(): Promise<void> {
    if (messages.length === 0) return;
    if (!window.confirm(tr.ai.clearChatConfirm)) return;
    clearMessages();
    try {
      await window.api.ai.clearHistory();
      toastInfo(tr.ai.cleared);
    } catch (e) {
      toastError(tr.common.error, String(e));
    }
  }

  /** Quick-start hücresinin tıklanması → mevcut input'u doldur ve textarea'ya odaklan. */
  function handleQuickStart(prompt: string): void {
    setInput(prompt);
    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(prompt.length, prompt.length);
    }, 30);
  }

  async function handleConfirm(msg: Message) {
    if (!msg.response) return;
    const kind = msg.response.kind ?? 'constraint';
    if (kind === 'constraint') {
      const r = msg.response as { constraints: AIConstraint[] };
      for (const c of r.constraints) {
        await addConstraint({
          type: c.type,
          weight: c.weight,
          active: c.active,
          params: c.params,
          source: 'ai',
        });
      }
    } else if (kind === 'schedule_update') {
      const r = msg.response as AIScheduleUpdateResponse;
      try {
        const res = await window.api.ai.applyScheduleUpdate(r);
        if (!res.ok) {
          toastError('Program ayarı uygulanamadı', res.error.message);
          updateMessage(msg.id, { status: 'rejected' });
          return;
        }
        // Snapshot UI'a yansısın — schedule store yeniden yüklenir.
        await loadSchedule();
        const data = res.data as { message?: string };
        toastSuccess('Program ayarı uygulandı', data?.message ?? r.explanation);
      } catch (e) {
        toastError('Bağlantı hatası', String(e));
        updateMessage(msg.id, { status: 'rejected' });
        return;
      }
    } else if (kind === 'data_mutation') {
      const r = msg.response as {
        actions: DataMutationAction[];
        explanation: string;
      };

      // export_timetable özel: renderer-side export gerekiyor (timetableExport.ts),
      // window.api.ai.applyMutations'a göndermek yerine /timetable sayfasına
      // yönlendir + pendingExport sinyaliyle orada otomatik tetikle.
      const exportActions = r.actions.filter((a) => a.op === 'export_timetable');
      const otherActions = r.actions.filter((a) => a.op !== 'export_timetable');

      try {
        if (otherActions.length > 0) {
          const res = await window.api.ai.applyMutations(otherActions);
          if (!res.ok) {
            toastError('İşlem başarısız', res.error.message);
            updateMessage(msg.id, { status: 'rejected' });
            return;
          }
          const data = res.data as DataMutationApplyResult;
          await reloadAffectedStores(otherActions);
          if (data.errors.length === 0 && exportActions.length === 0) {
            toastSuccess(
              `${data.applied} işlem uygulandı`,
              otherActions.map((a) => a.description).join('; '),
            );
          } else if (data.errors.length > 0) {
            toastWarn(
              `${data.applied}/${otherActions.length} işlem uygulandı`,
              data.errors.map((e) => e.message).join('; '),
            );
          }
        }

        // Export action'ları
        for (const ea of exportActions) {
          const format = String(
            (ea.params as { format?: string }).format ?? 'pdf',
          ).toLowerCase();
          const cls =
            typeof (ea.params as { class?: unknown }).class === 'string'
              ? ((ea.params as { class?: string }).class ?? null)
              : null;
          useAIChatStore
            .getState()
            .setPendingExport({ format, class: cls });
          navigate('/timetable');
          toastSuccess(
            `${format.toUpperCase()} export hazırlanıyor`,
            cls ? `${cls} sınıfı için` : 'tüm sınıflar',
          );
        }
      } catch (e) {
        toastError('Bağlantı hatası', String(e));
        updateMessage(msg.id, { status: 'rejected' });
        return;
      }
    } else if (kind === 'run_solver') {
      // AI'nın "programı üret" komutu — useGenerateStore.run kullanıcı
      // butonu basmış gibi tetikler. Onayı sonra Generate sayfasına yönlendir
      // ki progress bar ve log akarken görünsün.
      const r = msg.response as AIRunSolverResponse;
      const tl = r.timeLimitSec ?? 120;
      try {
        navigate('/generate');
        // Generate sayfası mount olsun + store'u init etsin
        setTimeout(() => {
          runSolver(tl).catch((e) => {
            toastError('Üretim başlatılamadı', String(e));
          });
        }, 60);
        toastSuccess('Üretim başlatıldı', `FET çalışıyor (${tl} sn)`);
      } catch (e) {
        toastError('Üretim başlatılamadı', String(e));
        updateMessage(msg.id, { status: 'rejected' });
        return;
      }
    }
    updateMessage(msg.id, { status: 'confirmed' });
  }

  function handleReject(msg: Message) {
    updateMessage(msg.id, { status: 'rejected' });
  }

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="flex h-full w-12 flex-col items-center justify-start gap-2 border-l border-surface-200 bg-white py-4 text-ink-600 hover:bg-surface-100"
      >
        <Sparkles size={20} className="text-primary-500" />
        <span
          className="text-xs"
          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
        >
          AI Asistan
        </span>
      </button>
    );
  }

  return (
    <aside className="flex h-full w-[420px] flex-col border-l border-surface-200 bg-white shadow-lg">
      <header className="flex items-center justify-between border-b border-surface-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-primary-500" />
          <h2 className="text-sm font-semibold text-ink-900">{tr.ai.title}</h2>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={handleClearChat}
              className="rounded-md p-1 text-ink-600 hover:bg-surface-100 hover:text-accent-err"
              aria-label={tr.ai.clearChat}
              title={tr.ai.clearChat}
            >
              <Eraser size={16} />
            </button>
          )}
          <button
            onClick={() => setCollapsed(true)}
            className="rounded-md p-1 text-ink-600 hover:bg-surface-100"
            aria-label={tr.common.close}
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
        {messages.length === 0 && (
          <>
            <div className="rounded-lg bg-primary-50 p-3 text-sm text-ink-700">
              {tr.ai.helloMessage}
            </div>
            <QuickStartGrid onPick={handleQuickStart} />
          </>
        )}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            onConfirm={handleConfirm}
            onReject={handleReject}
          />
        ))}
        {loading && (
          <div className="flex items-center gap-2 px-2 text-sm text-ink-400">
            <div className="size-2 animate-pulse rounded-full bg-primary-500" />
            <span>{tr.ai.thinking}</span>
          </div>
        )}
      </div>

      <div className="border-t border-surface-200 p-3">
        <div className="flex flex-col gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, 4000))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={tr.ai.placeholder}
            rows={3}
            maxLength={4000}
            className="input resize-none text-sm"
          />
          {input.length > 3500 && (
            <p className="text-[10px] text-amber-700">
              {input.length}/4000 karakter
            </p>
          )}
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="btn-primary"
          >
            <Send size={14} />
            {tr.ai.send}
          </button>
        </div>
      </div>
    </aside>
  );
}

/**
 * Sohbet boşken görünen 4-buton'lu hızlı başlangıç bölmesi.
 * Tıklayınca ilgili prompt input'a yazılır (otomatik göndermez).
 */
function QuickStartGrid({ onPick }: { onPick: (prompt: string) => void }) {
  const items: Array<{
    key: keyof typeof tr.ai.quickStarts;
    icon: typeof Wand2;
    promptKey: keyof typeof tr.ai.quickStartPrompts;
  }> = [
    { key: 'wizard', icon: Wand2, promptKey: 'wizard' },
    { key: 'addTeacher', icon: UserPlus, promptKey: 'addTeacher' },
    { key: 'addClass', icon: GraduationCap, promptKey: 'addClass' },
    { key: 'generate', icon: PlayCircle, promptKey: 'generate' },
  ];
  return (
    <div className="space-y-2">
      <p className="px-1 text-xs font-medium uppercase tracking-wide text-ink-500">
        {tr.ai.quickStartTitle}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => onPick(tr.ai.quickStartPrompts[it.promptKey])}
              className="flex items-start gap-2 rounded-lg border border-surface-200 bg-white px-3 py-2 text-left text-xs text-ink-700 transition-colors hover:border-primary-300 hover:bg-primary-50 focus:outline-none focus:ring-2 focus:ring-primary-200"
            >
              <Icon size={14} className="mt-0.5 shrink-0 text-primary-500" />
              <span className="font-medium">{tr.ai.quickStarts[it.key]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Constraint type prefix'inden kategori türetir. UI'da rozeti renklendirir.
 *   TEACHER_*  → mor
 *   CLASS_* / STUDENTS_*  → mavi
 *   SUBJECT_*  → emerald
 *   ROOM_*  → amber
 *   ACTIVITY_* / ACTIVITIES_*  → indigo
 *   diğer  → slate
 */
function constraintCategoryStyle(type: string): {
  badgeClass: string;
  label: string;
} {
  if (type.startsWith('TEACHER_'))
    return { badgeClass: 'bg-purple-100 text-purple-800', label: 'Öğretmen' };
  if (type.startsWith('CLASS_') || type.startsWith('STUDENTS_'))
    return { badgeClass: 'bg-blue-100 text-blue-800', label: 'Sınıf' };
  if (type.startsWith('SUBJECT_'))
    return { badgeClass: 'bg-emerald-100 text-emerald-800', label: 'Branş' };
  if (type.startsWith('ROOM_'))
    return { badgeClass: 'bg-amber-100 text-amber-800', label: 'Derslik' };
  if (
    type.startsWith('ACTIVITY_') ||
    type.startsWith('ACTIVITIES_') ||
    type.startsWith('MIN_') ||
    type.startsWith('MAX_')
  )
    return { badgeClass: 'bg-indigo-100 text-indigo-800', label: 'Aktivite' };
  return { badgeClass: 'bg-slate-100 text-slate-700', label: 'Genel' };
}

/**
 * Asistan baloncuklarının sağ üstüne "panoya kopyala" düğmesi yerleştirir.
 * Mesaj metnini (response.text — explanation/answer) clipboard'a yazar.
 */
function CopyButton({ text }: { text: string }) {
  const toastInfo = useToastStore((s) => s.info);
  const toastError = useToastStore((s) => s.error);

  async function copy(): Promise<void> {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toastInfo(tr.common.copied);
    } catch (e) {
      toastError(tr.common.error, String(e));
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-md p-1 text-ink-400 transition-colors hover:bg-white hover:text-ink-700"
      aria-label={tr.ai.copyMessage}
      title={tr.ai.copyMessage}
    >
      <Copy size={12} />
    </button>
  );
}

function MessageBubble({
  msg,
  onConfirm,
  onReject,
}: {
  msg: Message;
  onConfirm: (m: Message) => void;
  onReject: (m: Message) => void;
}) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-primary-500 px-3 py-2 text-sm text-white">
          {msg.text}
        </div>
      </div>
    );
  }

  const res = msg.response;
  const kind = res?.kind ?? 'constraint';

  // Query — info card (mavi border)
  if (res && kind === 'query') {
    const q = res as { answer: string; data?: unknown[]; confidence?: number };
    return (
      <div className="flex justify-start">
        <div className="max-w-[90%] space-y-2 rounded-2xl rounded-bl-sm border-l-4 border-l-primary-500 border border-surface-200 bg-primary-50 p-3 text-sm text-ink-800">
          <div className="flex items-start gap-2">
            <Info size={16} className="mt-0.5 shrink-0 text-primary-500" />
            <p className="flex-1">{q.answer}</p>
            <CopyButton text={q.answer} />
          </div>
          {q.data && q.data.length > 0 && (
            <pre className="mt-1 max-h-40 overflow-y-auto rounded-md bg-white p-2 text-[10px] text-ink-600">
              {JSON.stringify(q.data, null, 2)}
            </pre>
          )}
        </div>
      </div>
    );
  }

  // Tool call — gizli; "düşünüyor" zaten loading spinner ile gösteriliyor.
  // (Normalde IPC bunu UI'a yansıtmaz çünkü server-side çözülür; yine de
  // bir şekilde UI'a düşerse sade gri bir info satırı gösterilir.)
  if (res && kind === 'tool_call') {
    const tc = res as { tool: string; args?: Record<string, unknown>; reasoning?: string };
    // args'ın özet bir gösterimini hazırlayalım (sadece anahtarlar veya kısa val)
    const argStr =
      tc.args && Object.keys(tc.args).length > 0
        ? Object.entries(tc.args)
            .map(([k, v]) => {
              const val =
                typeof v === 'string' || typeof v === 'number'
                  ? String(v)
                  : Array.isArray(v)
                    ? `[${v.length}]`
                    : '…';
              return `${k}=${val}`;
            })
            .join(', ')
        : '';
    return (
      <div className="flex justify-start">
        <div className="max-w-[90%] rounded-md border border-surface-200 bg-surface-50 px-3 py-2 text-xs text-ink-500">
          <div className="flex items-center gap-2">
            <Wrench size={12} className="shrink-0" />
            <span>
              {tr.ai.fetchingInfo}:{' '}
              <code className="text-ink-700">{tc.tool}({argStr})</code>
            </span>
          </div>
          {tc.reasoning && (
            <p className="mt-1 pl-5 italic text-ink-400">{tc.reasoning}</p>
          )}
        </div>
      </div>
    );
  }

  // Schedule update — onay diyaloğu
  if (res && kind === 'schedule_update') {
    const su = res as { action: string; params: Record<string, unknown>; explanation: string };
    return (
      <div className="flex justify-start">
        <div className="max-w-[90%] space-y-2 rounded-2xl rounded-bl-sm border-l-4 border-l-amber-500 border border-surface-200 bg-amber-50 p-3 text-sm text-ink-800">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
            <div className="flex-1">
              <p className="font-medium text-amber-900">Program ayar önerisi</p>
              <p className="mt-0.5 text-ink-700">{su.explanation}</p>
              <pre className="mt-1 rounded-md bg-white p-2 text-[10px] text-ink-600">
                {su.action}({JSON.stringify(su.params)})
              </pre>
            </div>
            <CopyButton text={su.explanation} />
          </div>
          {msg.status === 'pending' && (
            <div className="flex justify-end gap-1 pt-1">
              <button
                onClick={() => onReject(msg)}
                className="rounded-md px-2 py-1 text-xs text-ink-600 hover:bg-surface-200"
              >
                İptal
              </button>
              <button
                onClick={() => onConfirm(msg)}
                className="flex items-center gap-1 rounded-md bg-amber-500 px-2 py-1 text-xs font-medium text-white hover:bg-amber-600"
              >
                <Check size={12} /> Uygula
              </button>
            </div>
          )}
          {msg.status === 'confirmed' && (
            <span className="flex items-center gap-1 text-xs text-accent-ok">
              <Check size={12} /> Uygulandı
            </span>
          )}
          {msg.status === 'rejected' && (
            <span className="flex items-center gap-1 text-xs text-ink-400">
              <X size={12} /> İptal edildi
            </span>
          )}
        </div>
      </div>
    );
  }

  // Data mutation — CRUD önerileri, çoklu action onay kartı
  if (res && kind === 'data_mutation') {
    const dm = res as {
      actions: DataMutationAction[];
      explanation: string;
      confidence?: number;
    };
    const hasDestructive = dm.actions.some((a) => a.op.startsWith('delete_'));
    return (
      <div className="flex justify-start">
        <div
          className={cn(
            'max-w-[90%] space-y-2 rounded-2xl rounded-bl-sm border p-3 text-sm text-ink-800',
            hasDestructive
              ? 'border-l-4 border-l-red-500 border-surface-200 bg-red-50'
              : 'border-l-4 border-l-emerald-500 border-surface-200 bg-emerald-50',
          )}
        >
          <div className="flex items-start gap-2">
            {hasDestructive ? (
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" />
            ) : (
              <Database size={16} className="mt-0.5 shrink-0 text-emerald-600" />
            )}
            <div className="flex-1">
              <p
                className={cn(
                  'font-medium',
                  hasDestructive ? 'text-red-900' : 'text-emerald-900',
                )}
              >
                {hasDestructive ? 'Veri silme önerisi' : 'Veri ekleme/güncelleme önerisi'}
              </p>
              <p className="mt-0.5 text-ink-700">{dm.explanation}</p>
            </div>
            <CopyButton text={dm.explanation} />
          </div>
          <ul className="space-y-1 pl-1">
            {dm.actions.map((a, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-md bg-white px-2 py-1.5 text-xs"
              >
                {a.op.startsWith('delete_') ? (
                  <Trash2 size={12} className="mt-0.5 shrink-0 text-red-500" />
                ) : (
                  <Check size={12} className="mt-0.5 shrink-0 text-emerald-500" />
                )}
                <div className="flex-1">
                  <p className="text-ink-700">{a.description}</p>
                  <p className="text-[10px] text-ink-400">{a.op}</p>
                </div>
              </li>
            ))}
          </ul>
          {msg.status === 'pending' && (
            <div className="flex justify-end gap-1 pt-1">
              <button
                onClick={() => onReject(msg)}
                className="rounded-md px-2 py-1 text-xs text-ink-600 hover:bg-surface-200"
              >
                İptal
              </button>
              <button
                onClick={() => onConfirm(msg)}
                className={cn(
                  'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-white',
                  hasDestructive
                    ? 'bg-red-500 hover:bg-red-600'
                    : 'bg-emerald-500 hover:bg-emerald-600',
                )}
              >
                <Check size={12} /> {hasDestructive ? 'Sil ve Onayla' : 'Uygula'}
              </button>
            </div>
          )}
          {msg.status === 'confirmed' && (
            <span className="flex items-center gap-1 text-xs text-accent-ok">
              <Check size={12} /> Uygulandı
            </span>
          )}
          {msg.status === 'rejected' && (
            <span className="flex items-center gap-1 text-xs text-ink-400">
              <X size={12} /> İptal edildi
            </span>
          )}
        </div>
      </div>
    );
  }

  // Run solver — "Programı Üret" onay kartı
  if (res && kind === 'run_solver') {
    const rs = res as {
      timeLimitSec?: number;
      explanation: string;
      confidence?: number;
    };
    const tl = rs.timeLimitSec ?? 120;
    return (
      <div className="flex justify-start">
        <div className="max-w-[90%] space-y-2 rounded-2xl rounded-bl-sm border border-primary/30 border-l-4 border-l-primary bg-primary-soft p-3 text-sm text-ink-800">
          <div className="flex items-start gap-2">
            <PlayCircle size={16} className="mt-0.5 shrink-0 text-primary" />
            <div className="flex-1">
              <p className="font-medium text-primary">
                Programı üret
                <span className="ml-2 rounded bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted">
                  {tl}s
                </span>
              </p>
              <p className="mt-0.5 text-ink-700">{rs.explanation}</p>
            </div>
            <CopyButton text={rs.explanation} />
          </div>
          {msg.status === 'pending' && (
            <div className="flex justify-end gap-1 pt-1">
              <button
                onClick={() => onReject(msg)}
                className="rounded-md px-2 py-1 text-xs text-ink-600 hover:bg-card"
              >
                İptal
              </button>
              <button
                onClick={() => onConfirm(msg)}
                className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-600"
              >
                <PlayCircle size={12} /> Üretimi başlat
              </button>
            </div>
          )}
          {msg.status === 'confirmed' && (
            <span className="flex items-center gap-1 text-xs text-accent-leaf">
              <Check size={12} /> Üretim başlatıldı — Programı Üret sayfasında ilerleme görünüyor
            </span>
          )}
          {msg.status === 'rejected' && (
            <span className="flex items-center gap-1 text-xs text-ink-400">
              <X size={12} /> İptal edildi
            </span>
          )}
        </div>
      </div>
    );
  }

  // Constraint (default)
  const cr = res as
    | {
        constraints: AIConstraint[];
        confidence: number;
        warnings: string[];
        unresolved: string[];
      }
    | undefined;

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] space-y-2 rounded-2xl rounded-bl-sm border border-surface-200 bg-surface-50 p-3 text-sm text-ink-800">
        <div className="flex items-start gap-2">
          <p className="flex-1 whitespace-pre-wrap break-words">{msg.text}</p>
          <CopyButton text={msg.text} />
        </div>

        {cr && (
          <>
            {cr.constraints.map((c, i) => (
              <ConstraintCard key={i} c={c} />
            ))}

            {cr.warnings.length > 0 && (
              <div className="flex items-start gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <ul className="space-y-1">
                  {cr.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {cr.unresolved.length > 0 && (
              <div className="rounded-md bg-red-50 p-2 text-xs text-red-900">
                <p className="font-medium">Belirsizlik:</p>
                <ul className="mt-1 list-disc pl-4 space-y-0.5">
                  {cr.unresolved.map((u, i) => (
                    <li key={i}>{u}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-center justify-end pt-1">
              {msg.status === 'pending' && cr.constraints.length > 0 && (
                <div className="flex gap-1">
                  <button
                    onClick={() => onReject(msg)}
                    className="rounded-md px-2 py-1 text-xs text-ink-600 hover:bg-surface-200"
                  >
                    {tr.ai.discard}
                  </button>
                  <button
                    onClick={() => onConfirm(msg)}
                    className="flex items-center gap-1 rounded-md bg-primary-500 px-2 py-1 text-xs font-medium text-white hover:bg-primary-600"
                  >
                    <Check size={12} />
                    {tr.ai.addToList}
                  </button>
                </div>
              )}
              {msg.status === 'confirmed' && (
                <span className="flex items-center gap-1 text-xs text-accent-ok">
                  <Check size={12} /> Eklendi
                </span>
              )}
              {msg.status === 'rejected' && (
                <span className="flex items-center gap-1 text-xs text-ink-400">
                  <X size={12} /> Reddedildi
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ConstraintCard({ c }: { c: AIConstraint }) {
  const cat = constraintCategoryStyle(c.type);
  return (
    <div
      className={cn(
        'rounded-md border bg-white px-2 py-1.5 text-xs',
        c.weight >= 100 ? 'border-primary-200' : 'border-surface-200',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              cat.badgeClass,
            )}
          >
            {cat.label}
          </span>
          <span className="truncate font-mono text-[10px] text-ink-600">
            {c.type}
          </span>
        </div>
        <span className="shrink-0 text-ink-400">Önem: {c.weight}</span>
      </div>
      <pre className="mt-1 whitespace-pre-wrap text-[10px] text-ink-600">
        {JSON.stringify(c.params, null, 2)}
      </pre>
    </div>
  );
}
