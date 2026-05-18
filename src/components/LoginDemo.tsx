
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Sparkles,
  Home,
  BookOpen,
  GraduationCap,
  DoorOpen,
  Users,
  ListChecks,
  Wand2,
  CalendarCheck2,
  Plus,
  Pencil,
  Trash2,
  Check,
  ArrowRight,
  Sliders,
  Settings as Cog,
} from 'lucide-react';
import { Logo } from './Logo';

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
const fontMono = 'ui-monospace, "JetBrains Mono", "Geist Mono", monospace';

const TICK_MS = 80;

const ANIM = {
  s1_typeStart: 5,
  s1_send: 58,
  s1_think: 62,
  s1_replyStart: 68,
  s1_tool1: 82,
  s1_tool2: 96,
  s1_row: 104,

  s2_switch: 125,
  s2_typeStart: 130,
  s2_send: 170,
  s2_think: 174,
  s2_reply: 180,
  s2_genStart: 186,
  s2_genEnd: 220,
  s2_success: 222,

  s3_switch: 235,
  s3_reply: 240,
  s3_fillStart: 248,
  s3_fillEnd: 328,

  loop: 360,
} as const;

const USER_MSG_1 =
  "Ahmet Yılmaz matematik öğretmeni. 9A, 9B, 9C'ye 6'şar saat giriyor.";
const USER_MSG_2 = 'Şimdi programı üret. Beden eğitimi son derste olsun.';
const AI_MSG_1 =
  "Tamam. Ahmet Yılmaz'ı ekledim ve 9A/9B/9C'ye 6'şar saat Matematik atadım.";
const AI_MSG_2 = 'Kuralı ekledim ve üretimi başlatıyorum…';
const AI_MSG_3 =
  'Tamamlandı. 455 slot, 0 çakışma — Beden eğitimi her gün son derste.';

type Scene = 1 | 2 | 3;
interface DerivedState {
  scene: Scene;
  cursor: boolean;
  s1: {
    typed: number;
    sent: boolean;
    thinking: boolean;
    replyChars: number;
    tool1: boolean;
    tool2: boolean;
    row: boolean;
  };
  s2: {
    typed: number;
    sent: boolean;
    thinking: boolean;
    replyChars: number;
    progress: number;
    success: boolean;
  };
  s3: { fill: number; replyChars: number };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function derive(tick: number): DerivedState {
  let scene: Scene = 1;
  if (tick >= ANIM.s2_switch) scene = 2;
  if (tick >= ANIM.s3_switch) scene = 3;
  const cursor = Math.floor(tick / 4) % 2 === 0;

  return {
    scene,
    cursor,
    s1: {
      typed: clamp(Math.floor((tick - ANIM.s1_typeStart) * 1.3), 0, USER_MSG_1.length),
      sent: tick >= ANIM.s1_send,
      thinking: tick >= ANIM.s1_think && tick < ANIM.s1_replyStart,
      replyChars: clamp(Math.floor((tick - ANIM.s1_replyStart) * 1.8), 0, AI_MSG_1.length),
      tool1: tick >= ANIM.s1_tool1,
      tool2: tick >= ANIM.s1_tool2,
      row: tick >= ANIM.s1_row,
    },
    s2: {
      typed: clamp(Math.floor((tick - ANIM.s2_typeStart) * 1.5), 0, USER_MSG_2.length),
      sent: tick >= ANIM.s2_send,
      thinking: tick >= ANIM.s2_think && tick < ANIM.s2_reply,
      replyChars: clamp(Math.floor((tick - ANIM.s2_reply) * 2), 0, AI_MSG_2.length),
      progress:
        tick < ANIM.s2_genStart
          ? 0
          : tick >= ANIM.s2_genEnd
            ? 100
            : ((tick - ANIM.s2_genStart) / (ANIM.s2_genEnd - ANIM.s2_genStart)) * 100,
      success: tick >= ANIM.s2_success,
    },
    s3: {
      fill:
        tick < ANIM.s3_fillStart
          ? 0
          : tick >= ANIM.s3_fillEnd
            ? 1
            : (tick - ANIM.s3_fillStart) / (ANIM.s3_fillEnd - ANIM.s3_fillStart),
      replyChars: clamp(Math.floor((tick - ANIM.s3_reply) * 1.8), 0, AI_MSG_3.length),
    },
  };
}

export default function LoginDemo() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(
      () => setTick((t) => (t + 1) % ANIM.loop),
      TICK_MS,
    );
    return () => window.clearInterval(id);
  }, []);

  const st = derive(tick);

  let page: ReactNode;
  if (st.scene === 1) {
    page = <MockTeachers showAhmet={st.s1.row} />;
  } else if (st.scene === 2) {
    page = (
      <MockGenerate
        running={st.s2.progress > 0 && st.s2.progress < 100}
        progress={st.s2.progress}
        done={st.s2.success}
      />
    );
  } else {
    page = <MockTimetable fillProgress={st.s3.fill} />;
  }

  const PAGE_W = 1440;
  const PAGE_H = 880;

  const leftRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.46);

  useEffect(() => {
    const el = leftRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        if (width <= 0 || height <= 0) continue;
        const next = Math.min(width / PAGE_W, height / PAGE_H);
        setScale((prev) => (Math.abs(prev - next) > 0.005 ? next : prev));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <>
      <style>{KEYFRAMES}</style>
      <div style={{ display: 'flex', height: '100%', width: '100%', minHeight: 0 }}>
        {}
        <div
          ref={leftRef}
          style={{
            flex: '1 1 0',
            minWidth: 0,
            overflow: 'hidden',
            position: 'relative',
            borderRight: `1px solid ${defter.line}`,
            background: defter.paper,
          }}
        >
          <div
            key={st.scene}
            style={{
              width: PAGE_W,
              height: PAGE_H,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              position: 'absolute',
              top: 0,
              left: 0,
            }}
          >
            {page}
          </div>
        </div>

        {/* Sağ — AI sohbet paneli */}
        <div style={{ width: 360, flexShrink: 0, display: 'flex', minHeight: 0 }}>
          <DemoChatPanel st={st} />
        </div>
      </div>
    </>
  );
}

