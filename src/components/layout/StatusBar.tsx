import { useEffect, useState } from 'react';
import { tr } from '../../lib/i18n';
import { cn } from '../../lib/cn';

export default function StatusBar() {
  const [fetOk, setFetOk] = useState(true);
  const [aiMode, setAiMode] = useState<'mock' | 'remote' | 'off'>('mock');
  const [version, setVersion] = useState('');

  useEffect(() => {
    window.api.app.version().then((res) => {
      if (res.ok) {
        const v = res.data as { version?: string } | string;
        setVersion(typeof v === 'string' ? v : (v.version ?? ''));
      }
    });
    window.api.app.checkFet().then((res) => {
      if (res.ok) {
        const data = res.data as { available?: boolean };
        setFetOk(Boolean(data.available));
      } else {
        setFetOk(false);
      }
    });
    window.api.settings.get().then((res) => {
      if (res.ok) {
        const settings = res.data as Record<string, string>;
        const endpoint = settings.aiEndpoint;
        if (!endpoint || endpoint === 'mock://local') setAiMode('mock');
        else setAiMode('remote');
      }
    });
  }, []);

  return (
    <footer className="flex items-center justify-between border-t border-line bg-paper2 px-4 py-1.5 text-xs text-muted">
      <div className="flex items-center gap-4">
        <Dot ok={fetOk} label={fetOk ? tr.status.fetReady : tr.status.fetMissing} />
        <Dot
          ok={aiMode !== 'off'}
          label={
            aiMode === 'mock'
              ? tr.status.aiMock
              : aiMode === 'remote'
                ? tr.status.aiConnected
                : tr.status.aiDisconnected
          }
        />
      </div>
      <div className="flex items-center gap-4">
        <span>
          <span className="serif-italic text-ink-700">{tr.app.company}</span>
          {' · '}
          {tr.app.name}
          {version ? ` v${version}` : ''}
        </span>
      </div>
    </footer>
  );
}

function Dot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={cn(
          'size-2 rounded-full',
          ok ? 'bg-accent-leaf' : 'bg-accent-red',
        )}
      />
      <span>{label}</span>
    </span>
  );
}
