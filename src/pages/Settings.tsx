import { useEffect, useState } from 'react';
import {
  Settings as SettingsIcon,
  FileText,
  ExternalLink,
  Save,
  Info,
} from 'lucide-react';
import { tr } from '../lib/i18n';
import { useSettingsStore } from '../store/settings';
import { useToastStore } from '../store/toast';
import { Button } from '../components/ui/Button';
import { Input, Label } from '../components/ui/Input';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { applyTheme } from '../lib/theme';

export default function Settings() {
  const { settings, load, update } = useSettingsStore();
  const toast = useToastStore();

  const [aiMode, setAiMode] = useState<'local' | 'server'>('local');
  const [localEndpoint, setLocalEndpoint] = useState('http://localhost:8000');
  const [serverEndpoint, setServerEndpoint] = useState('');
  const [aiTimeout, setAiTimeout] = useState(30);
  const [fetTimeLimit, setFetTimeLimit] = useState(120);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setAiMode(settings.aiMode === 'server' ? 'server' : 'local');
    setLocalEndpoint(settings.aiLocalEndpoint || 'http://localhost:8000');
    setServerEndpoint(settings.aiServerEndpoint || '');
    setAiTimeout(settings.aiTimeoutSec);
    setFetTimeLimit(settings.fetTimeLimitSec);
  }, [settings]);

  async function handleSave() {
    setSaving(true);
    const ok = await update({
      aiMode,
      aiLocalEndpoint: localEndpoint.trim() || 'http://localhost:8000',
      aiServerEndpoint: serverEndpoint.trim(),
      aiTimeoutSec: Math.max(1, Math.floor(aiTimeout)),
      fetTimeLimitSec: Math.max(10, Math.floor(fetTimeLimit)),
    });
    setSaving(false);
    if (ok) toast.success(tr.common.saved);
    else toast.error(tr.common.error);
  }

  async function changeTheme(t: 'light' | 'dark') {
    applyTheme(t); // anında geri bildirim
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
        <CardHeader title="AI" description="AI parse uç noktası ve zaman aşımı" />
        <CardBody className="space-y-4">
          <div>
            <Label>{tr.settings.aiSource}</Label>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => setAiMode('local')}
                aria-pressed={aiMode === 'local'}
                className={
                  aiMode === 'local'
                    ? 'rounded-lg border border-primary-300 bg-primary-50 px-4 py-2 text-sm font-medium text-primary-700'
                    : 'rounded-lg border border-surface-200 bg-surface-50 px-4 py-2 text-sm text-ink-600 hover:bg-surface-100'
                }
              >
                {tr.settings.aiLocal}
              </button>
              <button
                type="button"
                onClick={() => setAiMode('server')}
                aria-pressed={aiMode === 'server'}
                className={
                  aiMode === 'server'
                    ? 'rounded-lg border border-primary-300 bg-primary-50 px-4 py-2 text-sm font-medium text-primary-700'
                    : 'rounded-lg border border-surface-200 bg-surface-50 px-4 py-2 text-sm text-ink-600 hover:bg-surface-100'
                }
              >
                {tr.settings.aiServer}
              </button>
            </div>
          </div>
          {aiMode === 'local' ? (
            <div>
              <Label htmlFor="ai-local">{tr.settings.aiLocalEndpoint}</Label>
              <Input
                id="ai-local"
                value={localEndpoint}
                onChange={(e) => setLocalEndpoint(e.target.value)}
                placeholder="http://localhost:8000"
              />
              <p className="mt-1 text-xs text-ink-500">{tr.settings.aiLocalHint}</p>
            </div>
          ) : (
            <div>
              <Label>{tr.settings.aiServerEndpoint}</Label>
              <p className="mt-1 text-xs text-ink-500">{tr.settings.aiServerHint}</p>
            </div>
          )}
          <div className="w-48">
            <Label htmlFor="ai-timeout">{tr.settings.aiTimeout}</Label>
            <Input
              id="ai-timeout"
              type="number"
              min={1}
              value={aiTimeout}
              onChange={(e) => setAiTimeout(Number(e.target.value))}
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
              onChange={(e) => setFetTimeLimit(Number(e.target.value))}
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
