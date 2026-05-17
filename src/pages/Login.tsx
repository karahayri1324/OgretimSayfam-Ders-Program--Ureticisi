import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Sparkles,
  Mail,
  Lock,
  User,
  GraduationCap,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAuthStore } from '../store/auth';
import { cn } from '../lib/cn';
import LoginDemo from '../components/LoginDemo';

type Mode = 'login' | 'register';

/**
 * Defter — Giriş & Kayıt ekranı.
 * Sol: marketing/pitch alanı (canlı demo şimdilik statik mock kart).
 * Sağ: form + Misafir Devam Et CTA.
 * Misafir butonu authed=false guest=true setler ve direkt /welcome'a atar.
 */
export default function Login() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const continueAsGuest = useAuthStore((s) => s.continueAsGuest);

  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [school, setSchool] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === 'register') {
        await register(name || 'Kullanıcı', email, password);
      } else {
        await login(email || 'demo@okulum.k12.tr', password);
      }
      navigate('/welcome', { replace: true });
    } finally {
      setBusy(false);
    }
  }

  function handleGuest() {
    continueAsGuest();
    navigate('/welcome', { replace: true });
  }

  return (
    <div className="paper-bg flex h-screen w-screen text-ink">
      {/* SOL — pitch + demo */}
      <div
        className="relative hidden flex-1 flex-col overflow-hidden px-12 py-8 lg:flex"
        style={{
          background:
            'linear-gradient(135deg, rgba(30,63,174,0.04) 0%, transparent 60%)',
        }}
      >
        {/* Logo */}
        <div className="mb-6 flex items-center gap-3">
          <div
            className="grid size-9 place-items-center rounded-xl bg-primary text-white"
            style={{ paddingTop: 2 }}
          >
            <span className="serif-italic text-[22px] leading-none">ö</span>
          </div>
          <div>
            <div className="serif-italic text-[22px] leading-none">
              öğretimsayfam
            </div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted">
              Ders Programı Oluşturucu · v0.1.0
            </div>
          </div>
        </div>

        {/* Headline */}
        <div className="mb-3 max-w-xl">
          <div className="serif text-[42px] leading-[1.02] tracking-tight">
            Bir cümleyle anlat,
            <br />
            <span className="serif-italic text-primary">
              program kendiliğinden kurulsun.
            </span>
          </div>
        </div>
        <div className="mb-6 max-w-md text-sm text-muted">
          AI asistanına ne istediğini Türkçe yaz — sınıfları, öğretmenleri,
          kuralları kendisi çıkartır ve haftalık programı saniyeler içinde
          üretir.
        </div>

        {/* Canlı demo — 3 sahneli birebir port (Teachers → Generate → Timetable) */}
        <LoginDemo />


        {/* Tagline */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-accent-leaf" />
            FET tabanlı optimize edici
          </span>
          <span>·</span>
          <span className="inline-flex items-center gap-1.5">
            <Sparkles size={12} className="text-primary" />
            Yerel AI · gizlilik dostu
          </span>
        </div>
      </div>

      {/* SAĞ — form */}
      <div className="flex w-full flex-shrink-0 flex-col border-l border-line bg-paper px-8 py-10 sm:px-12 lg:w-[460px]">
        <div className="mb-8 flex items-center justify-end gap-2 text-xs text-muted">
          <span className="text-ink-700">TR</span>
          <span className="opacity-40">/</span>
          <span className="opacity-50">EN</span>
        </div>

        {/* Tab toggle */}
        <div className="mb-6 flex rounded-xl border border-line bg-paper2 p-1">
          {(['login', 'register'] as Mode[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setMode(t)}
              className={cn(
                'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                mode === t
                  ? 'bg-card text-ink shadow-soft'
                  : 'text-muted hover:text-ink',
              )}
            >
              {t === 'login' ? 'Giriş Yap' : 'Kayıt Ol'}
            </button>
          ))}
        </div>

        {/* Heading */}
        <div className="serif mb-1 text-[32px] leading-[1.08] tracking-tight">
          {mode === 'login' ? (
            <>
              Tekrar hoş geldin,
              <br />
              <span className="serif-italic text-primary">Müdür Bey.</span>
            </>
          ) : (
            <>
              Hesabını <span className="serif-italic text-primary">aç,</span>
              <br />
              programını kuralım.
            </>
          )}
        </div>
        <div className="mb-5 text-sm text-muted">
          {mode === 'login'
            ? 'Devam etmek için e-posta ve şifrenle giriş yap.'
            : 'Birkaç bilgi yeter — hesabın hemen kullanıma hazır.'}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === 'register' && (
            <>
              <AuthField
                icon={<User size={15} />}
                label="Ad Soyad"
                placeholder="Mehmet Karahan"
                value={name}
                onChange={setName}
              />
              <AuthField
                icon={<GraduationCap size={15} />}
                label="Okul"
                placeholder="Atatürk Anadolu Lisesi"
                value={school}
                onChange={setSchool}
              />
            </>
          )}
          <AuthField
            icon={<Mail size={15} />}
            label="E-posta"
            placeholder="mehmet@okulum.k12.tr"
            type="email"
            value={email}
            onChange={setEmail}
          />
          <AuthField
            icon={<Lock size={15} />}
            label="Şifre"
            placeholder={mode === 'register' ? 'En az 8 karakter' : '••••••••'}
            type={showPass ? 'text' : 'password'}
            value={password}
            onChange={setPassword}
            trailing={
              <button
                type="button"
                onClick={() => setShowPass((p) => !p)}
                className="text-muted hover:text-ink"
                aria-label="Şifreyi göster/gizle"
              >
                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            }
            trailingHint={mode === 'login' ? 'Unuttum' : null}
          />

          {mode === 'login' && (
            <label className="mt-1 flex items-center gap-2 text-[13px] text-mutedDeep">
              <input
                type="checkbox"
                defaultChecked
                className="size-4 accent-primary"
              />
              Bu cihazda oturumumu açık tut
            </label>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-[15px] font-semibold text-white shadow-primary transition-colors hover:bg-primary-600 disabled:opacity-60"
          >
            {busy
              ? 'Bekleyiniz…'
              : mode === 'login'
                ? 'Giriş Yap'
                : 'Hesabı Oluştur'}
            {!busy && <ArrowRight size={15} />}
          </button>

          {/* MİSAFİR DEVAM ET */}
          <div className="my-3 flex items-center gap-3 text-[11px] uppercase tracking-[0.15em] text-muted">
            <span className="h-px flex-1 bg-line" />
            veya
            <span className="h-px flex-1 bg-line" />
          </div>
          <button
            type="button"
            onClick={handleGuest}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-cardBorder bg-card px-4 py-3 text-[14px] font-medium text-ink-700 hover:bg-paper2"
          >
            <Sparkles size={14} className="text-accent-amber" />
            Misafir Devam Et
            <span className="text-muted">·</span>
            <span className="text-xs text-muted">test için</span>
          </button>

          {mode === 'register' && (
            <p className="mt-2 text-center text-[11px] leading-relaxed text-muted">
              Kayıt olarak{' '}
              <span className="border-b border-muted text-ink">
                Kullanım Koşulları
              </span>{' '}
              ve{' '}
              <span className="border-b border-muted text-ink">
                Gizlilik Politikası
              </span>
              'nı kabul edersin.
            </p>
          )}
        </form>

        <div className="flex-1" />

        <div className="mt-6 flex items-center justify-center gap-1.5 text-[13px] text-muted">
          {mode === 'login' ? (
            <>
              Hesabın yok mu?{' '}
              <button
                type="button"
                onClick={() => setMode('register')}
                className="font-semibold text-primary hover:underline"
              >
                Kayıt ol
              </button>
            </>
          ) : (
            <>
              Zaten hesabın var mı?{' '}
              <button
                type="button"
                onClick={() => setMode('login')}
                className="font-semibold text-primary hover:underline"
              >
                Giriş yap
              </button>
            </>
          )}
        </div>
        <div className="mt-4 text-center text-[11px] text-muted">
          <span className="serif-italic">ÖğretimSayfam · est. 2025</span>
        </div>
      </div>
    </div>
  );
}

function AuthField({
  icon,
  label,
  placeholder,
  type = 'text',
  value,
  onChange,
  trailing,
  trailingHint,
}: {
  icon: React.ReactNode;
  label: string;
  placeholder?: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  trailing?: React.ReactNode;
  trailingHint?: string | null;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-[12.5px] font-semibold text-mutedDeep">
          {label}
        </label>
        {trailingHint && (
          <span className="cursor-pointer text-[11.5px] font-semibold text-primary">
            {trailingHint}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2.5 rounded-xl border border-line bg-card px-3 py-2.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-50">
        <span className="text-muted">{icon}</span>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 border-0 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
        />
        {trailing}
      </div>
    </div>
  );
}

