import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-ink-800 placeholder:text-ink-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-ink-800 placeholder:text-ink-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-ink-700">
      {children}
    </label>
  );
}
