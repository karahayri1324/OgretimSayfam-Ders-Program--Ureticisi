import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  width?: string;
  className?: string;
};

export function Table<T>({
  columns,
  rows,
  getRowKey,
  empty,
  className,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string | number;
  empty?: ReactNode;
  className?: string;
}) {
  if (rows.length === 0 && empty) {
    return <>{empty}</>;
  }
  return (
    <div className={cn('overflow-x-auto rounded-xl border border-surface-200 bg-card shadow-soft', className)}>
      <table className="min-w-full text-sm">
        <thead className="border-b border-surface-200 bg-surface-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  'whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-600',
                  col.className,
                )}
                style={col.width ? { width: col.width } : undefined}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-200">
          {rows.map((row) => (
            <tr key={getRowKey(row)} className="hover:bg-surface-50">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn('px-4 py-2.5 align-middle text-ink-800', col.className)}
                >
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
