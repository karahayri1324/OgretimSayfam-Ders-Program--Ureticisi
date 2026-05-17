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
import { Switch } from '../components/ui/Switch';
import { Card, CardBody, CardHeader } from '../components/ui/Card';

const MOCK = 'mock://local';

export default function Settings() {
  const { settings, load, update } = useSettingsStore();
  const toast = useToastStore();

  const [endpoint, setEndpoint] = useState('');
  const [mock, setMock] = useState(true);
  const [aiTimeout, setAiTimeout] = useState(30);
  const [fetTimeLimit, setFetTimeLimit] = useState(120);
  const [version, setVersion] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
    window.api.app.version().then((res) => {
      if (res.ok) {
        const v = res.data as { version?: string } | string;
        setVersion(typeof v === 'string' ? v : (v.version ?? ''));
      }
    });
  }, [load]);

  useEffect(() => {
    const isMock = !settings.aiEndpoint || settings.aiEndpoint === MOCK;
    setMock(isMock);
    setEndpoint(isMock ? '' : settings.aiEndpoint);
    setAiTimeout(settings.aiTimeoutSec);
    setFetTimeLimit(settings.fetTimeLimitSec);
  }, [settings]);

  async function handleSave() {
    setSaving(true);
    const ok = await update({
      aiEndpoint: mock ? MOCK : endpoint.trim() || MOCK,
      aiTimeoutSec: Math.max(1, Math.floor(aiTimeout)),
      fetTimeLimitSec: Math.max(10, Math.floor(fetTimeLimit)),
    });
    setSaving(false);
    if (ok) toast.success(tr.common.saved);
    else toast.error(tr.common.error);
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
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ink-900">
                {tr.settings.useMock}
              </p>
              <p className="text-xs text-ink-500">
                Mock kullanılırsa istekler uygulama içinde yanıtlanır.
              </p>
            </div>
            <Switch
              checked={mock}
              onChange={setMock}
              ariaLabel={tr.settings.useMock}
            />
          </div>
          <div>
            <Label htmlFor="ai-endpoint">{tr.settings.aiEndpoint}</Label>
            <Input
              id="ai-endpoint"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="http://localhost:8000/parse"
              disabled={mock}
            />
            <p className="mt-1 text-xs text-ink-500">
              {tr.settings.aiEndpointHint}
            </p>
          </div>
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
              className="rounded-lg border border-primary-300 bg-primary-50 px-4 py-2 text-sm font-medium text-primary-700"
              aria-pressed="true"
            >
              {tr.settings.themeLight}
            </button>
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-lg border border-surface-200 bg-surface-50 px-4 py-2 text-sm text-ink-400"
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
          <p className="pt-2 text-xs text-ink-500">
            {tr.settings.version}: {version || '—'}
          </p>
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
