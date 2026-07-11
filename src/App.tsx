import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import Login from './pages/Login';
import Welcome from './pages/Welcome';
import Schedule from './pages/Schedule';
import Subjects from './pages/Subjects';
import Teachers from './pages/Teachers';
import Classes from './pages/Classes';
import Rooms from './pages/Rooms';
import Activities from './pages/Activities';
import Constraints from './pages/Constraints';
import Generate from './pages/Generate';
import Timetable from './pages/Timetable';
import Settings from './pages/Settings';
import Advanced from './pages/Advanced';
import { useAuthStore } from './store/auth';
import { useSettingsStore } from './store/settings';
import { applyTheme } from './lib/theme';

export default function App() {
  const authed = useAuthStore((s) => s.authed);
  const ready = useAuthStore((s) => s.ready);
  const initAuth = useAuthStore((s) => s.init);
  const theme = useSettingsStore((s) => s.settings.theme);
  const loadSettings = useSettingsStore((s) => s.load);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  if (!ready) {
    return <div className="h-screen w-screen bg-paper" />;
  }

  if (!authed) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/welcome" replace />} />
      <Route path="/" element={<AppShell />}>
        <Route index element={<Navigate to="/welcome" replace />} />
        <Route path="welcome" element={<Welcome />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="subjects" element={<Subjects />} />
        <Route path="teachers" element={<Teachers />} />
        <Route path="classes" element={<Classes />} />
        <Route path="rooms" element={<Rooms />} />
        <Route path="activities" element={<Activities />} />
        <Route path="constraints" element={<Constraints />} />
        <Route path="generate" element={<Generate />} />
        <Route path="timetable" element={<Timetable />} />
        <Route path="advanced" element={<Advanced />} />
        <Route path="settings" element={<Settings />} />
        {/* Catch-all: bilinmeyen rota (örn. AI'ın ürettiği geçersiz sayfa) boş ekran
            bırakmasın — welcome'a düş (savunma derinliği; navigate_to zaten whitelist'li). */}
        <Route path="*" element={<Navigate to="/welcome" replace />} />
      </Route>
    </Routes>
  );
}
