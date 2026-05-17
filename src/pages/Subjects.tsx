import { useEffect, useState } from 'react';
import { BookOpen, Pencil, Trash2, Plus } from 'lucide-react';
import { tr } from '../lib/i18n';
import { useSubjectsStore } from '../store/subjects';
import { useToastStore } from '../store/toast';
import { Button } from '../components/ui/Button';
import { Input, Label, Textarea } from '../components/ui/Input';
import { Table, type Column } from '../components/ui/Table';
import { EmptyState } from '../components/ui/EmptyState';
import { Dialog } from '../components/ui/Dialog';
import { Spinner } from '../components/ui/Spinner';
import type { Subject, SubjectInput } from '../lib/types';

const DEFAULT_COLOR = '#3b82f6';

// Tailwind paletinden seçilmiş okuyabilir renkler.
// Her yeni ders eklenirken biri rastgele seçilir.
const PALETTE = [
  '#ef4444', // red-500
  '#f97316', // orange-500
  '#f59e0b', // amber-500
  '#eab308', // yellow-500
  '#84cc16', // lime-500
  '#22c55e', // green-500
  '#10b981', // emerald-500
  '#14b8a6', // teal-500
  '#06b6d4', // cyan-500
  '#0ea5e9', // sky-500
  '#3b82f6', // blue-500
  '#6366f1', // indigo-500
  '#8b5cf6', // violet-500
  '#a855f7', // purple-500
  '#d946ef', // fuchsia-500
  '#ec4899', // pink-500
  '#f43f5e', // rose-500
  '#64748b', // slate-500
];

function randomColor(): string {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)];
}

export default function Subjects() {
  const { subjects, load, create, update, remove, loading } = useSubjectsStore();
  const toast = useToastStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(s: Subject) {
    setEditing(s);
    setDialogOpen(true);
  }

  async function handleDelete(s: Subject) {
    if (!window.confirm(tr.subjects.deleteConfirm)) return;
    const ok = await remove(s.id);
    if (ok) toast.success(tr.common.deleted, s.name);
    else toast.error(tr.common.error);
  }

  const columns: Column<Subject>[] = [
    {
      key: 'name',
      header: tr.common.name,
      cell: (s) => <span className="font-medium text-ink-900">{s.name}</span>,
    },
    {
      key: 'code',
      header: tr.subjects.code,
      width: '120px',
      cell: (s) =>
        s.shortCode ? (
          <span className="rounded-md bg-surface-100 px-1.5 py-0.5 text-xs font-mono text-ink-700">
            {s.shortCode}
          </span>
        ) : (
          <span className="text-ink-400">—</span>
        ),
    },
    {
      key: 'color',
      header: tr.subjects.color,
      width: '90px',
      cell: (s) => (
        <span
          className="inline-block size-5 rounded-full border border-surface-300"
          style={{ backgroundColor: s.color ?? DEFAULT_COLOR }}
          aria-label={s.color ?? ''}
        />
      ),
    },
    {
      key: 'notes',
      header: tr.common.notes,
      cell: (s) =>
        s.notes ? s.notes : <span className="text-ink-400">—</span>,
    },
    {
      key: 'actions',
      header: tr.common.actions,
      width: '140px',
      className: 'text-right',
      cell: (s) => (
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => openEdit(s)}
            aria-label={tr.common.edit}
          >
            <Pencil size={14} />
            {tr.common.edit}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleDelete(s)}
            aria-label={tr.common.delete}
            className="text-accent-err hover:bg-red-50"
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900">
          {tr.subjects.title}{' '}
          <span className="text-ink-400">({subjects.length})</span>
        </h1>
        <Button onClick={openCreate}>
          <Plus size={16} />
          {tr.subjects.addNew}
        </Button>
      </header>

      {loading && subjects.length === 0 ? (
        <Spinner block />
      ) : subjects.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={tr.subjects.empty}
          description={tr.subjects.emptyHint}
          action={
            <Button onClick={openCreate}>
              <Plus size={16} />
              {tr.subjects.addNew}
            </Button>
          }
        />
      ) : (
        <Table columns={columns} rows={subjects} getRowKey={(s) => s.id} />
      )}

      <SubjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        subject={editing}
        onSubmit={async (input) => {
          const ok = editing
            ? await update(editing.id, input)
            : await create(input);
          if (ok) {
            toast.success(tr.common.saved, input.name);
            setDialogOpen(false);
          } else {
            toast.error(tr.common.error);
          }
        }}
      />
    </div>
  );
}

function SubjectDialog({
  open,
  onClose,
  subject,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  subject: Subject | null;
  onSubmit: (input: SubjectInput) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(subject?.name ?? '');
      setCode(subject?.shortCode ?? '');
      // Yeni eklerken paletten rastgele bir renk seç; düzenlerken mevcut rengi kullan
      setColor(subject?.color ?? randomColor());
      setNotes(subject?.notes ?? '');
    }
  }, [open, subject]);

  // Virgülle ayrılmış toplu giriş — sadece create modunda
  const parsedNames = subject
    ? [name.trim()].filter(Boolean)
    : name
        .split(/[,;\n]/)
        .map((n) => n.trim())
        .filter(Boolean);

  async function submit() {
    if (parsedNames.length === 0) return;
    setSubmitting(true);
    for (const n of parsedNames) {
      await onSubmit({
        name: n,
        shortCode: code.trim() || null,
        // Toplu eklemede her dersi farklı renkle ayır
        color: parsedNames.length > 1 ? randomColor() : color,
        notes: notes.trim() || null,
      });
    }
    setSubmitting(false);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={subject ? tr.subjects.edit : tr.subjects.addNew}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tr.common.cancel}
          </Button>
          <Button onClick={submit} disabled={submitting || parsedNames.length === 0}>
            {parsedNames.length > 1
              ? `${parsedNames.length} ders ekle`
              : tr.common.save}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="subject-name">
            {subject ? 'Ders adı' : 'Ders adı (virgülle birden fazla)'}
          </Label>
          <Input
            id="subject-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={subject ? 'Matematik' : 'Matematik, Fizik, Türkçe, Tarih, Beden Eğitimi'}
            autoFocus
          />
          {!subject && (
            <p className="mt-1 text-xs text-ink-500">
              💡 Virgülle ayırarak birden fazla ders ekleyebilirsin. Her dersi
              ayrı bir renkle işaretlerim.
            </p>
          )}
          {!subject && parsedNames.length > 1 && (
            <p className="mt-2 text-xs text-primary-700">
              Eklenecek: {parsedNames.map((n) => `"${n}"`).join(', ')}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="subject-code">{tr.subjects.code}</Label>
            <Input
              id="subject-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="MAT"
              maxLength={6}
            />
          </div>
          <div>
            <Label htmlFor="subject-color">{tr.subjects.color}</Label>
            <div className="flex items-center gap-2">
              <input
                id="subject-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded-md border border-surface-200 bg-white"
              />
              <Input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
          </div>
        </div>
        <div>
          <Label htmlFor="subject-notes">{tr.common.notes}</Label>
          <Textarea
            id="subject-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}
