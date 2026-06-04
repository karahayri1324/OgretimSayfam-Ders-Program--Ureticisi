import { useEffect, useMemo, useState } from 'react';
import {
  GraduationCap,
  Pencil,
  Plus,
  Trash2,
  Layers,
} from 'lucide-react';
import { tr } from '../lib/i18n';
import { useClassesStore } from '../store/classes';
import { useRoomsStore } from '../store/rooms';
import { useToastStore } from '../store/toast';
import { Button } from '../components/ui/Button';
import { Input, Label } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Dialog } from '../components/ui/Dialog';
import { Spinner } from '../components/ui/Spinner';
import type { ClassInput, ClassRoom, ClassYear } from '../lib/types';

export default function Classes() {
  const {
    years,
    classes,
    load,
    loading,
    createClass,
    updateClass,
    removeClass,
    createYear,
    updateYear,
    removeYear,
  } = useClassesStore();
  const { rooms, load: loadRooms } = useRoomsStore();
  const toast = useToastStore();

  const [classDialog, setClassDialog] = useState<{
    open: boolean;
    editing: ClassRoom | null;
    yearId: number | null;
  }>({ open: false, editing: null, yearId: null });
  const [yearDialog, setYearDialog] = useState<{
    open: boolean;
    editing: ClassYear | null;
  }>({ open: false, editing: null });

  useEffect(() => {
    load();
    loadRooms();
  }, [load, loadRooms]);

  const grouped = useMemo(() => {
    const map = new Map<number | null, ClassRoom[]>();
    for (const c of classes) {
      const key = c.yearId ?? null;
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    const ordered = [...years]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((y) => ({ year: y, classes: map.get(y.id) ?? [] }));
    const ungrouped = map.get(null) ?? [];
    return { ordered, ungrouped };
  }, [years, classes]);

  async function handleRemoveClass(c: ClassRoom) {
    if (!window.confirm(tr.classes.deleteConfirm)) return;
    const ok = await removeClass(c.id);
    if (ok) toast.success(tr.common.deleted, c.name);
    else toast.error(tr.common.error, useClassesStore.getState().lastError ?? undefined);
  }

  async function handleRemoveYear(y: ClassYear) {
    if (
      !window.confirm(
        `${y.name} düzeyini ve içindeki tüm sınıfları silmek istediğinize emin misiniz?`,
      )
    )
      return;
    const ok = await removeYear(y.id);
    if (ok) toast.success(tr.common.deleted, y.name);
    else toast.error(tr.common.error, useClassesStore.getState().lastError ?? undefined);
  }

  const total = classes.length;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">
            {tr.classes.title}{' '}
            <span className="text-ink-400">({total})</span>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-600">
            <strong>Sınıf = öğrenci grubu.</strong> Örnek: 9A, 9B, 10F. Aynı
            öğrenciler aynı dersleri birlikte alır. Önce <em>Düzey</em> (9.
            sınıf, 10. sınıf) sonra altına <em>şubeler</em> (9A, 9B) eklenir.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => setYearDialog({ open: true, editing: null })}
          >
            <Layers size={16} />
            {tr.classes.addYear}
          </Button>
          <Button
            onClick={() =>
              setClassDialog({
                open: true,
                editing: null,
                yearId: years[0]?.id ?? null,
              })
            }
          >
            <Plus size={16} />
            {tr.classes.addNew}
          </Button>
        </div>
      </header>

      {loading && years.length === 0 && classes.length === 0 ? (
        <Spinner block />
      ) : years.length === 0 && classes.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title={tr.classes.empty}
          description={`${tr.classes.emptyHint} Önce bir düzey ekleyin (örn. 9. Sınıf), sonra altına sınıflar (9A, 9B) ekleyin.`}
          action={
            <Button onClick={() => setYearDialog({ open: true, editing: null })}>
              <Layers size={16} />
              {tr.classes.addYear}
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {grouped.ordered.map(({ year, classes: yearClasses }) => (
            <YearGroup
              key={year.id}
              year={year}
              classes={yearClasses}
              rooms={rooms}
              onAddClass={() =>
                setClassDialog({
                  open: true,
                  editing: null,
                  yearId: year.id,
                })
              }
              onEditYear={() =>
                setYearDialog({ open: true, editing: year })
              }
              onRemoveYear={() => handleRemoveYear(year)}
              onEditClass={(c) =>
                setClassDialog({
                  open: true,
                  editing: c,
                  yearId: c.yearId ?? null,
                })
              }
              onRemoveClass={handleRemoveClass}
            />
          ))}
          {grouped.ungrouped.length > 0 && (
            <Card>
              <div className="border-b border-surface-200 px-5 py-3">
                <h3 className="font-semibold text-ink-900">
                  {tr.classes.ungrouped}
                </h3>
              </div>
              <ClassList
                classes={grouped.ungrouped}
                rooms={rooms}
                onEdit={(c) =>
                  setClassDialog({
                    open: true,
                    editing: c,
                    yearId: null,
                  })
                }
                onRemove={handleRemoveClass}
              />
            </Card>
          )}
        </div>
      )}

      <YearDialog
        open={yearDialog.open}
        editing={yearDialog.editing}
        onClose={() => setYearDialog({ open: false, editing: null })}
        onSubmit={async (name) => {
          const ok = yearDialog.editing
            ? await updateYear(yearDialog.editing.id, name)
            : await createYear(name);
          if (ok) {
            toast.success(tr.common.saved, name);
            setYearDialog({ open: false, editing: null });
          } else toast.error(tr.common.error);
        }}
      />

      <ClassDialog
        open={classDialog.open}
        editing={classDialog.editing}
        defaultYearId={classDialog.yearId}
        years={years}
        rooms={rooms}
        onClose={() =>
          setClassDialog({ open: false, editing: null, yearId: null })
        }
        onSubmit={async (input) => {
          const ok = classDialog.editing
            ? await updateClass(classDialog.editing.id, input)
            : await createClass(input);
          if (ok) {
            toast.success(tr.common.saved, input.name);
            setClassDialog({ open: false, editing: null, yearId: null });
          } else toast.error(tr.common.error);
        }}
      />
    </div>
  );
}

