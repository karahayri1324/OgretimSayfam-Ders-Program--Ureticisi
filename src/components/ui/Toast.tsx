import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useToastStore, type ToastKind } from '../../store/toast';

const iconMap: Record<ToastKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warn: AlertTriangle,
};

const kindClasses: Record<ToastKind, string> = {
  success: 'border-emerald-200 bg-card text-emerald-900',
  error: 'border-red-200 bg-card text-red-900',
  info: 'border-primary-200 bg-card text-primary-900',
  warn: 'border-amber-200 bg-card text-amber-900',
};

const iconClasses: Record<ToastKind, string> = {
  success: 'text-emerald-500',
  error: 'text-red-500',
  info: 'text-primary-500',
  warn: 'text-amber-500',
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[60] flex w-80 flex-col gap-2">
      {toasts.map((t) => {
        const Icon = iconMap[t.kind];
        return (
          <div
            key={t.id}
            role="status"
            className={cn(
              'pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2.5 shadow-elevated',
              kindClasses[t.kind],
            )}
          >
            <Icon size={18} className={cn('mt-0.5 shrink-0', iconClasses[t.kind])} />
            <div className="flex-1 text-sm">
              <p className="font-medium">{t.title}</p>
              {t.description && (
                <p className="mt-0.5 text-xs text-ink-600">{t.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="rounded-md p-0.5 text-ink-400 hover:bg-surface-100"
              aria-label="Kapat"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
