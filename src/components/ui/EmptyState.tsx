import { type LucideIcon } from 'lucide-react';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-surface-300 bg-white px-8 py-16 text-center">
      {Icon && (
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary-50 text-primary-500">
          <Icon size={24} />
        </div>
      )}
      <h3 className="text-base font-semibold text-ink-900">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-ink-600">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
