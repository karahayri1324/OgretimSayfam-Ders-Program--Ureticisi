
import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mail,
  Lock,
  User,
  GraduationCap,
  Eye,
  EyeOff,
  ArrowRight,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '../store/auth';
import { Logo } from '../components/Logo';
import LoginDemo from '../components/LoginDemo';

const defter = {
  bg: '#FAF6EC',
  paper: '#FFFDF8',
  paper2: '#F4EFE2',
  ink: '#1A1A1A',
  mutedDeep: '#3F3A33',
  muted: '#6B6258',
  line: '#E6DFCE',
  line2: '#D9D1BC',
  primary: '#1E3FAE',
  primaryInk: '#FFFFFF',
  primarySoft: '#E7ECFA',
  leaf: '#5C7A4A',
  amber: '#D89B2A',
  red: '#C0392B',
} as const;

const fontSerif = '"Instrument Serif", "Newsreader", ui-serif, Georgia, serif';
const fontSans = '"Instrument Sans", "Geist", ui-sans-serif, system-ui, sans-serif';

type Mode = 'login' | 'register';

export default function Login() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const continueAsGuest = useAuthStore((s) => s.continueAsGuest);

  const [mode, setMode] = useState<Mode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    const fd = new FormData(e.currentTarget);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(
          String(fd.get('email') ?? 'demo@okulum.k12.tr'),
          String(fd.get('password') ?? ''),
        );
      } else {
        await register(
          String(fd.get('name') ?? 'Kullanıcı'),
          String(fd.get('email') ?? ''),
          String(fd.get('password') ?? ''),
        );
      }
      navigate('/welcome', { replace: true });
    } finally {
      setSubmitting(false);
    }
  }

  function handleGuest() {
    continueAsGuest();
    navigate('/welcome', { replace: true });
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        height: '100vh',
        background: defter.bg,
        color: defter.ink,
        fontFamily: fontSans,
        fontSize: 14,
        display: 'flex',
        overflow: 'hidden',
        backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent 31px, ${defter.line} 31px, ${defter.line}88 32px)`,
      }}
    >
      <div
        style={{
          flex: 1,
          padding: '32px 28px 32px 44px',
          background: `linear-gradient(135deg, ${defter.primary}06 0%, transparent 60%)`,
          minWidth: 0,
          minHeight: 0,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <Logo size={40} />
          <div>
            <div
              style={{
                fontFamily: fontSerif,
                fontSize: 22,
                lineHeight: 1,
                fontStyle: 'italic',
                letterSpacing: 0.2,
              }}
            >
              ÖğretimSayfam
            </div>
            <div
              style={{
                fontSize: 11,
                color: defter.muted,
                letterSpacing: 1.5,
                fontWeight: 600,
                marginTop: 4,
              }}
            >
              DERS PROGRAMI OLUŞTURUCU
            </div>
          </div>
        </div>

        <div
          style={{
            fontFamily: fontSerif,
            fontSize: 38,
            lineHeight: 1.02,
            letterSpacing: -0.8,
            fontWeight: 400,
            marginBottom: 6,
            maxWidth: 580,
          }}
        >
          Bir cümleyle anlat,
          <br />
          <span style={{ fontStyle: 'italic', color: defter.primary }}>
            program kendiliğinden kurulsun.
          </span>
        </div>
        <div style={{ fontSize: 13.5, color: defter.muted, marginBottom: 16, maxWidth: 520 }}>
          AI asistanına ne istediğini Türkçe yaz, sınıfları, öğretmenleri, kuralları kendisi
          çıkartır ve haftalık programı saniyeler içinde üretir.
        </div>

        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: 'max(50%, calc(290px + min(820px, calc(100vh - 320px)) / 2))',
            transform: 'translate(-50%, -50%)',
            width: 'min(92%, 1500px)',
            height: 'min(820px, calc(100vh - 320px))',
            background: defter.paper,
            border: `1px solid ${defter.line}`,
            borderRadius: 14,
            overflow: 'hidden',
            boxShadow:
              '0 24px 60px -20px rgba(30,63,174,0.25), 0 1px 0 rgba(0,0,0,0.02)',
            display: 'flex',
          }}
        >
          <LoginDemo />
        </div>
      </div>

      <div
        style={{
          width: 460,
          flexShrink: 0,
          background: defter.bg,
          borderLeft: `1px solid ${defter.line}`,
          padding: '48px 44px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 8,
            fontSize: 12.5,
            color: defter.muted,
            marginBottom: 36,
          }}
        >
          <span>TR</span>
          <span style={{ opacity: 0.4 }}>/</span>
          <span style={{ opacity: 0.5 }}>EN</span>
        </div>

        <div
          role="tablist"
          aria-label="Giriş veya Kayıt"
          style={{
            display: 'flex',
            background: defter.paper2,
            borderRadius: 12,
            padding: 4,
            marginBottom: 28,
            border: `1px solid ${defter.line}`,
          }}
        >
          {(['login', 'register'] as const).map((m) => {
            const active = mode === m;
            return (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMode(m)}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: 9,
                  border: 'none',
                  background: active ? defter.paper : 'transparent',
                  color: active ? defter.ink : defter.muted,
                  fontWeight: active ? 600 : 500,
                  fontSize: 14,
                  cursor: 'pointer',
                  fontFamily: fontSans,
                  boxShadow: active
                    ? '0 1px 0 rgba(0,0,0,0.02), 0 2px 6px -2px rgba(30,63,174,0.15)'
                    : 'none',
                  transition: 'all 0.15s',
                }}
              >
                {m === 'login' ? 'Giriş Yap' : 'Kayıt Ol'}
              </button>
            );
          })}
        </div>

        <h1
          style={{
            fontFamily: fontSerif,
            fontSize: 36,
            lineHeight: 1.05,
            letterSpacing: -0.6,
            margin: 0,
            marginBottom: 6,
            fontWeight: 400,
          }}
        >
          {mode === 'login' ? (
            <>
              Tekrar hoş geldin,
              <br />
              <span style={{ fontStyle: 'italic', color: defter.primary }}>Müdür Bey.</span>
            </>
          ) : (
            <>
              Hesabını <span style={{ fontStyle: 'italic', color: defter.primary }}>aç,</span>
              <br />
              programını kuralım.
            </>
          )}
        </h1>
        <p style={{ color: defter.muted, fontSize: 14, marginBottom: 24, marginTop: 6 }}>
          {mode === 'login'
            ? 'Devam etmek için e-posta ve şifrenizle giriş yapın.'
            : 'Birkaç bilgi yeter — hesabınız hemen kullanıma hazır olur.'}
        </p>

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          {mode === 'register' && (
            <>
              <Field name="name" label="Ad Soyad" placeholder="Mehmet Karahan" icon={User} required />
              <Field
                name="school"
                label="Okul"
                placeholder="Atatürk Anadolu Lisesi"
                icon={GraduationCap}
                required
              />
            </>
          )}
          <Field
            name="email"
            label="E-posta"
            type="email"
            placeholder="mehmet@okulum.k12.tr"
            icon={Mail}
            required
            autoComplete="email"
          />
          <Field
            name="password"
            label="Şifre"
            type={showPassword ? 'text' : 'password'}
            placeholder={mode === 'register' ? 'En az 8 karakter' : '••••••••••'}
            icon={Lock}
            required
            minLength={mode === 'register' ? 8 : undefined}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            rightAdornment={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  color: defter.muted,
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            }
          />

          {mode === 'login' && (
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 2,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                name="remember"
                defaultChecked
                style={{
                  width: 16,
                  height: 16,
                  accentColor: defter.primary,
                  cursor: 'pointer',
                }}
              />
              <span style={{ fontSize: 13, color: defter.mutedDeep }}>
                Bu cihazda oturumumu açık tut
              </span>
            </label>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              marginTop: 12,
              padding: '13px 18px',
              borderRadius: 12,
              border: 'none',
              background: defter.primary,
              color: defter.primaryInk,
              fontWeight: 600,
              fontSize: 15,
              fontFamily: fontSans,
              cursor: submitting ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: `0 8px 20px -10px ${defter.primary}99`,
              opacity: submitting ? 0.8 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {submitting
              ? 'Bekleyin…'
              : mode === 'login'
                ? 'Giriş Yap'
                : 'Hesabı Oluştur'}
            {!submitting && <ArrowRight size={14} />}
          </button>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              margin: '14px 0 4px',
              fontSize: 11,
              letterSpacing: 1.5,
              color: defter.muted,
              textTransform: 'uppercase',
            }}
          >
            <span style={{ flex: 1, height: 1, background: defter.line }} />
            <span>veya</span>
            <span style={{ flex: 1, height: 1, background: defter.line }} />
          </div>
          <button
            type="button"
            onClick={handleGuest}
            style={{
              padding: '12px 18px',
              borderRadius: 12,
              border: `1px solid ${defter.line2}`,
              background: defter.paper,
              color: defter.ink,
              fontWeight: 500,
              fontSize: 14,
              fontFamily: fontSans,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Sparkles size={13} color={defter.amber} />
            Misafir Devam Et
          </button>

          {mode === 'register' && (
            <p
              style={{
                fontSize: 11.5,
                color: defter.muted,
                textAlign: 'center',
                marginTop: 4,
                lineHeight: 1.5,
              }}
            >
              Kayıt olarak{' '}
              <span style={{ color: defter.ink, borderBottom: `1px solid ${defter.muted}` }}>
                Kullanım Koşulları
              </span>{' '}
              ve{' '}
              <span style={{ color: defter.ink, borderBottom: `1px solid ${defter.muted}` }}>
                Gizlilik Politikası
              </span>
              'nı kabul edersiniz.
            </p>
          )}
        </form>

        <div style={{ flex: 1 }} />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12.5,
            color: defter.muted,
            gap: 6,
            marginTop: 24,
          }}
        >
          {mode === 'login' ? (
            <>
              Hesabın yok mu?{' '}
              <button
                type="button"
                onClick={() => setMode('register')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  color: defter.primary,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: fontSans,
                  fontSize: 12.5,
                }}
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
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  color: defter.primary,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: fontSans,
                  fontSize: 12.5,
                }}
              >
                Giriş yap
              </button>
            </>
          )}
        </div>
        <div
          style={{
            textAlign: 'center',
            marginTop: 22,
            fontSize: 11,
            color: defter.muted,
            fontFamily: fontSerif,
            fontStyle: 'italic',
          }}
        >
          ÖğretimSayfam · est. 2025
        </div>
      </div>
    </div>
  );
}

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'children'> {
  label: string;
  icon: LucideIcon;
  trailingHint?: ReactNode;
  rightAdornment?: ReactNode;
}

function Field({ label, icon: Icon, trailingHint, rightAdornment, ...inputProps }: FieldProps) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        <label
          htmlFor={inputProps.id ?? inputProps.name}
          style={{ fontSize: 12.5, fontWeight: 600, color: defter.mutedDeep }}
        >
          {label}
        </label>
        {trailingHint}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: defter.paper,
          border: `1px solid ${defter.line2}`,
          borderRadius: 10,
          padding: '11px 13px',
        }}
      >
        <Icon size={15} color={defter.muted} />
        <input
          id={inputProps.id ?? inputProps.name}
          {...inputProps}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: 14,
            color: defter.ink,
            fontFamily: fontSans,
            minWidth: 0,
          }}
        />
        {rightAdornment}
      </div>
    </div>
  );
}
