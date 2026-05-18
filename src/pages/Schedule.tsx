import { useEffect, useMemo, useState } from 'react';
import { Calendar, Save, Plus, Minus, Timer } from 'lucide-react';
import { tr } from '../lib/i18n';
import { useScheduleStore } from '../store/schedule';
import { useToastStore } from '../store/toast';
import { Button } from '../components/ui/Button';
import { Input, Label } from '../components/ui/Input';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import type { Day } from '../lib/types';

const DAY_DEFS = [
  { id: 'mon', name: tr.days.mon, short: tr.days.short[0]! },
  { id: 'tue', name: tr.days.tue, short: tr.days.short[1]! },
  { id: 'wed', name: tr.days.wed, short: tr.days.short[2]! },
  { id: 'thu', name: tr.days.thu, short: tr.days.short[3]! },
  { id: 'fri', name: tr.days.fri, short: tr.days.short[4]! },
  { id: 'sat', name: tr.days.sat, short: tr.days.short[5]! },
  { id: 'sun', name: tr.days.sun, short: tr.days.short[6]! },
];

const DEFAULT_SELECTED = new Set(['mon', 'tue', 'wed', 'thu', 'fri']);

type HourRow = {
  name: string;
  startTime: string;
  endTime: string;
};

function buildDefaultHours(count: number, existing: HourRow[] = []): HourRow[] {
  const next: HourRow[] = [];
  for (let i = 0; i < count; i++) {
    next.push(
      existing[i] ?? {
        name: `${i + 1}. ${tr.schedule.hourLabel}`,
        startTime: '',
        endTime: '',
      },
    );
  }
  return next;
}

