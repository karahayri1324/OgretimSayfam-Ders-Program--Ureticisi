import { tr } from '../../lib/i18n';

export default function StatusBar() {
  return (
    <footer className="flex items-center justify-end border-t border-line bg-paper2 px-4 py-1.5 text-xs text-muted">
      <span>
        <span className="serif-italic text-ink-700">{tr.app.company}</span>
        {' · '}
        {tr.app.name}
      </span>
    </footer>
  );
}