function DemoChatPanel({ st }: { st: DerivedState }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        background: defter.paper2,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          borderBottom: `1px solid ${defter.line}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: defter.paper,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Logo size={16} />
          <div style={{ fontWeight: 600, fontSize: 12 }}>AI Asistan</div>
        </div>
        <div style={{ display: 'flex', gap: 6, color: defter.muted, fontSize: 12 }}>
          <span>⇤</span>
          <span>×</span>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        <div
          style={{
            background: defter.paper,
            border: `1px solid ${defter.line}`,
            borderRadius: 10,
            padding: '8px 11px',
            fontSize: 11.5,
            lineHeight: 1.45,
            flexShrink: 0,
          }}
        >
          Merhaba{' '}
          <span style={{ fontFamily: fontSerif, fontStyle: 'italic' }}>Müdür Bey</span>.
          Komutlarını yaz; ben yaparım.
        </div>

        {st.s1.sent && <UserBubble>{USER_MSG_1}</UserBubble>}
        {st.s1.thinking && <Typing />}
        {st.s1.replyChars > 0 && (
          <AiBubble>
            {AI_MSG_1.slice(0, st.s1.replyChars)}
            {st.s1.replyChars < AI_MSG_1.length && (
              <Caret color={defter.ink} visible={st.cursor} />
            )}
          </AiBubble>
        )}
        {st.s1.tool1 && <ToolRow text="Öğretmen eklendi" detail="Ahmet Yılmaz · MAT" />}
        {st.s1.tool2 && (
          <ToolRow text="Ders dağılımı" detail="9A · 9B · 9C → 6 saat MAT" highlight />
        )}

        {st.scene >= 2 && st.s2.sent && <UserBubble>{USER_MSG_2}</UserBubble>}
        {st.scene >= 2 && st.s2.thinking && <Typing />}
        {st.scene >= 2 && st.s2.replyChars > 0 && (
          <AiBubble>
            {AI_MSG_2.slice(0, st.s2.replyChars)}
            {st.s2.replyChars < AI_MSG_2.length && (
              <Caret color={defter.ink} visible={st.cursor} />
            )}
          </AiBubble>
        )}
        {st.s2.success && (
          <ToolRow text="Program üretildi" detail="455 slot · 0 çakışma · 1.2s" highlight />
        )}

        {st.scene >= 3 && st.s3.replyChars > 0 && (
          <AiBubble>
            {AI_MSG_3.slice(0, st.s3.replyChars)}
            {st.s3.replyChars < AI_MSG_3.length && (
              <Caret color={defter.ink} visible={st.cursor} />
            )}
          </AiBubble>
        )}
      </div>

      <div
        style={{
          padding: 10,
          borderTop: `1px solid ${defter.line}`,
          background: defter.paper,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            background: defter.paper,
            border: `1.5px solid ${defter.primary}55`,
            borderRadius: 9,
            padding: '7px 10px',
            position: 'relative',
            boxShadow: `0 0 0 3px ${defter.primary}10`,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: defter.ink,
              lineHeight: 1.4,
              minHeight: 30,
              paddingRight: 26,
            }}
          >
            <ComposerText st={st} />
          </div>
          <div
            style={{
              position: 'absolute',
              right: 5,
              bottom: 5,
              width: 22,
              height: 22,
              borderRadius: 6,
              background: defter.primary,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <ArrowRight size={10} color={defter.primaryInk} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ComposerText({ st }: { st: DerivedState }) {
  if (st.scene === 1) {
    if (!st.s1.sent) {
      return (
        <>
          {USER_MSG_1.slice(0, st.s1.typed)}
          <Caret color={defter.primary} visible={st.cursor || st.s1.typed > 0} />
        </>
      );
    }
    return <Placeholder>asistan yanıt veriyor…</Placeholder>;
  }
  if (st.scene === 2) {
    if (!st.s2.sent) {
      return (
        <>
          {USER_MSG_2.slice(0, st.s2.typed)}
          <Caret color={defter.primary} visible={st.cursor || st.s2.typed > 0} />
        </>
      );
    }
    return <Placeholder>üretim sürüyor…</Placeholder>;
  }
  return <Placeholder>Mesaj yaz…</Placeholder>;
}

function Placeholder({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        color: defter.muted,
        fontFamily: fontSerif,
        fontStyle: 'italic',
        fontSize: 11.5,
      }}
    >
      {children}
    </span>
  );
}

function UserBubble({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        animation: 'demo-slide-up 0.25s ease-out',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          maxWidth: '90%',
          padding: '7px 10px',
          background: defter.primary,
          color: defter.primaryInk,
          borderRadius: '10px 10px 3px 10px',
          fontSize: 11,
          lineHeight: 1.4,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function AiBubble({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: defter.paper,
        border: `1px solid ${defter.line}`,
        borderRadius: '3px 10px 10px 10px',
        padding: '7px 10px',
        fontSize: 11,
        lineHeight: 1.5,
        animation: 'demo-slide-up 0.25s ease-out',
        flexShrink: 0,
        maxWidth: '92%',
      }}
    >
      {children}
    </div>
  );
}

function Typing() {
  return (
    <div style={{ display: 'flex', gap: 3, paddingLeft: 4, flexShrink: 0 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: defter.muted,
            animation: `demo-pulse 0.9s infinite ${i * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}

function ToolRow({
  text,
  detail,
  highlight,
}: {
  text: string;
  detail: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 7,
        padding: '6px 9px',
        background: highlight ? defter.primarySoft : defter.paper,
        border: `1px solid ${highlight ? defter.primary + '55' : defter.line}`,
        borderRadius: 8,
        fontSize: 10.5,
        animation: 'demo-slide-up 0.25s ease-out',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 13,
          height: 13,
          borderRadius: '50%',
          background: highlight ? defter.primary : defter.leaf,
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        <Check size={7} strokeWidth={4} color={defter.primaryInk} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: defter.ink, fontSize: 10.5 }}>{text}</div>
        <div style={{ color: defter.muted, fontSize: 9.5, marginTop: 1 }}>{detail}</div>
      </div>
    </div>
  );
}

