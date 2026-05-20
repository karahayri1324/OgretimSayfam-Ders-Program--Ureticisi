import { Link } from 'react-router-dom';
import { Calendar, ShieldAlert, Sliders } from 'lucide-react';

const items = [
  {
    to: '/schedule',
    label: 'Gün / Saat Planı',
    desc: 'Hafta günleri ve günlük ders saat sayısı. Varsayılan: Pzt–Cum, 8 ders. Çoğu okula yeter.',
    icon: Calendar,
  },
  {
    to: '/constraints',
    label: 'Kısıtlamalar Listesi',
    desc: 'AI panelinden eklenen tüm kısıtlamalar burada listelenir, ağırlık ayarlanır, silinir.',
    icon: ShieldAlert,
  },
];

export default function Advanced() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <header className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-surface-100">
          <Sliders className="text-ink-700" size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-ink-900">Gelişmiş Ayarlar</h1>
          <p className="text-sm text-ink-600">
            Çoğunu sağdaki AI ile yapabilirsin. Tablo halinde toplu düzenleme
            yapmak istersen bunları aç.
          </p>
        </div>
      </header>

      <div className="grid gap-3">
        {items.map(({ to, label, desc, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex items-start gap-4 rounded-xl border border-surface-200 bg-card p-4 transition-all hover:border-primary-300 hover:shadow-soft"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-50">
              <Icon size={18} className="text-primary-500" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-ink-900">{label}</p>
              <p className="mt-0.5 text-sm text-ink-600">{desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
