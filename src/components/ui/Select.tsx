import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-ink-800 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:bg-surface-50 disabled:text-ink-400',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';