function Caret({ color, visible }: { color: string; visible: boolean }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 1.5,
        height: 11,
        background: color,
        marginLeft: 1,
        marginBottom: -2,
        opacity: visible ? 1 : 0,
      }}
    />
  );
}

const NAV: { id: string; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Başlangıç', icon: Home },
  { id: 'subjects', label: 'Dersler', icon: BookOpen },
  { id: 'classes', label: 'Sınıflar', icon: GraduationCap },
  { id: 'rooms', label: 'Derslikler', icon: DoorOpen },
  { id: 'teachers', label: 'Öğretmenler', icon: Users },
  { id: 'activities', label: 'Ders Dağılımı', icon: ListChecks },
  { id: 'generate', label: 'Program Üret', icon: Wand2 },
  { id: 'timetable', label: 'Program', icon: CalendarCheck2 },
];

function MockShell({
  active,
  breadcrumb,
  children,
}: {
  active: string;
  breadcrumb: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: defter.bg,
        color: defter.ink,
        fontFamily: fontSans,
        fontSize: 14,
        display: 'flex',
        flexDirection: 'column',
        backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent 31px, ${defter.line}88 31px, ${defter.line}88 32px)`,
        backgroundPosition: '0 64px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          background: defter.paper,
          borderBottom: `1px solid ${defter.line}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Logo size={28} />
            <div style={{ fontFamily: fontSerif, fontSize: 17, fontStyle: 'italic' }}>
              ÖğretimSayfam
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 8 }}>
            {NAV.map((t) => {
              const Icon = t.icon;
              const isActive = t.id === active;
              return (
                <div
                  key={t.id}
                  style={{
                    padding: '7px 11px',
                    borderRadius: 8,
                    background: isActive ? defter.primarySoft : 'transparent',
                    color: isActive ? defter.primary : defter.ink,
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    border: isActive
                      ? `1px solid ${defter.primary}22`
                      : '1px solid transparent',
                  }}
                >
                  <Icon size={14} color={isActive ? defter.primary : defter.muted} />
                  {t.label}
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <NavGhost icon={Sliders} label="Gelişmiş" />
          <NavGhost icon={Cog} label="Ayarlar" />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '7px 11px',
              border: `1px solid ${defter.line}`,
              borderRadius: 8,
              marginLeft: 6,
              background: defter.paper,
            }}
          >
            <Sparkles size={14} color={defter.primary} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>AI Asistan</span>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: defter.leaf,
                marginLeft: 2,
              }}
            />
          </div>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          padding: '24px 36px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ fontSize: 12, color: defter.muted, marginBottom: 12 }}>{breadcrumb}</div>
        {children}
      </div>
    </div>
  );
}

