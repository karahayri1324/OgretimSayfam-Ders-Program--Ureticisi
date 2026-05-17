import { useEffect, useState } from 'react';
import { Users, Pencil, Trash2, Plus } from 'lucide-react';
import { tr } from '../lib/i18n';
import { useTeachersStore } from '../store/teachers';
import { useSubjectsStore } from '../store/subjects';
import { useToastStore } from '../store/toast';
import { Button } from '../components/ui/Button';
import { Input, Label, Textarea } from '../components/ui/Input';
import { Table, type Column } from '../components/ui/Table';
import { EmptyState } from '../components/ui/EmptyState';
import { Badge } from '../components/ui/Badge';
import { Dialog } from '../components/ui/Dialog';
import { Spinner } from '../components/ui/Spinner';
import { SubjectCombobox } from '../components/ui/SubjectCombobox';
import type { Subject, Teacher, TeacherInput } from '../lib/types';

export default function Teachers() {
  const { teachers, load, create, update, remove, loading } = useTeachersStore();
  const { subjects, load: loadSubjects } = useSubjectsStore();
  const toast = useToastStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);

  useEffect(() => {
    load();
    loadSubjects();
  }, [load, loadSubjects]);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(t: Teacher) {
    setEditing(t);
    setDialogOpen(true);
  }

  async function handleDelete(t: Teacher) {
    if (!window.confirm(tr.teachers.deleteConfirm)) return;
    const ok = await remove(t.id);
    if (ok) toast.success(tr.common.deleted, t.name);
    else toast.error(tr.common.error);
  }

  const columns: Column<Teacher>[] = [
    {
      key: 'name',
      header: tr.teachers.name,
      cell: (t) => <span className="font-medium text-ink-900">{t.name}</span>,
    },
    {
      key: 'subjects',
      header: tr.teachers.subjects,
      cell: (t) => {
        const items = (t.subjectIds ?? [])
          .map((id) => subjects.find((s) => s.id === id))
          .filter(Boolean);
        if (items.length === 0)
          return <span className="text-ink-400">{tr.common.none}</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {items.map((s) => (
              <Badge key={s!.id} variant="primary">
                {s!.shortCode || s!.name}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      key: 'hours',
      header: tr.teachers.weeklyHours,
      cell: (t) => <span className="tabular-nums">{t.weeklyTargetHours}</span>,
      width: '140px',
    },
    {
      key: 'notes',
      header: tr.common.notes,
      cell: (t) => (
        <span className="text-ink-600">
          {t.notes ? t.notes : <span className="text-ink-400">—</span>}
        </span>
      ),
    },
    {
      key: 'actions',
      header: tr.common.actions,
      width: '140px',
      cell: (t) => (
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            aria-label={tr.common.edit}
            onClick={() => openEdit(t)}
          >
            <Pencil size={14} />
            {tr.common.edit}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={tr.common.delete}
            onClick={() => handleDelete(t)}
            className="text-accent-err hover:bg-red-50"
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ),
      className: 'text-right',
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">
            {tr.teachers.title}{' '}
            <span className="text-ink-400">({teachers.length})</span>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-600">
            Öğretmen ad-soyad + verdiği branşlar (birden fazla seçebilirsin —
            seçmeli dersler için) + haftalık ders saati. Hangi öğretmenin
            hangi sınıfa kaç saat gireceği "Dersler" matrisinde belirlenir.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} />
          {tr.teachers.addNew}
        </Button>
      </header>

      {loading && teachers.length === 0 ? (
        <Spinner block />
      ) : teachers.length === 0 ? (
        <EmptyState
          icon={Users}
          title={tr.teachers.empty}
          description={tr.teachers.emptyHint}
          action={
            <Button onClick={openCreate}>
              <Plus size={16} />
              {tr.teachers.addNew}
            </Button>
          }
        />
      ) : (
        <Table
          columns={columns}
          rows={teachers}
          getRowKey={(t) => t.id}
        />
      )}

      <TeacherDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        teacher={editing}
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

function TeacherDialog({
  open,
  onClose,
  teacher,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  teacher: Teacher | null;
  onSubmit: (input: TeacherInput) => Promise<void>;
}) {
  const subjects = useSubjectsStore((s) => s.subjects);
  const createSubject = useSubjectsStore((s) => s.create);
  const [name, setName] = useState('');
  const [weekly, setWeekly] = useState(25);
  const [subjectIds, setSubjectIds] = useState<number[]>([]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(teacher?.name ?? '');
      setWeekly(teacher?.weeklyTargetHours ?? 25);
      setSubjectIds(teacher?.subjectIds ?? []);
      setNotes(teacher?.notes ?? '');
    }
  }, [open, teacher]);

  /**
   * Combobox'tan "yeni ders yarat" çağırılır. Subjects store'da `create`
   * boolean döndüğü için yeni Subject id'sini almak adına, başarı sonrası
   * store'un güncel listesinde aynı isimle eşleşeni buluyoruz.
   * (Store load() çağırıyor zaten — `useSubjectsStore.getState().subjects`
   * yeni hali içerir.)
   */
  async function handleCreateSubject(rawName: string): Promise<Subject | null> {
    const trimmed = rawName.trim();
    if (!trimmed) return null;
    const ok = await createSubject({ name: trimmed });
    if (!ok) return null;
    const all = useSubjectsStore.getState().subjects;
    // Yeni eklenen genelde son sırada olur; öncelikle isme göre eşleştir.
    const found =
      all.find((s) => s.name.trim() === trimmed) ??
      all.find((s) => s.name.toLocaleLowerCase('tr-TR') === trimmed.toLocaleLowerCase('tr-TR')) ??
      null;
    return found;
  }

  async function submit() {
    if (!name.trim()) return;
    setSubmitting(true);
    await onSubmit({
      name: name.trim(),
      weeklyTargetHours: Math.max(0, Math.floor(weekly)),
      notes: notes.trim() || null,
      subjectIds,
    });
    setSubmitting(false);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={teacher ? tr.teachers.edit : tr.teachers.addNew}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tr.common.cancel}
          </Button>
          <Button onClick={submit} disabled={submitting || !name.trim()}>
            {tr.common.save}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="teacher-name">{tr.teachers.name}</Label>
          <Input
            id="teacher-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ahmet Yılmaz"
            autoFocus
          />
        </div>
        <div>
          <Label htmlFor="teacher-hours">{tr.teachers.weeklyHours}</Label>
          <Input
            id="teacher-hours"
            type="number"
            min={0}
            max={60}
            value={weekly}
            onChange={(e) => setWeekly(Number(e.target.value))}
          />
        </div>
        <div>
          <Label htmlFor="teacher-subjects">{tr.teachers.subjects}</Label>
          <SubjectCombobox
            id="teacher-subjects"
            value={subjectIds}
            onChange={setSubjectIds}
            subjects={subjects}
            onCreateSubject={handleCreateSubject}
          />
        </div>
        <div>
          <Label htmlFor="teacher-notes">{tr.common.notes}</Label>
          <Textarea
            id="teacher-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}
