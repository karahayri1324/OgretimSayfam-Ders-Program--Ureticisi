import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { tr } from '../../lib/i18n';
import type { Subject } from '../../lib/types';

function normalize(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export type SubjectComboboxProps = {
  value: number[];
  onChange: (ids: number[]) => void;
  subjects: Subject[];
  onCreateSubject: (name: string) => Promise<Subject | null>;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
};

export function SubjectCombobox({
  value,
  onChange,
  subjects,
  onCreateSubject,
  id,
  placeholder,
  disabled = false,
}: SubjectComboboxProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [creating, setCreating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () =>
      value
        .map((vid) => subjects.find((s) => s.id === vid))
        .filter((s): s is Subject => Boolean(s)),
    [value, subjects],
  );

  const normQuery = normalize(query.trim());

  const suggestions = useMemo(() => {
    const available = subjects.filter((s) => !value.includes(s.id));
    if (!normQuery) return available;
    return available.filter((s) => normalize(s.name).includes(normQuery));
  }, [subjects, value, normQuery]);

  const exactMatchExists = useMemo(() => {
    if (!normQuery) return true;
    return subjects.some((s) => normalize(s.name) === normQuery);
  }, [subjects, normQuery]);

  const showCreate = !!query.trim() && !exactMatchExists;

  const totalItems = suggestions.length + (showCreate ? 1 : 0);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function addSubject(id: number) {
    if (value.includes(id)) return;
    onChange([...value, id]);
    setQuery('');
    setHighlight(0);
    inputRef.current?.focus();
  }

  function removeSubject(id: number) {
    onChange(value.filter((v) => v !== id));
  }

  async function createAndAdd(name: string) {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const created = await onCreateSubject(trimmed);
      if (created) {
        onChange([...value, created.id]);
        setQuery('');
        setHighlight(0);
        inputRef.current?.focus();
      }
    } finally {
      setCreating(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      if (totalItems === 0) return;
      setHighlight((h) => (h + 1) % totalItems);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      if (totalItems === 0) return;
      setHighlight((h) => (h - 1 + totalItems) % totalItems);
    } else if (e.key === 'Enter') {
      if (!open) return;
      e.preventDefault();
      if (highlight < suggestions.length) {
        const s = suggestions[highlight];
        if (s) addSubject(s.id);
      } else if (showCreate) {
        void createAndAdd(query);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Backspace' && query === '' && value.length > 0) {
      removeSubject(value[value.length - 1]!);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        className={cn(
          'flex min-h-[42px] w-full flex-wrap items-center gap-1.5 rounded-lg border border-surface-200 bg-card px-2 py-1.5 transition-colors focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-100',
          disabled && 'opacity-60',
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {selected.map((s) => (
          <span
            key={s.id}
            className="inline-flex items-center gap-1 rounded-full border border-primary-200 bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700"
          >
            {s.name}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeSubject(s.id);
              }}
              className="rounded-full p-0.5 text-primary-500 hover:bg-primary-100 hover:text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-300"
              aria-label={`${tr.teachers.subjectComboRemove}: ${s.name}`}
              disabled={disabled}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={
            selected.length === 0
              ? (placeholder ?? tr.teachers.subjectComboPlaceholder)
              : ''
          }
          disabled={disabled}
          className="flex-1 min-w-[120px] border-0 bg-transparent px-1 py-0.5 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={id ? `${id}-listbox` : undefined}
        />
      </div>

      {open && (suggestions.length > 0 || showCreate) && (
        <ul
          id={id ? `${id}-listbox` : undefined}
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-surface-200 bg-card py-1 shadow-lg"
        >
          {suggestions.map((s, i) => {
            const active = i === highlight;
            return (
              <li
                key={s.id}
                role="option"
                aria-selected={active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  addSubject(s.id);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  'cursor-pointer px-3 py-1.5 text-sm',
                  active
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-ink-800 hover:bg-surface-100',
                )}
              >
                {s.name}
              </li>
            );
          })}
          {showCreate && (
            <li
              role="option"
              aria-selected={highlight === suggestions.length}
              onMouseDown={(e) => {
                e.preventDefault();
                void createAndAdd(query);
              }}
              onMouseEnter={() => setHighlight(suggestions.length)}
              className={cn(
                'flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm',
                highlight === suggestions.length
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-ink-700 hover:bg-surface-100',
                creating && 'opacity-50',
              )}
            >
              <Plus size={14} className="text-primary-500" />
              <span>
                {tr.teachers.subjectComboCreate}:{' '}
                <strong>"{query.trim()}"</strong>
              </span>
            </li>
          )}
        </ul>
      )}

      {open &&
        suggestions.length === 0 &&
        !showCreate &&
        normQuery.length > 0 && (
          <ul
            role="listbox"
            className="absolute z-20 mt-1 w-full rounded-lg border border-surface-200 bg-card py-1 shadow-lg"
          >
            <li className="px-3 py-1.5 text-sm text-ink-400">
              {tr.teachers.subjectComboEmpty}
            </li>
          </ul>
        )}
    </div>
  );
}
