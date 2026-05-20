import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  GraduationCap,
  DoorOpen,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Logo } from '../components/Logo';
import { useSubjectsStore } from '../store/subjects';
import { useClassesStore } from '../store/classes';
import { useRoomsStore } from '../store/rooms';
import { useTeachersStore } from '../store/teachers';
import { useAIChatStore } from '../store/ai-chat';
import { useAuthStore } from '../store/auth';
import { tr } from '../lib/i18n';

type CardStat = {
  to: string;
  label: string;
  count: number;
  icon: LucideIcon;
};

export default function Welcome() {
  const navigate = useNavigate();
  const subjects = useSubjectsStore((s) => s.subjects);
  const loadSubjects = useSubjectsStore((s) => s.load);
  const classes = useClassesStore((s) => s.classes);
  const loadClasses = useClassesStore((s) => s.load);
  const rooms = useRoomsStore((s) => s.rooms);
  const loadRooms = useRoomsStore((s) => s.load);
  const teachers = useTeachersStore((s) => s.teachers);
  const loadTeachers = useTeachersStore((s) => s.load);
  const setPendingPrompt = useAIChatStore((s) => s.setPendingPrompt);
  const requestOpenPanel = useAIChatStore((s) => s.requestOpenPanel);
  const guest = useAuthStore((s) => s.guest);
  const name = useAuthStore((s) => s.name);

  useEffect(() => {
    loadSubjects();
    loadClasses();
    loadRooms();
    loadTeachers();
  }, [loadSubjects, loadClasses, loadRooms, loadTeachers]);

  function handleStart(): void {
    setPendingPrompt(tr.welcome.heroStartPrompt, 'fill');
    requestOpenPanel();
  }

  const cards: CardStat[] = [
    {
      to: '/subjects',
      label: tr.welcome.cards.subjects,
      count: subjects.length,
      icon: BookOpen,
    },
    {
      to: '/classes',
      label: tr.welcome.cards.classes,
      count: classes.length,
      icon: GraduationCap,
    },
    {
      to: '/rooms',
      label: tr.welcome.cards.rooms,
      count: rooms.length,
      icon: DoorOpen,
    },
    {
      to: '/teachers',
      label: tr.welcome.cards.teachers,
      count: teachers.length,
      icon: Users,
    },
  ];

  const completed = cards.filter((c) => c.count > 0).length;
  const total = cards.length;
  const percent = Math.round((completed / total) * 100);
  const greetingName = guest ? 'Misafir' : name || 'Müdür Bey';

  const now = new Date();
  const weekday = now.toLocaleDateString('tr-TR', { weekday: 'long' });
  const dateStr = now.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  // Eğitim yılı: Eylül (ay indeksi 8) ve sonrası yeni öğretim yılını başlatır.
  const acStart = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  const academicYear = `${acStart}–${acStart + 1}`;

  return (
    <div className="mx-auto max-w-3xl space-y-10 py-4">
      {}
      <div className="flex items-center text-xs text-muted">
        <span>
          <span className="serif-italic mr-2 text-ink capitalize">{weekday}</span>
          {dateStr} · {academicYear} Eğitim Yılı
        </span>
      </div>

      {}
      <header>
        <h1 className="serif text-[44px] leading-[1.02] tracking-tight">
          Hoş geldin,
          <br />
          <span className="serif-italic text-primary">{greetingName}.</span>
        </h1>
        <p className="mt-3 max-w-xl text-[15px] text-muted">
          Yeni dönem için ders programı kurmaya hazırız. AI ile konuşarak
          başlayabilir ya da elle veri girebilirsin.
        </p>
      </header>

      {}
      <section
        className="card-defter relative p-7"
        aria-labelledby="welcome-hero-title"
      >
        <span className="tape" />
        <div className="flex items-start gap-5">
          <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-card shadow-primary ring-1 ring-line">
            <Logo size={44} />
          </div>
          <div className="flex-1">
            <h2
              id="welcome-hero-title"
              className="serif text-[24px] leading-tight"
            >
              AI ile konuş,{' '}
              <span className="serif-italic">programını kursun.</span>
            </h2>
            <p className="mt-1 max-w-xl text-sm text-muted">
              Sağdaki panele Türkçe yaz; AI öğretmen ekler, sınıf yaratır,
              kısıtlamaları okur, programı oluşturur.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {[
                '"Lise 9–12, haftada 35 saat"',
                '"Beden eğitimi son derste"',
                '"Matematik sabah saatlerinde"',
              ].map((p) => (
                <span
                  key={p}
                  className="serif-italic rounded-full border border-line bg-paper2 px-3 py-1 text-xs text-ink"
                >
                  {p}
                </span>
              ))}
            </div>

            <div className="mt-5 flex items-center gap-4">
              <button
                type="button"
                onClick={handleStart}
                className="group inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-primary transition-colors hover:bg-primary-600"
              >
                {tr.welcome.heroCta}
                <ArrowRight
                  size={16}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </button>
              <span className="text-xs text-muted">
                veya{' '}
                <span className="cursor-pointer border-b border-muted text-ink">
                  wizard'la adım adım gir
                </span>
              </span>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="welcome-manual-heading" className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-line" aria-hidden />
          <h3
            id="welcome-manual-heading"
            className="text-xs font-semibold uppercase tracking-[0.12em] text-muted"
          >
            {tr.welcome.manualHeading}
          </h3>
          <span className="h-px flex-1 bg-line" aria-hidden />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cards.map((c) => {
            const filled = c.count > 0;
            return (
              <button
                key={c.to}
                type="button"
                onClick={() => navigate(c.to)}
                className={
                  'group flex flex-col items-start gap-2 rounded-xl border bg-card p-4 text-left transition-all hover:shadow-soft focus:outline-none focus:ring-2 focus:ring-primary-50 ' +
                  (filled
                    ? 'border-primary/30 hover:border-primary/50'
                    : 'border-cardBorder hover:border-primary/30')
                }
                aria-label={`${c.label} (${c.count})`}
              >
                <div
                  className={
                    'flex size-9 items-center justify-center rounded-lg ' +
                    (filled
                      ? 'bg-primary-soft text-primary'
                      : 'bg-paper2 text-muted')
                  }
                >
                  <c.icon size={18} />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="serif text-[26px] leading-none tabular-nums text-ink">
                    {c.count}
                  </span>
                </div>
                <span className="text-xs font-medium text-ink-700">
                  {c.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="rounded-xl border border-cardBorder bg-card px-4 py-3">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              <strong className="text-ink">{completed}</strong> / {total}{' '}
              {tr.welcome.progressLabel}
            </span>
            <span className="tabular-nums text-muted">%{percent}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper2">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