function NavGhost({ icon: Icon, label }: { icon: typeof Home; label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        padding: '7px 11px',
        fontSize: 13,
        color: defter.ink,
      }}
    >
      <Icon size={14} color={defter.muted} />
      {label}
    </div>
  );
}

function MockTeachers({ showAhmet }: { showAhmet: boolean }) {
  const list = [
    showAhmet
      ? { name: 'Ahmet Yılmaz', subj: 'MAT', hours: 18, note: '9A · 9B · 9C', isNew: true }
      : null,
    { name: 'Fatma Demir', subj: 'TÜR', hours: 24, note: '', isNew: false },
    { name: 'Mehmet Kara', subj: 'FİZ', hours: 16, note: '', isNew: false },
    { name: 'Ayşe Şahin', subj: 'KİM', hours: 20, note: 'Çift branş', isNew: false },
    { name: 'Elif Aydın', subj: 'İNG', hours: 25, note: '', isNew: false },
    { name: 'Hasan Çelik', subj: 'TAR', hours: 22, note: '', isNew: false },
    { name: 'Zeynep Polat', subj: 'BED', hours: 14, note: 'Öğleden sonra', isNew: false },
  ].filter(Boolean) as Array<{
    name: string;
    subj: string;
    hours: number;
    note: string;
    isNew: boolean;
  }>;

  return (
    <MockShell
      active="teachers"
      breadcrumb={
        <>
          Atatürk A.L. · <span style={{ color: defter.ink }}>Öğretmenler</span>
        </>
      }
    >
      <Header
        title="Öğretmenler"
        count={list.length}
        sub="Öğretmenler, verdikleri branşlar ve haftalık ders saati."
        actionLabel="Yeni Öğretmen"
      />

      <Card>
        <TableHead
          cols={[
            { label: 'Öğretmen', flex: 1.4 },
            { label: 'Branşlar', flex: 1.6 },
            { label: 'Haftalık', w: 110 },
            { label: 'Notlar', flex: 1.4 },
            { label: 'İşlemler', w: 140, align: 'right' },
          ]}
        />
        {list.map((t, i) => (
          <div
            key={t.name + i}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px 20px',
              borderTop: `1px solid ${defter.line}`,
              background: t.isNew
                ? defter.primarySoft
                : i % 2 === 0
                  ? 'transparent'
                  : defter.paper2 + '60',
              borderLeft: t.isNew ? `3px solid ${defter.primary}` : '3px solid transparent',
              transition: 'all 0.3s',
            }}
          >
            <div style={{ flex: 1.4, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: defter.amber + '33',
                  color: defter.amber,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {t.name
                  .split(' ')
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join('')}
              </div>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                {t.name}
                {t.isNew && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 10,
                      padding: '2px 6px',
                      borderRadius: 999,
                      background: defter.primary,
                      color: defter.primaryInk,
                      letterSpacing: 1,
                      fontWeight: 700,
                    }}
                  >
                    YENİ
                  </span>
                )}
              </div>
            </div>
            <div style={{ flex: 1.6, display: 'flex', gap: 6 }}>
              <Pill color={defter.primary} bg={defter.primarySoft}>
                {t.subj}
              </Pill>
            </div>
            <div style={{ width: 110, display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontFamily: fontSerif, fontSize: 20, lineHeight: 1 }}>{t.hours}</span>
              <span style={{ fontSize: 11.5, color: defter.muted }}>saat</span>
            </div>
            <div
              style={{
                flex: 1.4,
                fontSize: 12.5,
                color: t.note ? defter.muted : defter.line2,
                fontFamily: t.note ? fontSerif : fontSans,
                fontStyle: t.note ? 'italic' : 'normal',
              }}
            >
              {t.note || '—'}
            </div>
            <div style={{ width: 140, display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
              <SmallGhost icon={<Pencil size={13} color={defter.muted} />} label="Düzenle" />
              <SmallGhost icon={<Trash2 size={13} color={defter.red} />} />
            </div>
          </div>
        ))}
      </Card>
    </MockShell>
  );
}

