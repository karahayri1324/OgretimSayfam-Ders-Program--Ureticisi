import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'ok' | 'warn' | 'err' | 'neutral';

const variantClasses: Record<Variant, string> = {
  primary: 'bg-primary-50 text-primary-700 border-primary-100',
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  warn: 'bg-amber-50 text-amber-800 border-amber-100',
  err: 'bg-red-50 text-red-700 border-red-100',
  neutral: 'bg-surface-100 text-ink-700 border-surface-200',
};

export function Badge({
  variant = 'neutral',
  className,
  children,
}: {
  variant?: Variant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