function YearGroup({
  year,
  classes,
  rooms,
  onAddClass,
  onEditYear,
  onRemoveYear,
  onEditClass,
  onRemoveClass,
}: {
  year: ClassYear;
  classes: ClassRoom[];
  rooms: ReturnType<typeof useRoomsStore.getState>['rooms'];
  onAddClass: () => void;
  onEditYear: () => void;
  onRemoveYear: () => void;
  onEditClass: (c: ClassRoom) => void;
  onRemoveClass: (c: ClassRoom) => void;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-surface-200 px-5 py-3">
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-primary-500" />
          <h3 className="font-semibold text-ink-900">{year.name}</h3>
          <span className="text-xs text-ink-400">
            ({classes.length} sınıf)
          </span>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={onEditYear}>
            <Pencil size={14} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRemoveYear}
            className="text-accent-err hover:bg-red-50"
          >
            <Trash2 size={14} />
          </Button>
          <Button size="sm" variant="secondary" onClick={onAddClass}>
            <Plus size={14} />
            {tr.classes.addNew}
          </Button>
        </div>
      </div>
      {classes.length === 0 ? (
        <p className="px-5 py-4 text-sm text-ink-400">
          Bu düzeyde henüz sınıf yok.
        </p>
      ) : (
        <ClassList
          classes={classes}
          rooms={rooms}
          onEdit={onEditClass}
          onRemove={onRemoveClass}
        />
      )}
    </Card>
  );
}