function MockGenerate({
  running,
  progress,
  done,
}: {
  running: boolean;
  progress: number;
  done: boolean;
}) {
  return (
    <MockShell
      active="generate"
      breadcrumb={
        <>
          Atatürk A.L. · <span style={{ color: defter.ink }}>Program Üret</span>
        </>
      }
    >
      <div style={{ maxWidth: 760 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <Wand2 size={26} color={defter.primary} />
          <div
            style={{
              fontFamily: fontSerif,
              fontSize: 42,
              lineHeight: 1,
              letterSpacing: -0.8,
              fontWeight: 400,
            }}
          >
            Program <span style={{ fontStyle: 'italic', color: defter.primary }}>Üret</span>
          </div>
        </div>
        <div style={{ fontSize: 14, color: defter.muted, marginBottom: 24, maxWidth: 560 }}>
          FET çekirdeği üzerinden tüm sınıflar, öğretmenler ve kurallar için en uygun haftalık
          programı arar.
        </div>

        <Card>
          <div
            style={{
              padding: '14px 20px',
              borderBottom: `1px solid ${defter.line}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 14 }}>Çalıştır</div>
            <div
              style={{
                fontSize: 12,
                color: defter.muted,
                fontFamily: fontSerif,
                fontStyle: 'italic',
              }}
            >
              {done ? 'tamamlandı' : running ? 'çalışıyor…' : 'hazır'}
            </div>
          </div>
          <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginBottom: 6,
                }}
              >
                <label style={{ fontSize: 13, fontWeight: 600, color: defter.mutedDeep }}>
                  Süre limiti
                </label>
                <span style={{ fontFamily: fontSerif, fontSize: 16 }}>
                  120<span style={{ fontSize: 11, color: defter.muted }}>s</span>
                </span>
              </div>
              <Range value={(120 / 600) * 100} />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: 6,
                  fontSize: 11,
                  color: defter.muted,
                }}
              >
                <span>30s</span>
                <span>300s</span>
                <span>600s</span>
              </div>
            </div>

            <div
              style={{
                fontSize: 12.5,
                color: defter.muted,
                fontFamily: fontSerif,
                fontStyle: 'italic',
                paddingLeft: 12,
                borderLeft: `2px solid ${defter.line2}`,
              }}
            >
              FET kombinatoryal arama yapar. Genelde 60–180 saniye yeterlidir.
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                style={{
                  background: running ? defter.muted : defter.primary,
                  color: defter.primaryInk,
                  border: 'none',
                  padding: '12px 22px',
                  borderRadius: 10,
                  fontWeight: 600,
                  fontSize: 14.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontFamily: fontSans,
                }}
              >
                <Wand2 size={16} color={defter.primaryInk} />
                {running ? 'Çalışıyor…' : 'Programı Üret'}
              </button>
              {!running && !done && (
                <div style={{ fontSize: 12.5, color: defter.muted }}>
                  Önkoşullar:{' '}
                  <span style={{ color: defter.leaf, fontWeight: 600 }}>✓ tamam</span>
                </div>
              )}
            </div>

            {(running || done) && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 6,
                    fontSize: 12,
                    color: defter.muted,
                  }}
                >
                  <span>{done ? 'Tamamlandı' : 'İlerleme'}</span>
                  <span style={{ fontFamily: fontSerif, fontSize: 14, color: defter.ink }}>
                    {Math.round(progress)}%
                  </span>
                </div>
                <div
                  style={{
                    height: 8,
                    background: defter.paper2,
                    borderRadius: 999,
                    border: `1px solid ${defter.line}`,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${progress}%`,
                      height: '100%',
                      background: done ? defter.leaf : defter.primary,
                      borderRadius: 999,
                      transition: 'width 0.3s',
                    }}
                  />
                </div>
              </div>
            )}
          </div>
          {done && (
            <div
              style={{
                padding: '14px 20px',
                borderTop: `1px solid ${defter.line}`,
                background: defter.leaf + '15',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: defter.leaf,
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <Check size={13} color="#fff" strokeWidth={3} />
                </span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Program üretildi</div>
                  <div style={{ fontSize: 12, color: defter.muted }}>
                    455 slot · 0 çakışma · 1.2 saniye
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </MockShell>
  );
}

function MockTimetable({ fillProgress }: { fillProgress: number }) {
  const days = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum'];
  const hours = [
    { n: 1, time: '08:30' },
    { n: 2, time: '09:20' },
    { n: 3, time: '10:10' },
    { n: 4, time: '11:00' },
    { n: 5, time: '12:40' },
    { n: 6, time: '13:30' },
    { n: 7, time: '14:20' },
    { n: 8, time: '15:10' },
  ];
  const grid: string[][] = [
    ['MAT', 'TÜR', 'TAR', 'FİZ', 'KİM', 'İNG', 'BİY', 'BED'],
    ['MAT', 'TÜR', 'COĞ', 'FİZ', 'KİM', 'İNG', 'TAR', 'BED'],
    ['TÜR', 'MAT', 'TAR', 'BİY', 'COĞ', 'İNG', 'FİZ', 'BED'],
    ['FİZ', 'TÜR', 'MAT', 'KİM', 'TAR', 'İNG', 'BİY', 'BED'],
    ['MAT', 'KİM', 'TÜR', 'FİZ', 'COĞ', 'İNG', 'TAR', 'BED'],
  ];
  const colors: Record<string, { bg: string; fg: string }> = {
    MAT: { bg: '#E7ECFA', fg: '#1E3FAE' },
    TÜR: { bg: '#FBEAE6', fg: '#C0392B' },
    FİZ: { bg: '#FAEFD8', fg: '#A57614' },
    KİM: { bg: '#E8F0E0', fg: '#5C7A4A' },
    BİY: { bg: '#DDF0EE', fg: '#1F8C8C' },
    TAR: { bg: '#EEE7FA', fg: '#7C5BD8' },
    COĞ: { bg: '#DDF0EE', fg: '#1F8C8C' },
    İNG: { bg: '#FAE6F0', fg: '#B83A7A' },
    BED: { bg: '#FCE8D8', fg: '#C9621C' },
  };
  const teachers: Record<string, string> = {
    MAT: 'Ahmet Y.',
    TÜR: 'Fatma D.',
    FİZ: 'Mehmet K.',
    KİM: 'Ayşe Ş.',
    BİY: 'Ayşe Ş.',
    TAR: 'Hasan Ç.',
    COĞ: 'Hasan Ç.',
    İNG: 'Elif A.',
    BED: 'Zeynep P.',
  };
  const total = days.length * hours.length;
  const filled = Math.floor(fillProgress * total);

  return (
    <MockShell
      active="timetable"
      breadcrumb={
        <>
          Atatürk A.L. · <span style={{ color: defter.ink }}>Program</span>
        </>
      }
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <CalendarCheck2 size={22} color={defter.primary} />
            <div
              style={{
                fontFamily: fontSerif,
                fontSize: 36,
                lineHeight: 1,
                letterSpacing: -0.5,
              }}
            >
              Program
            </div>
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: defter.muted,
              marginTop: 6,
              fontFamily: fontSerif,
              fontStyle: 'italic',
            }}
          >
            son üretim 14:32 · 455 slot · 0 çakışma · 9-A
          </div>
        </div>
      </div>

      <Card style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `100px repeat(${days.length}, 1fr)`,
            flex: 1,
            minHeight: 0,
          }}
        >
          <div
            style={{
              padding: '10px 12px',
              background: defter.paper2,
              borderRight: `1px solid ${defter.line}`,
              borderBottom: `1px solid ${defter.line}`,
              fontSize: 10,
              letterSpacing: 1.5,
              fontWeight: 700,
              color: defter.muted,
            }}
          >
            SAAT
          </div>
          {days.map((d, i) => (
            <div
              key={d}
              style={{
                padding: '10px 12px',
                background: defter.paper2,
                fontSize: 11,
                fontWeight: 700,
                color: defter.ink,
                borderRight: i < days.length - 1 ? `1px solid ${defter.line}` : 'none',
                borderBottom: `1px solid ${defter.line}`,
                textAlign: 'center',
                letterSpacing: 1.5,
              }}
            >
              {d.toUpperCase()}
            </div>
          ))}
          {hours.map((h, hi) => (
            <Row
              key={hi}
              h={h}
              hi={hi}
              days={days}
              grid={grid}
              colors={colors}
              teachers={teachers}
              filled={filled}
              total={hours.length}
            />
          ))}
        </div>
      </Card>
    </MockShell>
  );
}

