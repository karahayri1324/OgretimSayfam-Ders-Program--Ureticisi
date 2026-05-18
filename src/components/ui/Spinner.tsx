import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import { tr } from '../../lib/i18n';

type Size = 'sm' | 'md' | 'lg';

const sizeMap: Record<Size, number> = {
  sm: 14,
  md: 18,
  lg: 28,
};

export function Spinner({
  size = 'md',
  className,
  block = false,
  label,
}: {
  size?: Size;
  className?: string;
  block?: boolean;
  label?: string;
}) {
  const icon = (
    <Loader2
      size={sizeMap[size]}
      className={cn('animate-spin text-primary-500', className)}
      aria-hidden="true"
    />
  );
  if (!block) {
    return (
      <span className="inline-flex items-center gap-2 text-ink-500" role="status">
        {icon}
        {label && <span className="text-sm">{label}</span>}
        <span className="sr-only">{label ?? tr.common.loading}</span>
      </span>
    );
  }
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-12 text-ink-500"
      role="status"
    >
      <Loader2
        size={28}
        className={cn('animate-spin text-primary-500', className)}
        aria-hidden="true"
      />
      <span className="text-sm">{label ?? tr.common.loading}</span>
    </div>
  );
}