export default function Schedule() {
  const {
    days,
    hours,
    dayHours,
    load,
    saveDays,
    saveHours,
    saveDayHours,
    clearDayHours,
    bulkAdjustBreaks,
  } = useScheduleStore();
  const toast = useToastStore();

  const [tab, setTab] = useState<'global' | 'perDay'>('global');
  const [selectedDays, setSelectedDays] = useState<Set<string>>(DEFAULT_SELECTED);
  const [hoursPerDay, setHoursPerDay] = useState(8);
  const [hourRows, setHourRows] = useState<HourRow[]>(() =>
    buildDefaultHours(8),
  );
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [bulkDelta, setBulkDelta] = useState(5);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (initialized) return;
    if (days.length > 0 || hours.length > 0) {
      if (days.length > 0) {
        const ids = days.map((d) => d.name?.toLowerCase()).filter(Boolean);
        const known = DAY_DEFS.map((d) => d.id);
        const matched = ids.filter((i) => known.includes(i as string));
        if (matched.length > 0) setSelectedDays(new Set(matched as string[]));
      }
      if (hours.length > 0) {
        setHoursPerDay(hours.length);
        setHourRows(
          hours.map((h) => ({
            name: h.name ?? '',
            startTime: h.startTime ?? '',
            endTime: h.endTime ?? '',
          })),
        );
      }
      setInitialized(true);
    }
  }, [days, hours, initialized]);

  const orderedSelected = useMemo(
    () => DAY_DEFS.filter((d) => selectedDays.has(d.id)),
    [selectedDays],
  );

  // Hangi günlerde özel saat tanımlı?
  const customizedDayIds = useMemo(() => {
    const s = new Set<number>();
    for (const dh of dayHours) s.add(dh.dayId);
    return s;
  }, [dayHours]);

  const dayHoursByDay = useMemo(() => {
    const m = new Map<number, typeof dayHours>();
    for (const dh of dayHours) {
      const arr = m.get(dh.dayId) ?? [];
      arr.push(dh);
      m.set(dh.dayId, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => a.orderIndex - b.orderIndex);
    }
    return m;
  }, [dayHours]);

  function toggleDay(id: string) {
    setSelectedDays((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function changeHoursPerDay(n: number) {
    const clamped = Math.max(1, Math.min(20, Math.floor(n || 0)));
    setHoursPerDay(clamped);
    setHourRows((cur) => buildDefaultHours(clamped, cur));
  }

  function updateRow(i: number, patch: Partial<HourRow>) {
    setHourRows((cur) => cur.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function handleSave() {
    if (orderedSelected.length === 0) {
      toast.warn('En az bir gün seçilmelidir.');
      return;
    }
    setSaving(true);
    const dayPayload = orderedSelected.map((d, i) => ({
      name: d.id,
      orderIndex: i,
    }));
    const hourPayload = hourRows.map((h, i) => ({
      name: h.name.trim() || `${i + 1}. ${tr.schedule.hourLabel}`,
      orderIndex: i,
      startTime: h.startTime || null,
      endTime: h.endTime || null,
    }));
    const okDays = await saveDays(dayPayload);
    const okHours = await saveHours(hourPayload);
    setSaving(false);
    if (okDays && okHours) toast.success(tr.common.saved);
    else toast.error(tr.common.error);
  }

  async function applyBulkBreaks(scope: 'global' | number) {
    const ok = await bulkAdjustBreaks(
      bulkDelta,
      'break',
      scope === 'global' ? undefined : [scope],
    );
    if (ok) toast.success(tr.common.saved);
    else toast.error(tr.common.error);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-ink-900">
            <Calendar size={22} className="text-primary-500" />
            {tr.schedule.title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-600">
            {tr.schedule.description}
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save size={16} />
          {tr.common.save}
        </Button>
      </header>

      <Card>
        <CardHeader title={tr.schedule.days} />
        <CardBody>
          <div className="grid grid-cols-7 gap-2">
            {DAY_DEFS.map((d) => {
              const checked = selectedDays.has(d.id);
              return (
                <label
                  key={d.id}
                  className={
                    checked
                      ? 'flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-primary-300 bg-primary-50 px-3 py-3 text-sm font-medium text-primary-700'
                      : 'flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-surface-200 bg-white px-3 py-3 text-sm text-ink-700 hover:bg-surface-50'
                  }
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleDay(d.id)}
                    className="size-4 accent-primary-500"
                  />
                  <span className="text-xs uppercase tracking-wide text-ink-600">
                    {d.short}
                  </span>
                  <span>{d.name}</span>
                </label>
              );
            })}
          </div>
        </CardBody>
      </Card>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab('global')}
          className={
            tab === 'global'
              ? 'rounded-lg border border-primary-300 bg-primary-50 px-4 py-2 text-sm font-medium text-primary-700'
              : 'rounded-lg border border-surface-200 bg-white px-4 py-2 text-sm text-ink-700 hover:bg-surface-50'
          }
        >
          {tr.schedule.tabGlobal}
        </button>
        <button
          type="button"
          onClick={() => setTab('perDay')}
          className={
            tab === 'perDay'
              ? 'rounded-lg border border-primary-300 bg-primary-50 px-4 py-2 text-sm font-medium text-primary-700'
              : 'rounded-lg border border-surface-200 bg-white px-4 py-2 text-sm text-ink-700 hover:bg-surface-50'
          }
        >
          {tr.schedule.tabPerDay}
        </button>
      </div>

      {tab === 'global' ? (
        <Card>
          <CardHeader title={tr.schedule.hours} />
          <CardBody className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-48">
                <Label htmlFor="hours-per-day">{tr.schedule.hoursPerDay}</Label>
                <Input
                  id="hours-per-day"
                  type="number"
                  min={1}
                  max={20}
                  value={hoursPerDay}
                  onChange={(e) => changeHoursPerDay(Number(e.target.value))}
                />
              </div>
              <div className="flex items-end gap-2 rounded-lg border border-surface-200 bg-surface-50/60 px-3 py-2">
                <div className="w-32">
                  <Label htmlFor="bulk-delta">
                    {tr.schedule.bulkBreaksMinutes}
                  </Label>
                  <Input
                    id="bulk-delta"
                    type="number"
                    min={-180}
                    max={180}
                    value={bulkDelta}
                    onChange={(e) => setBulkDelta(Number(e.target.value) || 0)}
                  />
                </div>
                <Button
                  variant="secondary"
                  onClick={() => applyBulkBreaks('global')}
                >
                  <Timer size={14} />
                  {tr.schedule.bulkBreaks}
                </Button>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-surface-200">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-600">
                  <tr>
                    <th className="w-20 px-3 py-2">#</th>
                    <th className="px-3 py-2">{tr.common.name}</th>
                    <th className="w-36 px-3 py-2">{tr.schedule.start}</th>
                    <th className="w-36 px-3 py-2">{tr.schedule.end}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-200">
                  {hourRows.map((h, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-ink-600">{i + 1}</td>
                      <td className="px-3 py-2">
                        <Input
                          value={h.name}
                          onChange={(e) =>
                            updateRow(i, { name: e.target.value })
                          }
                          placeholder={`${i + 1}. ${tr.schedule.hourLabel}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="time"
                          value={h.startTime}
                          onChange={(e) =>
                            updateRow(i, { startTime: e.target.value })
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="time"
                          value={h.endTime}
                          onChange={(e) =>
                            updateRow(i, { endTime: e.target.value })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      ) : (
        <PerDayEditor
          days={days}
          customizedDayIds={customizedDayIds}
          globalRows={hourRows}
          dayHoursByDay={dayHoursByDay}
          bulkDelta={bulkDelta}
          onBulkDeltaChange={setBulkDelta}
          onSaveDay={async (dayId, entries) => {
            const ok = await saveDayHours(dayId, entries);
            if (ok) toast.success(tr.common.saved);
            else toast.error(tr.common.error);
          }}
          onRevert={async (dayId) => {
            const ok = await clearDayHours(dayId);
            if (ok) toast.success(tr.common.saved);
            else toast.error(tr.common.error);
          }}
          onApplyBulkToDay={(dayId) => applyBulkBreaks(dayId)}
        />
      )}
    </div>
  );
}

function PerDayEditor({
  days,
  customizedDayIds,
  globalRows,
  dayHoursByDay,
  bulkDelta,
  onBulkDeltaChange,
  onSaveDay,
  onRevert,
  onApplyBulkToDay,
}: {
  days: Day[];
  customizedDayIds: Set<number>;
  globalRows: HourRow[];
  dayHoursByDay: Map<number, { orderIndex: number; name: string | null; startTime: string | null; endTime: string | null }[]>;
  bulkDelta: number;
  onBulkDeltaChange: (n: number) => void;
  onSaveDay: (
    dayId: number,
    entries: { orderIndex: number; name: string | null; startTime: string | null; endTime: string | null }[],
  ) => Promise<void>;
  onRevert: (dayId: number) => Promise<void>;
  onApplyBulkToDay: (dayId: number) => void;
}) {
  // Yerel state: gün → satırlar (custom modunda)
  const [editing, setEditing] = useState<Map<number, HourRow[]>>(new Map());

  const orderedDays = useMemo(
    () => [...days].sort((a, b) => a.orderIndex - b.orderIndex),
    [days],
  );

  function rowsForDay(dayId: number): HourRow[] {
    if (editing.has(dayId)) return editing.get(dayId)!;
    const custom = dayHoursByDay.get(dayId);
    if (custom && custom.length > 0) {
      return custom.map((c) => ({
        name: c.name ?? '',
        startTime: c.startTime ?? '',
        endTime: c.endTime ?? '',
      }));
    }
    return globalRows;
  }

  function patchRow(dayId: number, idx: number, patch: Partial<HourRow>): void {
    setEditing((cur) => {
      const next = new Map(cur);
      const base = cur.get(dayId) ?? rowsForDay(dayId);
      const updated = base.map((r, i) => (i === idx ? { ...r, ...patch } : r));
      next.set(dayId, updated);
      return next;
    });
  }

  function changeRowCount(dayId: number, delta: 1 | -1): void {
    setEditing((cur) => {
      const next = new Map(cur);
      const base = cur.get(dayId) ?? rowsForDay(dayId);
      if (delta === 1) {
        next.set(dayId, [
          ...base,
          {
            name: `${base.length + 1}. ${tr.schedule.hourLabel}`,
            startTime: '',
            endTime: '',
          },
        ]);
      } else if (base.length > 1) {
        next.set(dayId, base.slice(0, -1));
      }
      return next;
    });
  }

  async function commit(dayId: number): Promise<void> {
    const rows = rowsForDay(dayId);
    const entries = rows.map((r, i) => ({
      orderIndex: i,
      name: r.name?.trim() || `${i + 1}. ${tr.schedule.hourLabel}`,
      startTime: r.startTime || null,
      endTime: r.endTime || null,
    }));
    await onSaveDay(dayId, entries);
    setEditing((cur) => {
      const next = new Map(cur);
      next.delete(dayId);
      return next;
    });
  }

  async function revert(dayId: number): Promise<void> {
    await onRevert(dayId);
    setEditing((cur) => {
      const next = new Map(cur);
      next.delete(dayId);
      return next;
    });
  }

  if (orderedDays.length === 0) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-ink-600">
            Önce yukarıdan en az bir gün seçip kaydedin.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title={tr.schedule.tabPerDay} />
      <CardBody className="space-y-6">
        <p className="text-sm text-ink-600">{tr.schedule.perDayDescription}</p>
        {orderedDays.map((d) => {
          const isCustom = customizedDayIds.has(d.id) || editing.has(d.id);
          const rows = rowsForDay(d.id);
          return (
            <div
              key={d.id}
              className="space-y-3 rounded-lg border border-surface-200 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-ink-900">
                    {prettyDayName(d.name)}
                  </h3>
                  {isCustom ? (
                    <p className="text-xs text-amber-700">
                      {tr.schedule.customHoursActive} ({rows.length}{' '}
                      {tr.schedule.hoursShortLabel})
                    </p>
                  ) : (
                    <p className="text-xs text-ink-500">
                      {tr.schedule.useGlobal}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => changeRowCount(d.id, -1)}
                    disabled={rows.length <= 1}
                  >
                    <Minus size={14} />
                    {tr.schedule.removeLastHour}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => changeRowCount(d.id, 1)}
                  >
                    <Plus size={14} />
                    {tr.schedule.addExtraHour}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => onApplyBulkToDay(d.id)}
                  >
                    <Timer size={14} />
                    {bulkDelta >= 0 ? '+' : ''}
                    {bulkDelta} dk
                  </Button>
                  <Button onClick={() => commit(d.id)}>
                    <Save size={14} />
                    {tr.common.save}
                  </Button>
                  {customizedDayIds.has(d.id) && (
                    <Button variant="ghost" onClick={() => revert(d.id)}>
                      {tr.schedule.revertToGlobal}
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex items-end gap-2 rounded-md bg-surface-50 px-3 py-2">
                <div className="w-32">
                  <Label htmlFor={`bulk-${d.id}`}>
                    {tr.schedule.bulkBreaksMinutes}
                  </Label>
                  <Input
                    id={`bulk-${d.id}`}
                    type="number"
                    min={-180}
                    max={180}
                    value={bulkDelta}
                    onChange={(e) =>
                      onBulkDeltaChange(Number(e.target.value) || 0)
                    }
                  />
                </div>
                <span className="pb-2 text-xs text-ink-500">
                  {tr.schedule.bulkBreaksScopeDay}
                </span>
              </div>

              <div className="overflow-hidden rounded-md border border-surface-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-surface-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-600">
                    <tr>
                      <th className="w-16 px-3 py-2">#</th>
                      <th className="px-3 py-2">{tr.common.name}</th>
                      <th className="w-32 px-3 py-2">{tr.schedule.start}</th>
                      <th className="w-32 px-3 py-2">{tr.schedule.end}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-200">
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-ink-600">{i + 1}</td>
                        <td className="px-3 py-2">
                          <Input
                            value={r.name}
                            onChange={(e) =>
                              patchRow(d.id, i, { name: e.target.value })
                            }
                            placeholder={`${i + 1}. ${tr.schedule.hourLabel}`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="time"
                            value={r.startTime}
                            onChange={(e) =>
                              patchRow(d.id, i, { startTime: e.target.value })
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="time"
                            value={r.endTime}
                            onChange={(e) =>
                              patchRow(d.id, i, { endTime: e.target.value })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}

/** "mon"/"fri" → "Pazartesi"/"Cuma" (saveDays storage formatına bakar). */
function prettyDayName(raw: string): string {
  const found = DAY_DEFS.find((d) => d.id === raw);
  return found ? found.name : raw;
}