function Row({
  h,
  hi,
  days,
  grid,
  colors,
  teachers,
  filled,
  total,
}: {
  h: { n: number; time: string };
  hi: number;
  days: string[];
  grid: string[][];
  colors: Record<string, { bg: string; fg: string }>;
  teachers: Record<string, string>;
  filled: number;
  total: number;
}) {
  return (
    <>
      <div
        style={{
          padding: '6px 12px',
          background: defter.paper,
          borderRight: `1px solid ${defter.line}`,
          borderBottom: hi < total - 1 ? `1px solid ${defter.line}` : 'none',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600 }}>{h.n}. ders</div>
        <div style={{ fontSize: 10, color: defter.muted, fontFamily: fontMono }}>{h.time}</div>
      </div>
      {days.map((_d, di) => {
        const idx = hi * days.length + di;
        const isFilled = idx < filled;
        const code = grid[di]![hi]!;
        const c = colors[code] ?? { bg: defter.paper2, fg: defter.muted };
        return (
          <div
            key={di}
            style={{
              borderRight: di < days.length - 1 ? `1px solid ${defter.line}` : 'none',
              borderBottom: hi < total - 1 ? `1px solid ${defter.line}` : 'none',
            }}
          >
            {isFilled ? (
              <div
                style={{
                  height: '100%',
                  background: c.bg,
                  borderLeft: `3px solid ${c.fg}`,
                  padding: '6px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  transition: 'all 0.2s',
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    color: c.fg,
                    fontSize: 12.5,
                    letterSpacing: 0.3,
                  }}
                >
                  {code}
                </div>
                <div style={{ fontSize: 10.5, color: defter.muted }}>{teachers[code]}</div>
              </div>
            ) : (
              <div style={{ width: '100%', height: '100%', background: defter.paper2 + '40' }} />
            )}
          </div>
        );
      })}
    </>
  );
}

