import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wand2, X, AlertCircle, CalendarCheck2, Sparkles } from 'lucide-react';
import { tr } from '../lib/i18n';
import { useGenerateStore } from '../store/generate';
import { useSettingsStore } from '../store/settings';
import { useActivitiesStore } from '../store/activities';
import { useTeachersStore } from '../store/teachers';
import { useClassesStore } from '../store/classes';
import { useToastStore } from '../store/toast';
import { useAIChatStore } from '../store/ai-chat';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Label } from '../components/ui/Input';

export default function Generate() {
  const { status, progress, logs, error, result, run, cancel, loadLatest, reset } =
    useGenerateStore();
  const settings = useSettingsStore((s) => s.settings);
  const loadSettings = useSettingsStore((s) => s.load);
  const activities = useActivitiesStore((s) => s.activities);
  const loadActivities = useActivitiesStore((s) => s.load);
  const teachers = useTeachersStore((s) => s.teachers);
  const loadTeachers = useTeachersStore((s) => s.load);
  const classes = useClassesStore((s) => s.classes);
  const loadClasses = useClassesStore((s) => s.load);
  const toast = useToastStore();
  const [timeLimit, setTimeLimit] = useState(120);
  const [timeLimitTouched, setTimeLimitTouched] = useState(false);
  const logRef = useRef<HTMLTextAreaElement>(null);
  const announced = useRef<'success' | 'error' | null>(null);

  useEffect(() => {
    loadLatest();
    loadSettings();
    loadActivities();
    loadTeachers();
    loadClasses();
  }, [loadLatest, loadSettings, loadActivities, loadTeachers, loadClasses]);

  useEffect(() => {
    if (!timeLimitTouched && Number.isFinite(settings.fetTimeLimitSec)) {
      setTimeLimit(settings.fetTimeLimitSec);
    }
  }, [settings.fetTimeLimitSec, timeLimitTouched]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    if (status === 'success' && announced.current !== 'success') {
      toast.success(tr.generate.success);
      announced.current = 'success';
    } else if (status === 'error' && announced.current !== 'error') {
      toast.error(tr.generate.failed, error ?? undefined);
      announced.current = 'error';
    } else if (status === 'idle' || status === 'running') {
      announced.current = null;
    }
  }, [status, error, toast]);

  const running = status === 'running';

  const missingPrereqs: string[] = [];
  if (teachers.length === 0) missingPrereqs.push('Öğretmen tanımlı değil');
  if (classes.length === 0) missingPrereqs.push('Sınıf tanımlı değil');
  if (activities.length === 0)
    missingPrereqs.push('Ders ataması (Activities) tanımlı değil');

  function handleRun(): void {
    if (missingPrereqs.length > 0) {
      toast.warn('Önce eksik verileri ekleyin', missingPrereqs.join(' · '));
      return;
    }
    run(timeLimit);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink-900">
          <Wand2 size={22} className="text-primary-500" />
          {tr.generate.title}
        </h1>
        <p className="mt-1 text-sm text-ink-600">{tr.generate.description}</p>
      </header>

      <Card>
        <CardHeader title={tr.generate.run} />
        <CardBody className="space-y-5">
          <div>
            <Label htmlFor="time-limit">
              {tr.generate.timeLimit}: {timeLimit}s
            </Label>
            <input
              id="time-limit"
              type="range"
              min={30}
              max={600}
              step={10}
              value={timeLimit}
              onChange={(e) => {
                setTimeLimit(Number(e.target.value));
                setTimeLimitTouched(true);
              }}
              disabled={running}
              className="w-full accent-primary-500"
            />
            <div className="mt-1 flex justify-between text-xs text-ink-500">
              <span>30s</span>
              <span>300s</span>
              <span>600s</span>
            </div>
          </div>

          <p className="text-xs text-ink-500">{tr.generate.hint}</p>

          {!running && missingPrereqs.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">Eksik veri:</p>
              <ul className="mt-1 list-disc pl-5 text-xs">
                {missingPrereqs.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
              <p className="mt-1 text-xs">
                Önce yukarıdaki ekranlardan veri ekleyin, sonra tekrar deneyin.
              </p>
            </div>
          )}

          <div className="flex items-center gap-2">
            {!running ? (
              <Button
                size="lg"
                onClick={handleRun}
                disabled={missingPrereqs.length > 0}
              >
                <Wand2 size={18} />
                {tr.generate.run}
              </Button>
            ) : (
              <Button size="lg" variant="danger" onClick={cancel}>
                <X size={18} />
                {tr.generate.cancel}
              </Button>
            )}
            {(status === 'success' || status === 'error' || status === 'cancelled') && (
              <Button variant="ghost" onClick={reset}>
                Sıfırla
              </Button>
            )}
          </div>

          {(running || logs.length > 0) && (
            <div className="space-y-3">
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-ink-600">
                  <span>{running ? tr.generate.inProgress : 'Durum'}</span>
                  <span className="tabular-nums">{Math.round(progress)}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-200">
                  <div
                    className="h-full bg-primary-500 transition-all"
                    style={{ width: `${Math.min(100, progress)}%` }}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="gen-log">{tr.generate.log}</Label>
                <textarea
                  ref={logRef}
                  id="gen-log"
                  readOnly
                  value={logs.join('\n')}
                  className="h-64 w-full resize-none rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 font-mono text-xs text-ink-700"
                />
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {status === 'success' && result && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardBody>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 font-semibold text-emerald-900">
                  <CalendarCheck2 size={18} />
                  {tr.generate.success}
                </h3>
                <p className="mt-1 text-sm text-emerald-800">
                  {result.slots.length} slot, {result.durationMs}ms.
                  {result.conflicts.length > 0 &&
                    ` ${result.conflicts.length} olası çakışma.`}
                </p>
              </div>
              <Link to="/timetable">
                <Button>{tr.generate.viewResult}</Button>
              </Link>
            </div>
          </CardBody>
        </Card>
      )}

      {status === 'error' && error && (
        <Card className="border-red-200 bg-red-50">
          <CardBody>
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 text-red-500" size={20} />
              <div className="flex-1">
                <h3 className="font-semibold text-red-900">
                  {tr.generate.failed}
                </h3>
                <p className="mt-1 text-sm text-red-800">{error}</p>
                <p className="mt-2 text-xs text-red-700">
                  Öneri: Kısıtlamaları gözden geçirin. Çok katı (önem 100) kısıtlamalar
                  çözümü engelliyor olabilir; bazılarını esnek (50–80) hale getirip
                  yeniden deneyin.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const chat = useAIChatStore.getState();
                    chat.setPendingPrompt(
                      'Programı üretemedik. Hangi kısıtlamaları gevşetebiliriz? Öneri ver.',
                      'send',
                    );
                    chat.requestOpenPanel();
                  }}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-600"
                >
                  <Sparkles size={13} />
                  AI'dan çözüm önerisi iste
                </button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
