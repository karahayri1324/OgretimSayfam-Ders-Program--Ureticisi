import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarCheck2,
  FileSpreadsheet,
  FileText,
  FileCode2,
  Printer,
  Wand2,
} from 'lucide-react';
import { tr } from '../lib/i18n';
import { useGenerateStore } from '../store/generate';
import { useScheduleStore } from '../store/schedule';
import { useSubjectsStore } from '../store/subjects';
import { useClassesStore } from '../store/classes';
import { useTeachersStore } from '../store/teachers';
import { useRoomsStore } from '../store/rooms';
import { useToastStore } from '../store/toast';
import { useAIChatStore } from '../store/ai-chat';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Card, CardBody } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import { cn } from '../lib/cn';
import type { TimetableSlot } from '../lib/types';
import {
  buildHtml,
  defaultFilename,
  downloadHtml,
  downloadXlsx,
  type ExportContext,
} from '../lib/timetableExport';

type ViewMode = 'class' | 'teacher' | 'room';

const DAY_LABELS: Record<string, string> = {
  mon: 'Pzt',
  tue: 'Sal',
  wed: 'Çar',
  thu: 'Per',
  fri: 'Cum',
  sat: 'Cmt',
  sun: 'Paz',
};

export default function Timetable() {
  const { result, loadLatest } = useGenerateStore();
  const { days, hours, load: loadSchedule } = useScheduleStore();
  const { subjects, load: loadSubjects } = useSubjectsStore();
  const { classes, load: loadClasses } = useClassesStore();
  const { teachers, load: loadTeachers } = useTeachersStore();
  const { rooms, load: loadRooms } = useRoomsStore();

  const [view, setView] = useState<ViewMode>('class');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [exporting, setExporting] = useState<null | 'pdf' | 'excel' | 'html'>(
    null,
  );
  const toast = useToastStore();

  useEffect(() => {
    loadLatest();
    loadSchedule();
    loadSubjects();
    loadClasses();
    loadTeachers();
    loadRooms();
  }, [loadLatest, loadSchedule, loadSubjects, loadClasses, loadTeachers, loadRooms]);

  const entityList = useMemo(() => {
    if (view === 'class') return classes.map((c) => ({ id: c.id, name: c.name }));
    if (view === 'teacher')
      return teachers.map((t) => ({ id: t.id, name: t.name }));
    return rooms.map((r) => ({ id: r.id, name: r.name }));
  }, [view, classes, teachers, rooms]);

  useEffect(() => {
    if (entityList.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !entityList.find((e) => e.id === selectedId)) {
      setSelectedId(entityList[0]!.id);
    }
  }, [entityList, selectedId]);

  const filteredSlots = useMemo<TimetableSlot[]>(() => {
    if (!result || selectedId == null) return [];
    return result.slots.filter((s) => {
      if (view === 'class') return s.classId === selectedId;
      if (view === 'teacher') return s.teacherId === selectedId;
      return s.roomId === selectedId;
    });
  }, [result, view, selectedId]);

  const subjectColorById = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of subjects) m.set(s.id, s.color ?? '#3b82f6');
    return m;
  }, [subjects]);

  const pendingExport = useAIChatStore((s) => s.pendingExport);
  const consumePendingExport = useAIChatStore((s) => s.consumePendingExport);
  useEffect(() => {
    if (!pendingExport) return;
    if (!result || entityList.length === 0) return;
    if (pendingExport.class) {
      const target = entityList.find(
        (e) => e.name.toLocaleLowerCase('tr') === pendingExport.class!.toLocaleLowerCase('tr'),
      );
      if (target) setSelectedId(target.id);
    }
    consumePendingExport();
    const fmt = pendingExport.format.toLowerCase();
    setTimeout(() => {
      if (fmt === 'pdf') void handleExportPdf();
      else if (fmt === 'excel' || fmt === 'xlsx') void handleExportExcel();
      else if (fmt === 'html') void handleExportHtml();
    }, 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingExport, result, entityList]);

  if (!result) {
    return (
      <EmptyState
        icon={CalendarCheck2}
        title={tr.timetable.empty}
        description="Önce 'Program Üret' ekranından bir program üretmelisiniz."
        action={
          <Link to="/generate">
            <Button>
              <Wand2 size={16} />
              {tr.timetable.emptyAction}
            </Button>
          </Link>
        }
      />
    );
  }

  const slotMap = new Map<string, TimetableSlot>();
  for (const s of filteredSlots) {
    slotMap.set(`${s.dayIndex}_${s.hourIndex}`, s);
  }

  function buildExportContext(): ExportContext | null {
    if (!result || selectedId == null) return null;
    const entity = entityList.find((e) => e.id === selectedId);
    if (!entity) return null;
    return {
      viewMode: view,
      entityName: entity.name,
      generatedAt: new Date(result.generatedAt).toLocaleString('tr-TR'),
      days,
      hours,
      subjects,
      filteredSlots,
    };
  }

  async function handleExportHtml(): Promise<void> {
    const ctx = buildExportContext();
    if (!ctx) return;
    setExporting('html');
    try {
      const html = buildHtml(ctx);
      downloadHtml(html, defaultFilename(ctx.entityName, 'html'));
      toast.success(tr.timetable.exportSuccess, 'HTML');
    } catch (e) {
      toast.error(tr.timetable.exportFailed, String(e));
    } finally {
      setExporting(null);
    }
  }

  async function handleExportExcel(): Promise<void> {
    const ctx = buildExportContext();
    if (!ctx) return;
    setExporting('excel');
    try {
      downloadXlsx(ctx, defaultFilename(ctx.entityName, 'xlsx'));
      toast.success(tr.timetable.exportSuccess, 'Excel');
    } catch (e) {
      toast.error(tr.timetable.exportFailed, String(e));
    } finally {
      setExporting(null);
    }
  }

  async function handleExportPdf(): Promise<void> {
    const ctx = buildExportContext();
    if (!ctx) return;
    setExporting('pdf');
    try {
      const html = buildHtml(ctx);
      const fname = defaultFilename(ctx.entityName, 'pdf');
      const res = await window.api.app.exportPdf(html, fname);
      if (!res.ok) {
        toast.error(tr.timetable.exportFailed, res.error.message);
        return;
      }
      const data = res.data as { cancelled: boolean; filePath: string | null };
      if (data.cancelled) {
        toast.info(tr.timetable.exportCancelled);
      } else {
        toast.success(tr.timetable.exportSuccess, data.filePath ?? 'PDF');
      }
    } catch (e) {
      toast.error(tr.timetable.exportFailed, String(e));
    } finally {
      setExporting(null);
    }
  }

  const exportDisabled = exporting !== null || selectedId == null;

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-ink-900">
            <CalendarCheck2 size={22} className="text-primary-500" />
            {tr.timetable.title}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => window.print()}
            aria-label={tr.timetable.print}
            disabled={exporting !== null}
          >
            <Printer size={16} />
            {tr.timetable.print}
          </Button>
          <Button
            variant="secondary"
            onClick={handleExportPdf}
            aria-label={tr.timetable.exportPdf}
            disabled={exportDisabled}
          >
            {exporting === 'pdf' ? (
              <Spinner size="sm" />
            ) : (
              <FileText size={16} />
            )}
            {tr.timetable.exportPdf}
          </Button>
          <Button
            variant="secondary"
            onClick={handleExportExcel}
            aria-label={tr.timetable.exportExcel}
            disabled={exportDisabled}
          >
            {exporting === 'excel' ? (
              <Spinner size="sm" />
            ) : (
              <FileSpreadsheet size={16} />
            )}
            {tr.timetable.exportExcel}
          </Button>
          <Button
            variant="secondary"
            onClick={handleExportHtml}
            aria-label={tr.timetable.exportHtml}
            disabled={exportDisabled}
          >
            {exporting === 'html' ? (
              <Spinner size="sm" />
            ) : (
              <FileCode2 size={16} />
            )}
            {tr.timetable.exportHtml}
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <div className="inline-flex rounded-lg border border-surface-200 bg-card p-0.5">
          <TabButton active={view === 'class'} onClick={() => setView('class')}>
            {tr.timetable.viewClass}
          </TabButton>
          <TabButton
            active={view === 'teacher'}
            onClick={() => setView('teacher')}
          >
            {tr.timetable.viewTeacher}
          </TabButton>
          <TabButton active={view === 'room'} onClick={() => setView('room')}>
            {tr.timetable.viewRoom}
          </TabButton>
        </div>
        <div className="w-64">
          <Select
            value={selectedId ?? ''}
            onChange={(e) =>
              setSelectedId(e.target.value ? Number(e.target.value) : null)
            }
          >
            {entityList.length === 0 && (
              <option value="">— {tr.common.empty} —</option>
            )}
            {entityList.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Card>
        <CardBody className="overflow-x-auto p-0">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-r border-surface-200 bg-surface-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-600">
                  Saat / Gün
                </th>
                {days.map((d, i) => (
                  <th
                    key={d.id ?? i}
                    className="border-b border-r border-surface-200 bg-surface-50 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-ink-700"
                  >
                    {DAY_LABELS[d.name?.toLowerCase()] ?? d.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hours.map((h, hi) => (
                <tr key={h.id ?? hi}>
                  <th className="border-b border-r border-surface-200 bg-card px-3 py-2 text-left text-xs font-medium text-ink-700">
                    <div className="flex flex-col">
                      <span>{h.name || `${hi + 1}. ${tr.schedule.hourLabel}`}</span>
                      {h.startTime && (
                        <span className="text-[10px] text-ink-400">
                          {h.startTime}
                          {h.endTime ? `–${h.endTime}` : ''}
                        </span>
                      )}
                    </div>
                  </th>
                  {days.map((_d, di) => {
                    const slot = slotMap.get(`${di}_${hi}`);
                    if (!slot) {
                      return (
                        <td
                          key={di}
                          className="border-b border-r border-surface-200 bg-card px-2 py-1.5 text-center text-xs text-ink-300"
                        >
                          —
                        </td>
                      );
                    }
                    const color =
                      slot.subjectId != null
                        ? subjectColorById.get(slot.subjectId)
                        : null;
                    return (
                      <td
                        key={di}
                        className="border-b border-r border-surface-200 p-0"
                      >
                        <div
                          className="flex h-full flex-col gap-0.5 px-2 py-1.5 text-xs"
                          style={{
                            backgroundColor: color
                              ? `${color}1f`
                              : '#eff6ff',
                            borderLeft: `3px solid ${color ?? '#3b82f6'}`,
                          }}
                        >
                          <span className="font-semibold text-ink-900">
                            {slot.subjectName}
                          </span>
                          {view !== 'teacher' && slot.teacherName && (
                            <span className="text-ink-700">
                              {slot.teacherName}
                            </span>
                          )}
                          {view !== 'class' && slot.className && (
                            <span className="text-ink-700">
                              {slot.className}
                            </span>
                          )}
                          {view !== 'room' && slot.roomName && (
                            <span className="text-ink-500">
                              {slot.roomName}
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-primary-50 text-primary-700'
          : 'text-ink-700 hover:bg-surface-100',
      )}
    >
      {children}
    </button>
  );
}
