import { useState, useRef, useEffect } from 'react';
import {
  Send,
  Check,
  X,
  AlertTriangle,
  Info,
  Wrench,
  Database,
  Trash2,
  Copy,
  Eraser,
  PlayCircle,
} from 'lucide-react';
import { tr } from '../../lib/i18n';
import { cn } from '../../lib/cn';
import { formatConstraint, constraintTypeLabel } from '../../lib/formatConstraint';
import { Logo } from '../Logo';
import { useAIChatStore } from '../../store/ai-chat';
import { useConstraintsStore } from '../../store/constraints';
import { useTeachersStore } from '../../store/teachers';
import { useSubjectsStore } from '../../store/subjects';
import { useClassesStore } from '../../store/classes';
import { useRoomsStore } from '../../store/rooms';
import { useActivitiesStore } from '../../store/activities';
import { useScheduleStore } from '../../store/schedule';
import { useGenerateStore } from '../../store/generate';
import { useSettingsStore } from '../../store/settings';
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

const OP_TO_PAGE: Record<string, string> = {
  add_teacher: '/teachers',
  update_teacher: '/teachers',
  delete_teacher: '/teachers',
  link_teacher_subject: '/teachers',
  unlink_teacher_subject: '/teachers',
  substitute_teacher: '/teachers',

  add_class: '/classes',
  update_class: '/classes',
  delete_class: '/classes',
  add_class_year: '/classes',
  delete_class_year: '/classes',

  add_room: '/rooms',
  update_room: '/rooms',
  delete_room: '/rooms',

  add_subject: '/subjects',
  update_subject: '/subjects',
  delete_subject: '/subjects',

  add_activity: '/activities',
  update_activity: '/activities',
  delete_activity: '/activities',
  add_split_activity: '/activities',
  merge_activities: '/activities',
  clear_split: '/activities',

  add_constraint: '/constraints',
  delete_constraint: '/constraints',
  add_activity_constraint: '/constraints',
  set_constraint_weight: '/constraints',
  set_constraint_active: '/constraints',

  set_timetable_slot: '/timetable',
  lock_timetable_slot: '/timetable',
  unlock_timetable_slot: '/timetable',
  swap_timetable_slots: '/timetable',
  pair_subjects_consecutive: '/constraints',

  add_day: '/schedule',
  delete_day: '/schedule',
  add_hour: '/schedule',
  delete_hour: '/schedule',

  set_setting: '/settings',
};

