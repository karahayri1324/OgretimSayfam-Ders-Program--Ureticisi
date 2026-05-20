import { cn } from '../../lib/cn';

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-surface-200 bg-card shadow-soft',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between border-b border-surface-200 px-5 py-4">
      <div>
        <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
        {description && (
          <p className="mt-0.5 text-sm text-ink-600">{description}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function CardBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn('p-5', className)}>{children}</div>;
}
