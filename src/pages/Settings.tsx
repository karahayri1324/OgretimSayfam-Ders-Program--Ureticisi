import { useEffect, useState } from 'react';
import {
  Settings as SettingsIcon,
  FileText,
  ExternalLink,
  Save,
  Info,
  User,
  LogOut,
} from 'lucide-react';
import { tr } from '../lib/i18n';
import { useSettingsStore } from '../store/settings';
import { useToastStore } from '../store/toast';
import { useAuthStore } from '../store/auth';
import { Button } from '../components/ui/Button';
import { Input, Label } from '../components/ui/Input';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { applyTheme } from '../lib/theme';

export default function Settings() {
  const { settings, load, update } = useSettingsStore();
  const toast = useToastStore();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [aiTimeout, setAiTimeout] = useState(30);
  const [fetTimeLimit, setFetTimeLimit] = useState(120);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // Kullanıcı düzenlediyse (dirty), settings'in değişmesi (ör. tema güncellemesi yeni nesne
    // referansı üretir) kaydedilmemiş timeout düzenlemelerini EZMESİN (#25).
    if (dirty) return;
    setAiTimeout(settings.aiTimeoutSec);
    setFetTimeLimit(settings.fetTimeLimitSec);
  }, [settings, dirty]);

  async function handleSave() {
    setSaving(true);
    const ok = await update({
      aiTimeoutSec: Math.max(1, Math.floor(aiTimeout)),
      fetTimeLimitSec: Math.max(10, Math.floor(fetTimeLimit)),
    });
    setSaving(false);
    if (ok) {
      setDirty(false);
      toast.success(tr.common.saved);
    } else toast.error(tr.common.error);
  }

  async function changeTheme(t: 'light' | 'dark') {
    applyTheme(t);
    await update({ theme: t });
  }

  async function openFETSource() {
    await window.api.app.openFETSource();
  }

  async function openLogs() {
    await window.api.app.openLogs();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink-900">
          <SettingsIcon size={22} className="text-primary-500" />
          {tr.settings.title}
        </h1>
      </header>

      <Card>
        <CardHeader title={tr.settings.account} />
        <CardBody className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-primary-50 text-primary-600">
              <User size={18} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink-900">
                {user?.name || user?.email || '—'}
              </p>
              <p className="truncate text-xs text-ink-500">{user?.email ?? ''}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              variant="secondary"
              onClick={() =>
                window.open('https://timetables.ogretimsayfam.com', '_blank')
              }
            >
              <ExternalLink size={14} />
              {tr.settings.manageSubscription}
            </Button>
            <Button variant="secondary" onClick={() => logout()}>
              <LogOut size={14} />
              {tr.settings.logout}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="AI" description={tr.settings.aiDescription} />
        <CardBody className="space-y-4">
          <div className="w-48">
            <Label htmlFor="ai-timeout">{tr.settings.aiTimeout}</Label>
            <Input
              id="ai-timeout"
              type="number"
              min={1}
              value={aiTimeout}
              onChange={(e) => {
                setAiTimeout(Number(e.target.value));
                setDirty(true);
              }}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="FET" description="Program üretim motoru ayarları" />
        <CardBody>
          <div className="w-48">
            <Label htmlFor="fet-time">{tr.settings.fetTimeLimit}</Label>
            <Input
              id="fet-time"
              type="number"
              min={10}
              value={fetTimeLimit}
              onChange={(e) => {
                setFetTimeLimit(Number(e.target.value));
                setDirty(true);
              }}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={tr.settings.theme} />
        <CardBody>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => changeTheme('light')}
              aria-pressed={settings.theme === 'light'}
              className={
                settings.theme === 'light'
                  ? 'rounded-lg border border-primary-300 bg-primary-50 px-4 py-2 text-sm font-medium text-primary-700'
                  : 'rounded-lg border border-surface-200 bg-surface-50 px-4 py-2 text-sm text-ink-600 hover:bg-surface-100'
              }
            >
              {tr.settings.themeLight}
            </button>
            <button
              type="button"
              onClick={() => changeTheme('dark')}
              aria-pressed={settings.theme === 'dark'}
              className={
                settings.theme === 'dark'
                  ? 'rounded-lg border border-primary-300 bg-primary-50 px-4 py-2 text-sm font-medium text-primary-700'
                  : 'rounded-lg border border-surface-200 bg-surface-50 px-4 py-2 text-sm text-ink-600 hover:bg-surface-100'
              }
            >
              {tr.settings.themeDark}
            </button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={tr.settings.about} />
        <CardBody className="space-y-3 text-sm text-ink-700">
          <p className="flex items-start gap-2">
            <Info size={16} className="mt-0.5 shrink-0 text-primary-500" />
            <span>{tr.settings.fetAttribution}</span>
          </p>
          <p className="text-xs text-ink-500">
            FET, AGPLv3 lisansı altında dağıtılan açık kaynak bir programdır.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="secondary" onClick={openFETSource}>
              <ExternalLink size={14} />
              {tr.settings.openFETSource}
            </Button>
            <Button variant="secondary" onClick={openLogs}>
              <FileText size={14} />
              {tr.settings.openLogs}
            </Button>
          </div>
        </CardBody>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          <Save size={16} />
          {tr.common.save}
        </Button>
      </div>
    </div>
  );
}
