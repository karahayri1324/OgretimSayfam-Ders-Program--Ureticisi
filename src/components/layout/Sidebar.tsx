import { NavLink, useNavigate } from 'react-router-dom';
import {
  Home,
  BookOpen,
  GraduationCap,
  DoorOpen,
  Users,
  ListChecks,
  Wand2,
  CalendarCheck2,
  Sliders,
  Settings as SettingsIcon,
  LogOut,
} from 'lucide-react';
import { tr } from '../../lib/i18n';
import { cn } from '../../lib/cn';
import { useAuthStore } from '../../store/auth';
import { Logo } from '../Logo';

const primaryItems = [
  { to: '/welcome', label: tr.nav.welcome, icon: Home },
  { to: '/subjects', label: tr.nav.subjects, icon: BookOpen },
  { to: '/classes', label: tr.nav.classes, icon: GraduationCap },
  { to: '/rooms', label: tr.nav.rooms, icon: DoorOpen },
  { to: '/teachers', label: tr.nav.teachers, icon: Users },
  { to: '/activities', label: tr.nav.activities, icon: ListChecks },
  { to: '/generate', label: tr.nav.generate, icon: Wand2 },
  { to: '/timetable', label: tr.nav.timetable, icon: CalendarCheck2 },
];

const secondaryItems = [
  { to: '/advanced', label: 'Gelişmiş', icon: Sliders },
  { to: '/settings', label: tr.nav.settings, icon: SettingsIcon },
];

function navClass(isActive: boolean) {
  return cn(
    'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap',
    isActive
      ? 'bg-primary-soft text-primary border border-primary/20'
      : 'border border-transparent text-ink-700 hover:bg-paper2 hover:text-ink',
  );
}

export default function Sidebar() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const guest = useAuthStore((s) => s.guest);
  const email = useAuthStore((s) => s.email);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <nav className="flex items-center gap-1 border-b border-line bg-paper px-4 py-2 shadow-soft overflow-x-auto">
      <div className="mr-3 flex items-center gap-2 pr-2">
        <Logo size={26} />
        <span className="serif-italic hidden text-base text-ink md:inline">
          ÖğretimSayfam
        </span>
      </div>

      {primaryItems.map(({ to, label, icon: Icon }, i) => (
        <div key={to} className="flex items-center gap-1">
          {i > 0 && i < primaryItems.length - 2 && (
            <span className="text-muted">›</span>
          )}
          <NavLink to={to} className={({ isActive }) => navClass(isActive)}>
            <Icon size={16} />
            {label}
          </NavLink>
        </div>
      ))}
      <div className="ml-auto flex items-center gap-1">
        {secondaryItems.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => navClass(isActive)}>
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
        <div className="ml-2 flex items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-1 text-xs text-muted">
          <span
            className="inline-block size-1.5 rounded-full"
            style={{ background: guest ? '#D89B2A' : '#5C7A4A' }}
          />
          <span className="text-ink-700">
            {guest ? 'Misafir' : email || 'Kullanıcı'}
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="ml-1 text-muted hover:text-ink"
            aria-label="Çıkış"
            title="Çıkış"
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </nav>
  );
}