function Header({
  title,
  count,
  sub,
  actionLabel,
}: {
  title: string;
  count?: number;
  sub: string;
  actionLabel?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 18,
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div
            style={{
              fontFamily: fontSerif,
              fontSize: 38,
              lineHeight: 1,
              letterSpacing: -0.6,
              fontWeight: 400,
            }}
          >
            {title}
          </div>
          {count != null && (
            <div
              style={{
                fontFamily: fontSerif,
                fontSize: 24,
                color: defter.muted,
                fontStyle: 'italic',
              }}
            >
              ({count})
            </div>
          )}
        </div>
        <div
          style={{
            fontSize: 13,
            color: defter.muted,
            marginTop: 6,
            maxWidth: 620,
            lineHeight: 1.5,
          }}
        >
          {sub}
        </div>
      </div>
      {actionLabel && (
        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '8px 14px',
            borderRadius: 9,
            border: 'none',
            background: defter.primary,
            color: defter.primaryInk,
            fontWeight: 600,
            fontSize: 13,
            fontFamily: fontSans,
            boxShadow: `0 4px 12px -6px ${defter.primary}99`,
          }}
        >
          <Plus size={14} color={defter.primaryInk} />
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: defter.paper,
        border: `1px solid ${defter.line}`,
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: '0 1px 0 rgba(0,0,0,0.02), 0 6px 18px -10px rgba(30,63,174,0.12)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function TableHead({
  cols,
}: {
  cols: { label: string; flex?: number; w?: number; align?: 'left' | 'right' }[];
}) {
  return (
    <div
      style={{
        display: 'flex',
        padding: '11px 20px',
        background: defter.paper2,
        fontSize: 10.5,
        fontWeight: 700,
        color: defter.muted,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
      }}
    >
      {cols.map((c, i) => (
        <div
          key={i}
          style={{
            flex: c.flex || 'none',
            width: c.w || 'auto',
            textAlign: c.align || 'left',
          }}
        >
          {c.label}
        </div>
      ))}
    </div>
  );
}