function ClassList({
  classes,
  rooms,
  onEdit,
  onRemove,
}: {
  classes: ClassRoom[];
  rooms: ReturnType<typeof useRoomsStore.getState>['rooms'];
  onEdit: (c: ClassRoom) => void;
  onRemove: (c: ClassRoom) => void;
}) {
  return (
    <ul className="divide-y divide-surface-200">
      {classes.map((c) => {
        const home = rooms.find((r) => r.id === c.homeRoomId);
        return (
          <li
            key={c.id}
            className="flex items-center justify-between px-5 py-2.5"
          >
            <div className="flex items-center gap-4">
              <span className="font-medium text-ink-900">{c.name}</span>
              <span className="text-xs text-ink-600">
                {c.studentCount} öğrenci
              </span>
              {home && (
                <span className="text-xs text-ink-600">
                  · {tr.classes.homeRoom}: {home.name}
                </span>
              )}
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => onEdit(c)}>
                <Pencil size={14} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onRemove(c)}
                className="text-accent-err hover:bg-red-50"
              >
                <Trash2 size={14} />
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function YearDialog({
  open,
  editing,
  onClose,
  onSubmit,
}: {
  open: boolean;
  editing: ClassYear | null;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (open) setName(editing?.name ?? '');
  }, [open, editing]);

  async function submit() {
    if (!name.trim()) return;
    setSubmitting(true);
    await onSubmit(name.trim());
    setSubmitting(false);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? tr.classes.editYear : tr.classes.addYear}
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
      <Label htmlFor="year-name">{tr.classes.yearName}</Label>
      <Input
        id="year-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="9. Sınıf"
        autoFocus
      />
    </Dialog>
  );
}

function ClassDialog({
  open,
  editing,
  defaultYearId,
  years,
  rooms,
  onClose,
  onSubmit,
}: {
  open: boolean;
  editing: ClassRoom | null;
  defaultYearId: number | null;
  years: ClassYear[];
  rooms: ReturnType<typeof useRoomsStore.getState>['rooms'];
  onClose: () => void;
  onSubmit: (input: ClassInput) => Promise<void>;
}) {
  type HomeRoomMode = 'none' | 'same' | 'custom';
  const reloadRooms = useRoomsStore((s) => s.load);
  const [name, setName] = useState('');
  const [yearId, setYearId] = useState<number | null>(null);
  const [homeRoomMode, setHomeRoomMode] = useState<HomeRoomMode>('none');
  const [customRoomId, setCustomRoomId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? '');
      setYearId(editing?.yearId ?? defaultYearId ?? null);
      if (editing?.homeRoomId) {
        const room = rooms.find((r) => r.id === editing.homeRoomId);
        setHomeRoomMode(room && room.name === editing.name ? 'same' : 'custom');
        setCustomRoomId(editing.homeRoomId);
      } else {
        setHomeRoomMode('none');
        setCustomRoomId(null);
      }
    }
  }, [open, editing, defaultYearId, rooms]);

  const parsedNames = editing
    ? [name.trim()].filter(Boolean)
    : name
        .split(/[,;\n]/)
        .map((n) => n.trim())
        .filter(Boolean);

  async function ensureRoomForClass(className: string): Promise<number | null> {
    const existing = rooms.find(
      (r) => r.name.toLowerCase() === className.toLowerCase(),
    );
    if (existing) return existing.id;
    const res = await window.api.rooms.create({
      name: className,
      capacity: 30,
      building: null,
      notes: null,
    });
    if (res.ok && res.data && typeof (res.data as { id?: number }).id === 'number') {
      return (res.data as { id: number }).id;
    }
    return null;
  }

  async function submit() {
    if (parsedNames.length === 0) return;
    setSubmitting(true);
    for (const n of parsedNames) {
      let homeRoomId: number | null = null;
      if (homeRoomMode === 'same') {
        homeRoomId = await ensureRoomForClass(n);
      } else if (homeRoomMode === 'custom') {
        homeRoomId = customRoomId;
      }
      await onSubmit({ name: n, yearId, homeRoomId });
    }
    if (homeRoomMode === 'same') await reloadRooms();
    setSubmitting(false);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? tr.classes.edit : tr.classes.addNew}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tr.common.cancel}
          </Button>
          <Button
            onClick={submit}
            disabled={
              submitting ||
              parsedNames.length === 0 ||
              (homeRoomMode === 'custom' && customRoomId == null)
            }
          >
            {parsedNames.length > 1
              ? `${parsedNames.length} sınıf ekle`
              : tr.common.save}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="class-name">
            {editing ? 'Sınıf adı' : 'Sınıf adı (virgülle birden fazla)'}
          </Label>
          <Input
            id="class-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={editing ? '9A' : '9A, 9B, 9C, 9D, 9E'}
            autoFocus
          />
          {!editing && (
            <p className="mt-1 text-xs text-ink-500">
              💡 Virgülle ayırarak aynı düzeye birden fazla sınıf hızla
              ekleyebilirsin. Örnek: <code>10A, 10B, 10C</code>
            </p>
          )}
          {!editing && parsedNames.length > 1 && (
            <p className="mt-2 text-xs text-primary-700">
              Eklenecek: {parsedNames.map((n) => `"${n}"`).join(', ')}
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="class-year">{tr.classes.year}</Label>
          <Select
            id="class-year"
            value={yearId ?? ''}
            onChange={(e) =>
              setYearId(e.target.value === '' ? null : Number(e.target.value))
            }
          >
            <option value="">{tr.classes.ungrouped}</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Sabit Derslik</Label>
          <div className="space-y-2">
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-surface-200 p-2 hover:bg-surface-50">
              <input
                type="radio"
                name="home-room-mode"
                checked={homeRoomMode === 'none'}
                onChange={() => setHomeRoomMode('none')}
                className="mt-0.5"
              />
              <div className="text-sm">
                <p className="font-medium text-ink-900">Yok / her ders ayrı derslikte</p>
                <p className="text-xs text-ink-500">
                  AI veya FET her dersin odasını ayrı ayrı atar.
                </p>
                <p className="mt-1 text-xs text-ink-400">
                  FET, her dersi en uygun derslikte denkleştirir: derslerinde
                  derslik tercihi varsa onu kullanır (örn: Fizik → Lab1),
                  yoksa sınıf çakışmaması ve kapasite uygunluğuna bakarak
                  otomatik atar. Sen kısıtlama olarak "Fizik Lab1'de olsun"
                  yazarsan bunu da dikkate alır.
                </p>
              </div>
            </label>

            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-primary-200 bg-primary-50/30 p-2 hover:bg-primary-50">
              <input
                type="radio"
                name="home-room-mode"
                checked={homeRoomMode === 'same'}
                onChange={() => setHomeRoomMode('same')}
                className="mt-0.5"
              />
              <div className="text-sm">
                <p className="font-medium text-ink-900">
                  Sınıf adıyla aynı derslik (önerilen)
                </p>
                <p className="text-xs text-ink-500">
                  {parsedNames.length > 1
                    ? `${parsedNames.map((n) => `"${n}" → "${n}" dersliği`).join(', ')}. Yoksa otomatik yaratılır.`
                    : parsedNames[0]
                      ? `"${parsedNames[0]}" sınıfı → "${parsedNames[0]}" dersliği. Yoksa otomatik yaratılır.`
                      : 'Sınıf adıyla aynı isimde bir derslik kullanılır. Yoksa otomatik yaratılır.'}
                </p>
              </div>
            </label>

            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-surface-200 p-2 hover:bg-surface-50">
              <input
                type="radio"
                name="home-room-mode"
                checked={homeRoomMode === 'custom'}
                onChange={() => setHomeRoomMode('custom')}
                disabled={rooms.length === 0}
                className="mt-0.5"
              />
              <div className="flex-1 text-sm">
                <p className="font-medium text-ink-900">
                  Farklı bir derslik seç
                </p>
                {homeRoomMode === 'custom' && (
                  <Select
                    className="mt-2"
                    value={customRoomId ?? ''}
                    onChange={(e) =>
                      setCustomRoomId(
                        e.target.value === '' ? null : Number(e.target.value),
                      )
                    }
                  >
                    <option value="">Seçiniz...</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                )}
                {rooms.length === 0 && (
                  <p className="mt-1 text-xs text-ink-400">
                    Henüz derslik yok — önce "Derslikler" ekranından ekle.
                  </p>
                )}
              </div>
            </label>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