function pickNavigationTarget(
  actions: { op: string }[],
): string | null {
  const counts = new Map<string, number>();
  for (const a of actions) {
    const page = OP_TO_PAGE[a.op];
    if (!page) continue;
    counts.set(page, (counts.get(page) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  let best: string | null = null;
  let bestCount = 0;
  for (const [page, count] of counts) {
    if (count > bestCount) {
      best = page;
      bestCount = count;
    }
  }
  return best;
}

const PANEL_WIDTH_KEY = 'osf-ai-panel-width-v1';
const PANEL_WIDTH_DEFAULT = 420;
const PANEL_WIDTH_MIN = 320;
const PANEL_WIDTH_MAX = 900;

function readStoredWidth(): number {
  if (typeof window === 'undefined') return PANEL_WIDTH_DEFAULT;
  try {
    const raw = window.localStorage.getItem(PANEL_WIDTH_KEY);
    if (!raw) return PANEL_WIDTH_DEFAULT;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return PANEL_WIDTH_DEFAULT;
    return Math.max(PANEL_WIDTH_MIN, Math.min(PANEL_WIDTH_MAX, n));
  } catch {
    return PANEL_WIDTH_DEFAULT;
  }
}

export default function AIPanel() {
  const [collapsed, setCollapsed] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [panelWidth, setPanelWidth] = useState<number>(() => readStoredWidth());
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(PANEL_WIDTH_KEY, String(Math.round(panelWidth)));
    } catch {
    }
  }, [panelWidth]);
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
  const loadSettings = useSettingsStore((s) => s.load);
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

  useEffect(() => {
    if (panelOpenSignal > 0) setCollapsed(false);
  }, [panelOpenSignal]);

  useEffect(() => {
    if (!pendingPrompt) return;
    const pending = consumePendingPrompt();
    if (!pending) return;
    if (pending.mode === 'send') {
      void doSend(pending.text);
    } else {
      setInput(pending.text);
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

  async function reloadAffectedStores(actions: DataMutationAction[]): Promise<void> {
    const ops = new Set(actions.map((a) => a.op));
    const promises: Array<Promise<unknown>> = [];
    if ([...ops].some((o) => o.includes('teacher'))) promises.push(loadTeachers());
    if ([...ops].some((o) => o.includes('subject'))) promises.push(loadSubjects());
    if ([...ops].some((o) => o.includes('class'))) promises.push(loadClasses());
    if ([...ops].some((o) => o.includes('room'))) promises.push(loadRooms());
    if ([...ops].some((o) => o.includes('activity') || o.includes('split'))) promises.push(loadActivities());
    if ([...ops].some((o) => o.includes('day') || o.includes('hour'))) {
      promises.push(loadSchedule());
    }
    if ([...ops].some((o) => o.includes('setting'))) {
      promises.push(loadSettings());
    }
    await Promise.all(promises);
  }

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

      const exportActions = r.actions.filter((a) => a.op === 'export_timetable');
      const navActions = r.actions.filter((a) => a.op === 'navigate_to');
      const cancelActions = r.actions.filter((a) => a.op === 'cancel_generation');
      const otherActions = r.actions.filter(
        (a) =>
          a.op !== 'export_timetable' &&
          a.op !== 'navigate_to' &&
          a.op !== 'cancel_generation',
      );

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
          if (
            data.errors.length === 0 &&
            exportActions.length === 0 &&
            navActions.length === 0
          ) {
            toastSuccess(
              `${data.applied} işlem uygulandı`,
              otherActions.map((a) => a.description).join('; '),
            );
          } else if (data.rolledBack) {
            toastError(
              'Hiçbir işlem uygulanmadı (geri alındı)',
              `Bir adım başarısız olduğu için tümü iptal edildi: ${data.errors
                .map((e) => e.message)
                .join('; ')}`,
            );
          } else if (data.errors.length > 0) {
            toastWarn(
              `${data.applied}/${otherActions.length} işlem uygulandı`,
              data.errors.map((e) => e.message).join('; '),
            );
          }

          if (navActions.length === 0 && exportActions.length === 0) {
            const target = pickNavigationTarget(otherActions);
            if (target) navigate(target);
          }
        }

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

        for (const na of navActions) {
          const raw = String((na.params as { page?: string }).page ?? '').toLowerCase();
          const page = raw.startsWith('/') ? raw : `/${raw}`;
          navigate(page);
          toastInfo('Sayfaya yönlendiriliyor', page);
        }

        if (cancelActions.length > 0) {
          await useGenerateStore.getState().cancel();
          toastSuccess('Üretim iptal edildi', 'FET çözümü durduruldu.');
        }
      } catch (e) {
        toastError('Bağlantı hatası', String(e));
        updateMessage(msg.id, { status: 'rejected' });
        return;
      }
    } else if (kind === 'run_solver') {
      const r = msg.response as AIRunSolverResponse;
      const tl = r.timeLimitSec ?? 120;
      try {
        navigate('/generate');
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
        className="flex h-full w-12 flex-col items-center justify-start gap-2 border-l border-surface-200 bg-card py-4 text-ink-600 hover:bg-surface-100"
      >
        <Logo size={24} />
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
    <aside
      className="relative flex h-full flex-col border-l border-surface-200 bg-card shadow-lg"
      style={{ width: panelWidth }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="AI panel genişliğini ayarla"
        onMouseDown={(e) => {
          e.preventDefault();
          setResizing(true);
          const startX = e.clientX;
          const startW = panelWidth;
          const onMove = (mv: MouseEvent) => {
            const next = Math.max(
              PANEL_WIDTH_MIN,
              Math.min(PANEL_WIDTH_MAX, startW + (startX - mv.clientX)),
            );
            setPanelWidth(next);
          };
          const onUp = () => {
            setResizing(false);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
          };
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        }}
        className={cn(
          'absolute left-0 top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize select-none transition-colors hover:bg-primary-500/30',
          resizing && 'bg-primary-500/40',
        )}
      />
      <header className="flex items-center justify-between border-b border-surface-200 px-4 py-3">
        <div className="flex items-center gap-2">
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
          <div className="rounded-lg bg-primary-50 p-3 text-sm text-ink-700">
            {tr.ai.helloMessage}
          </div>
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
  return { badgeClass: 'bg-surface-100 text-slate-700', label: 'Genel' };
}

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
      className="rounded-md p-1 text-ink-400 transition-colors hover:bg-card hover:text-ink-700"
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
            <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto rounded-md bg-card p-2 text-[11px] text-ink-700">
              {q.data.slice(0, 20).map((item, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="mt-0.5 size-1 shrink-0 rounded-full bg-primary-500" />
                  <span className="flex-1">{formatQueryDataItem(item)}</span>
                </li>
              ))}
              {q.data.length > 20 && (
                <li className="pt-1 text-[10px] italic text-ink-400">
                  …ve {q.data.length - 20} daha
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    );
  }

  if (res && kind === 'tool_call') {
    return (
      <div className="flex justify-start">
        <div className="flex max-w-[90%] items-center gap-2 rounded-md border border-surface-200 bg-surface-50 px-3 py-2 text-xs text-ink-500">
          <Wrench size={12} className="shrink-0 animate-pulse" />
          <span className="italic">{tr.ai.fetchingInfo}…</span>
        </div>
      </div>
    );
  }

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
                className="flex items-start gap-2 rounded-md bg-card px-2 py-1.5 text-xs"
              >
                {a.op.startsWith('delete_') ? (
                  <Trash2 size={12} className="mt-0.5 shrink-0 text-red-500" />
                ) : (
                  <Check size={12} className="mt-0.5 shrink-0 text-emerald-500" />
                )}
                <div className="flex-1">
                  <p className="text-ink-700">{a.description}</p>
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
        'rounded-md border bg-card px-2 py-1.5 text-xs',
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
          <span className="truncate text-[11px] text-ink-700">
            {constraintTypeLabel(c.type)}
          </span>
        </div>
        <span className="shrink-0 text-ink-400">Önem: {c.weight}</span>
      </div>
      <p className="mt-1 text-[11.5px] leading-snug text-ink-700">
        {formatConstraint({ ...c, id: 0, active: true, source: 'ai', aiMessageId: null, createdAt: '', notes: null })}
      </p>
    </div>
  );
}

function formatQueryDataItem(item: unknown): string {
  if (item == null) return '';
  if (typeof item === 'string' || typeof item === 'number') return String(item);
  if (typeof item === 'object') {
    const o = item as Record<string, unknown>;
    const name =
      (typeof o.name === 'string' && o.name) ||
      (typeof o.label === 'string' && o.label) ||
      (typeof o.title === 'string' && o.title);
    if (name) {
      const extras: string[] = [];
      if (typeof o.count === 'number') extras.push(`${o.count} adet`);
      if (typeof o.hours === 'number') extras.push(`${o.hours} saat`);
      if (typeof o.value !== 'undefined') extras.push(String(o.value));
      return extras.length > 0 ? `${name} — ${extras.join(', ')}` : String(name);
    }
    const pairs = Object.entries(o)
      .filter(([_, v]) => v != null && (typeof v === 'string' || typeof v === 'number'))
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${v}`);
    if (pairs.length > 0) return pairs.join(' · ');
  }
  return '';
}
