import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  ListChecks,
  X,
  Eye,
  EyeOff,
  Plus,
  Wand2 as BulkIcon,
} from 'lucide-react';
import { tr } from '../lib/i18n';
import { useActivitiesStore } from '../store/activities';
import { useClassesStore } from '../store/classes';
import { useSubjectsStore } from '../store/subjects';
import { useTeachersStore } from '../store/teachers';
import { useToastStore } from '../store/toast';
import { Button } from '../components/ui/Button';
import { Input, Label } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { EmptyState } from '../components/ui/EmptyState';
import { Dialog } from '../components/ui/Dialog';
import { Spinner } from '../components/ui/Spinner';
import type { Activity, ClassRoom, Subject } from '../lib/types';

export default function Activities() {
  const {
    activities,
    loading: activitiesLoading,
    load: loadActivities,
    upsert,
    remove,
    setSplit,
    clearSplit,
    findByCell,
  } = useActivitiesStore();
  const { classes, years, load: loadClasses, loading: classesLoading } = useClassesStore();
  const { subjects, load: loadSubjects, loading: subjectsLoading } = useSubjectsStore();
  const { teachers, load: loadTeachers } = useTeachersStore();
  const toast = useToastStore();

  const [filterFilled, setFilterFilled] = useState(false);
  const [editing, setEditing] = useState<{
    cls: ClassRoom;
    subj: Subject;
    activity: Activity | null;
  } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  useEffect(() => {
    loadActivities();
    loadClasses();
    loadSubjects();
    loadTeachers();
  }, [loadActivities, loadClasses, loadSubjects, loadTeachers]);

  const orderedClasses = useMemo(() => {
    const yearOrder = new Map(years.map((y) => [y.id, y.orderIndex]));
    return [...classes].sort((a, b) => {
      const ay = a.yearId != null ? yearOrder.get(a.yearId) ?? 999 : 999;
      const by = b.yearId != null ? yearOrder.get(b.yearId) ?? 999 : 999;
      if (ay !== by) return ay - by;
      return a.name.localeCompare(b.name, 'tr');
    });
  }, [classes, years]);

  const filteredSubjects = useMemo(() => {
    if (!filterFilled) return subjects;
    const usedSubjectIds = new Set(activities.map((a) => a.subjectId));
    return subjects.filter((s) => usedSubjectIds.has(s.id));
  }, [subjects, activities, filterFilled]);

  const filteredClasses = useMemo(() => {
    if (!filterFilled) return orderedClasses;
    const usedClassIds = new Set(activities.map((a) => a.classId));
    return orderedClasses.filter((c) => usedClassIds.has(c.id));
  }, [orderedClasses, activities, filterFilled]);

  // Sınıflar ya da dersler henüz yüklenmediyse (ilk açılış) inline spinner
  // göstermek, "Henüz sınıf yok" placeholder'ı flaşlatmaktan daha doğru.
  if (
    (classesLoading && classes.length === 0) ||
    (subjectsLoading && subjects.length === 0) ||
    (activitiesLoading && activities.length === 0 && classes.length === 0)
  ) {
    return <Spinner block />;
  }
  if (classes.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title="Henüz sınıf eklenmemiş"
        description="Sol üstten 'Sınıflar' ekranına git ya da sağdaki AI paneline '9A, 9B, 10F sınıflarını ekle' yaz."
      />
    );
  }
  if (subjects.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title="Henüz ders eklenmemiş"
        description="Önce öğretmen eklersen verdiği ders otomatik oluşur. Veya sağdaki AI paneline 'Matematik, Fizik, Türkçe derslerini ekle' yazabilirsin. Manuel: Gelişmiş > Dersler."
      />
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">
            {tr.activities.title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-600">
            Aşağıdaki tabloda <strong>her sınıfın her dersten kaç saat
            alacağını</strong> belirle. Hücreye tıklayınca saat sayısı +
            öğretmen + tek/çift saat seç dialog'u açılır.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 rounded-lg bg-primary-50 px-3 py-2 text-xs text-ink-700">
            <span>💡 İpucu:</span>
            <span>
              Her sınıfın haftalık ders saatleri farklı olabilir (9A
              matematikten 5, 10F'den 6 saat gibi). Hücredeki saat sayısı 0
              ise o sınıf o dersi almıyor demek.
            </span>
          </div>
          <p className="mt-2 text-xs text-ink-500">
            Sağdaki AI panele "9A'ya 5 saat matematik ekle, Ahmet versin"
            yazarsan bunu otomatik halleder.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button onClick={() => setBulkOpen(true)}>
            <BulkIcon size={16} />
            Toplu Ekle
          </Button>
          <Button
            variant="secondary"
            onClick={() => setFilterFilled((v) => !v)}
          >
            {filterFilled ? <Eye size={16} /> : <EyeOff size={16} />}
            {filterFilled ? tr.activities.showAll : tr.activities.showFilledOnly}
          </Button>
        </div>
      </header>

      <div className="overflow-x-auto rounded-xl border border-surface-200 bg-white shadow-soft">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-10 min-w-[140px] border-b border-r border-surface-200 bg-surface-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-600">
                Sınıf \ Branş
              </th>
              {filteredSubjects.map((s) => (
                <th
                  key={s.id}
                  className="min-w-[88px] border-b border-r border-surface-200 bg-surface-50 px-2 py-2 text-center text-xs font-semibold text-ink-700"
                >
                  <div className="flex flex-col items-center gap-1">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: s.color ?? '#3b82f6' }}
                    />
                    <span className="truncate" title={s.name}>
                      {s.shortCode || s.name}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredClasses.map((c) => (
              <tr key={c.id}>
                <th className="sticky left-0 z-10 border-b border-r border-surface-200 bg-white px-3 py-2 text-left text-sm font-medium text-ink-900">
                  {c.name}
                </th>
                {filteredSubjects.map((s) => {
                  const activity = findByCell(c.id, s.id);
                  const teacher = activity
                    ? teachers.find((t) => t.id === activity.teacherId)
                    : null;
                  const isSplit = activity?.splitGroupId != null;
                  return (
                    <td
                      key={s.id}
                      className="border-b border-r border-surface-200 p-0"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setEditing({ cls: c, subj: s, activity: activity ?? null })
                        }
                        className={
                          activity
                            ? isSplit
                              ? 'flex h-full min-h-[56px] w-full flex-col items-center justify-center gap-0.5 bg-amber-50 px-1 py-1.5 text-amber-900 ring-1 ring-inset ring-amber-300 transition-colors hover:bg-amber-100'
                              : 'flex h-full min-h-[56px] w-full flex-col items-center justify-center gap-0.5 bg-primary-50 px-1 py-1.5 text-primary-900 transition-colors hover:bg-primary-100'
                            : 'flex h-full min-h-[56px] w-full items-center justify-center bg-white text-ink-300 transition-colors hover:bg-surface-50'
                        }
                      >
                        {activity ? (
                          <>
                            <span className="flex items-center gap-1 text-sm font-semibold tabular-nums">
                              {isSplit && (
                                <ArrowLeftRight
                                  size={12}
                                  className="text-amber-600"
                                />
                              )}
                              {activity.weeklyHours}h
                            </span>
                            {teacher && (
                              <span
                                className={
                                  isSplit
                                    ? 'truncate text-[10px] text-amber-700'
                                    : 'truncate text-[10px] text-primary-700'
                                }
                              >
                                {teacher.name.split(' ')[0]}
                              </span>
                            )}
                            {activity.blockDuration > 1 && (
                              <span
                                className={
                                  isSplit
                                    ? 'text-[10px] text-amber-700'
                                    : 'text-[10px] text-primary-700'
                                }
                              >
                                ×{activity.blockDuration}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-base">+</span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <ActivityEditorDialog
          cls={editing.cls}
          subj={editing.subj}
          activity={editing.activity}
          siblingActivities={activities.filter(
            (a) => a.classId === editing.cls.id && a.id !== editing.activity?.id,
          )}
          subjects={subjects}
          onClose={() => setEditing(null)}
          onSubmit={async (input) => {
            const ok = await upsert(input);
            if (ok) {
              toast.success(tr.common.saved, `${editing.cls.name} · ${editing.subj.name}`);
              setEditing(null);
            } else toast.error(tr.common.error);
          }}
          onDelete={async () => {
            if (!editing.activity) return;
            const ok = await remove(editing.activity.id);
            if (ok) {
              toast.success(tr.common.deleted);
              setEditing(null);
            } else toast.error(tr.common.error);
          }}
          onPair={async (otherId) => {
            if (!editing.activity) return;
            const ok = await setSplit([editing.activity.id, otherId]);
            if (ok) {
              toast.success(tr.activities.paired);
              setEditing(null);
            } else toast.error(tr.common.error);
          }}
          onUnpair={async () => {
            if (!editing.activity) return;
            const ok = await clearSplit(editing.activity.id);
            if (ok) {
              toast.success(tr.activities.unpair);
              setEditing(null);
            } else toast.error(tr.common.error);
          }}
        />
      )}

      {bulkOpen && (
        <BulkAddDialog
          classes={orderedClasses}
          subjects={subjects}
          teachers={teachers}
          onClose={() => setBulkOpen(false)}
          onSubmit={async (rows) => {
            let ok = 0;
            for (const r of rows) {
              const success = await upsert(r);
              if (success) ok++;
            }
            if (ok > 0) toast.success(`${ok} ders ataması eklendi`);
            if (ok < rows.length)
              toast.error(`${rows.length - ok} atama başarısız`);
            setBulkOpen(false);
          }}
        />
      )}
    </div>
  );
}

function BulkAddDialog({
  classes,
  subjects,
  teachers,
  onClose,
  onSubmit,
}: {
  classes: ClassRoom[];
  subjects: Subject[];
  teachers: ReturnType<typeof useTeachersStore.getState>['teachers'];
  onClose: () => void;
  onSubmit: (
    rows: Array<{
      classId: number;
      subjectId: number;
      teacherId: number | null;
      weeklyHours: number;
      blockDuration: number;
    }>,
  ) => Promise<void>;
}) {
  const [subjectId, setSubjectId] = useState<number | null>(
    subjects[0]?.id ?? null,
  );
  const [teacherId, setTeacherId] = useState<number | null>(null);
  const [weeklyHours, setWeeklyHours] = useState(4);
  const [blockDuration, setBlockDuration] = useState(1);
  const [classIds, setClassIds] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const toggleClass = (id: number) => {
    setClassIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (classIds.size === classes.length) setClassIds(new Set());
    else setClassIds(new Set(classes.map((c) => c.id)));
  };

  // Seçili dersi verebilecek öğretmenler (varsa)
  const eligibleTeachers = useMemo(() => {
    if (!subjectId) return teachers;
    return teachers.filter((t) =>
      (t.subjectIds ?? []).includes(subjectId),
    );
  }, [teachers, subjectId]);

  const canSubmit =
    subjectId !== null && classIds.size > 0 && weeklyHours > 0 && !submitting;

  async function submit() {
    if (!canSubmit || subjectId === null) return;
    setSubmitting(true);
    const rows = Array.from(classIds).map((cid) => ({
      classId: cid,
      subjectId,
      teacherId,
      weeklyHours: Math.max(1, Math.floor(weeklyHours)),
      blockDuration: Math.max(1, Math.floor(blockDuration)),
    }));
    await onSubmit(rows);
    setSubmitting(false);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Toplu Ders Ekle"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            İptal
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            <Plus size={16} />
            {classIds.size > 0
              ? `${classIds.size} sınıfa ekle`
              : 'Sınıf seç'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-lg bg-primary-50 p-3 text-sm text-ink-700">
          🎯 Örnek: <strong>Matematik</strong> dersini haftada{' '}
          <strong>6 saat</strong>,{' '}
          <strong>9A, 9B, 9C, 9D</strong> sınıflarına ekle — <strong>Ahmet</strong>{' '}
          hoca versin. Bir tıkla.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="bulk-subject">Ders</Label>
            <Select
              id="bulk-subject"
              value={subjectId ?? ''}
              onChange={(e) => {
                setSubjectId(e.target.value ? Number(e.target.value) : null);
                setTeacherId(null);
              }}
            >
              <option value="">Seçiniz...</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="bulk-teacher">Öğretmen (opsiyonel)</Label>
            <Select
              id="bulk-teacher"
              value={teacherId ?? ''}
              onChange={(e) =>
                setTeacherId(e.target.value ? Number(e.target.value) : null)
              }
              disabled={!subjectId}
            >
              <option value="">— atama yapma —</option>
              {eligibleTeachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            {subjectId && eligibleTeachers.length === 0 && (
              <p className="mt-1 text-xs text-amber-700">
                Bu dersi veren öğretmen yok. Önce Öğretmenler ekranından
                dersi bir öğretmene ata.
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="bulk-hours">Haftalık Saat</Label>
            <Input
              id="bulk-hours"
              type="number"
              min={1}
              max={20}
              value={weeklyHours}
              onChange={(e) => setWeeklyHours(Number(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="bulk-block">Süre</Label>
            <Select
              id="bulk-block"
              value={blockDuration}
              onChange={(e) => setBlockDuration(Number(e.target.value))}
            >
              <option value={1}>Tek saat (1)</option>
              <option value={2}>Çift saat blok (2)</option>
            </Select>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label>Sınıflar ({classIds.size} seçili)</Label>
            <button
              type="button"
              onClick={toggleAll}
              className="text-xs text-primary-600 hover:underline"
            >
              {classIds.size === classes.length ? 'Hiçbiri' : 'Tümü'}
            </button>
          </div>
          <div className="grid max-h-60 grid-cols-4 gap-1.5 overflow-y-auto rounded-lg border border-surface-200 bg-surface-50 p-2">
            {classes.map((c) => {
              const selected = classIds.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleClass(c.id)}
                  className={
                    'rounded-md border px-2 py-1.5 text-sm font-medium transition-colors ' +
                    (selected
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-surface-200 bg-white text-ink-700 hover:bg-surface-100')
                  }
                >
                  {c.name}
                </button>
              );
            })}
            {classes.length === 0 && (
              <p className="col-span-4 py-4 text-center text-sm text-ink-500">
                Henüz sınıf yok — önce Sınıflar ekranından ekle.
              </p>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function ActivityEditorDialog({
  cls,
  subj,
  activity,
  siblingActivities,
  subjects,
  onClose,
  onSubmit,
  onDelete,
  onPair,
  onUnpair,
}: {
  cls: ClassRoom;
  subj: Subject;
  activity: Activity | null;
  siblingActivities: Activity[];
  subjects: Subject[];
  onClose: () => void;
  onSubmit: (input: {
    id?: number;
    classId: number;
    subjectId: number;
    teacherId: number | null;
    weeklyHours: number;
    blockDuration: number;
  }) => Promise<void>;
  onDelete: () => Promise<void>;
  onPair: (otherId: number) => Promise<void>;
  onUnpair: () => Promise<void>;
}) {
  const { teachers } = useTeachersStore();
  const [weeklyHours, setWeeklyHours] = useState(activity?.weeklyHours ?? 2);
  const [teacherId, setTeacherId] = useState<number | null>(
    activity?.teacherId ?? null,
  );
  const [blockDuration, setBlockDuration] = useState(
    activity?.blockDuration ?? 1,
  );
  const [submitting, setSubmitting] = useState(false);
  const [pairOpen, setPairOpen] = useState(false);

  const eligibleTeachers = useMemo(
    () => teachers.filter((t) => t.subjectIds?.includes(subj.id)),
    [teachers, subj.id],
  );
  const teacherOptions =
    eligibleTeachers.length > 0 ? eligibleTeachers : teachers;

  const subjectById = useMemo(
    () => new Map(subjects.map((s) => [s.id, s])),
    [subjects],
  );
  // Aynı sınıftaki, kendisi olmayan aktiviteler (eşleşme adayları)
  const pairCandidates = useMemo(
    () =>
      siblingActivities.filter(
        (a) =>
          // aynı sınıf garanti, sadece zaten farklı bir gruba bağlı olmasın
          activity == null || a.splitGroupId == null ||
          a.splitGroupId === activity.splitGroupId,
      ),
    [siblingActivities, activity],
  );

  // Mevcut eşli partner aktiviteler (görüntü için)
  const currentPartners = useMemo(() => {
    if (!activity?.splitGroupId) return [] as Activity[];
    return siblingActivities.filter(
      (a) => a.splitGroupId === activity.splitGroupId,
    );
  }, [siblingActivities, activity]);

  async function submit() {
    setSubmitting(true);
    await onSubmit({
      id: activity?.id,
      classId: cls.id,
      subjectId: subj.id,
      teacherId,
      weeklyHours: Math.max(0, Math.floor(weeklyHours || 0)),
      blockDuration,
    });
    setSubmitting(false);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${cls.name} — ${subj.name}`}
      description={tr.activities.title}
      footer={
        <>
          {activity && (
            <Button
              variant="ghost"
              onClick={onDelete}
              className="mr-auto text-accent-err hover:bg-red-50"
            >
              <X size={14} />
              {tr.activities.clear}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            {tr.common.cancel}
          </Button>
          <Button onClick={submit} disabled={submitting || weeklyHours <= 0}>
            {tr.common.save}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="activity-hours">{tr.activities.weeklyHours}</Label>
          <Input
            id="activity-hours"
            type="number"
            min={1}
            max={20}
            value={weeklyHours}
            onChange={(e) => setWeeklyHours(Number(e.target.value))}
            autoFocus
          />
        </div>
        <div>
          <Label htmlFor="activity-teacher">{tr.activities.teacher}</Label>
          <Select
            id="activity-teacher"
            value={teacherId ?? ''}
            onChange={(e) =>
              setTeacherId(
                e.target.value === '' ? null : Number(e.target.value),
              )
            }
          >
            <option value="">{tr.common.none}</option>
            {teacherOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          {eligibleTeachers.length === 0 && (
            <p className="mt-1 text-xs text-ink-400">
              Bu branşta öğretmen tanımlı değil. Tüm öğretmenler listelendi.
            </p>
          )}
        </div>
        <div>
          <Label>{tr.activities.block}</Label>
          <div className="flex gap-2">
            {[1, 2].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setBlockDuration(n)}
                className={
                  blockDuration === n
                    ? 'flex-1 rounded-lg border border-primary-300 bg-primary-50 px-3 py-2 text-sm font-medium text-primary-700'
                    : 'flex-1 rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-ink-700 hover:bg-surface-50'
                }
              >
                {n === 1
                  ? tr.activities.blockSingle
                  : tr.activities.blockDouble}
              </button>
            ))}
          </div>
        </div>

        {activity && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <Label>
                  <span className="flex items-center gap-1.5">
                    <ArrowLeftRight size={14} className="text-amber-600" />
                    {tr.activities.pairWith}
                  </span>
                </Label>
                <p className="text-xs text-ink-600">{tr.activities.pairHint}</p>
                {currentPartners.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {currentPartners.map((p) => {
                      const s = subjectById.get(p.subjectId);
                      return (
                        <span
                          key={p.id}
                          className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900"
                        >
                          {s?.shortCode || s?.name || `#${p.subjectId}`}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
              {currentPartners.length > 0 ? (
                <Button variant="secondary" onClick={onUnpair}>
                  {tr.activities.unpair}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  disabled={pairCandidates.length === 0}
                  onClick={() => setPairOpen(true)}
                >
                  <ArrowLeftRight size={14} />
                  {tr.activities.pair}
                </Button>
              )}
            </div>
            {pairCandidates.length === 0 && currentPartners.length === 0 && (
              <p className="mt-1 text-xs text-ink-400">
                {tr.activities.noPairCandidates}
              </p>
            )}
          </div>
        )}
      </div>

      {pairOpen && activity && (
        <PairChooserDialog
          candidates={pairCandidates}
          subjectById={subjectById}
          onClose={() => setPairOpen(false)}
          onChoose={async (otherId) => {
            setPairOpen(false);
            await onPair(otherId);
          }}
        />
      )}
    </Dialog>
  );
}

function PairChooserDialog({
  candidates,
  subjectById,
  onClose,
  onChoose,
}: {
  candidates: Activity[];
  subjectById: Map<number, Subject>;
  onClose: () => void;
  onChoose: (id: number) => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<number | null>(
    candidates[0]?.id ?? null,
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title={tr.activities.pairChoose}
      description={tr.activities.pairHint}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tr.common.cancel}
          </Button>
          <Button
            onClick={() => selected != null && onChoose(selected)}
            disabled={selected == null}
          >
            <ArrowLeftRight size={14} />
            {tr.activities.pair}
          </Button>
        </>
      }
    >
      <div className="max-h-72 space-y-1.5 overflow-y-auto">
        {candidates.map((a) => {
          const s = subjectById.get(a.subjectId);
          const active = selected === a.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setSelected(a.id)}
              className={
                active
                  ? 'flex w-full items-center justify-between gap-2 rounded-lg border border-primary-300 bg-primary-50 px-3 py-2 text-left text-sm text-primary-900'
                  : 'flex w-full items-center justify-between gap-2 rounded-lg border border-surface-200 bg-white px-3 py-2 text-left text-sm text-ink-700 hover:bg-surface-50'
              }
            >
              <span className="flex items-center gap-2">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: s?.color ?? '#3b82f6' }}
                />
                <span className="font-medium">{s?.name ?? `#${a.subjectId}`}</span>
              </span>
              <span className="text-xs tabular-nums text-ink-600">
                {a.weeklyHours}h
              </span>
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