function Pill({ children, color, bg }: { children: ReactNode; color: string; bg: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        padding: '3px 9px',
        borderRadius: 999,
        fontWeight: 600,
        background: bg,
        color,
        letterSpacing: 0.5,
      }}
    >
      {children}
    </span>
  );
}

function SmallGhost({ icon, label }: { icon: ReactNode; label?: string }) {
  return (
    <button
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: label ? '7px 11px' : '7px 8px',
        borderRadius: 8,
        border: 'none',
        background: 'transparent',
        color: defter.mutedDeep,
        fontWeight: 500,
        fontSize: 12.5,
        fontFamily: fontSans,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function Range({ value }: { value: number }) {
  return (
    <div
      style={{
        position: 'relative',
        height: 6,
        background: defter.paper2,
        borderRadius: 999,
        border: `1px solid ${defter.line}`,
      }}
    >
      <div
        style={{
          width: `${value}%`,
          height: '100%',
          background: defter.primary,
          borderRadius: 999,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: `${value}%`,
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: defter.primary,
          border: `3px solid ${defter.paper}`,
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }}
      />
    </div>
  );
}

const KEYFRAMES = `
  @keyframes demo-pulse {
    0%, 100% { opacity: 0.35; transform: scale(0.85); }
    50% { opacity: 1; transform: scale(1.1); }
  }
  @keyframes demo-slide-up {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;
