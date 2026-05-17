/**
 * LoginDemo — Login ekranı sol panelindeki canlı çoklu sahne animasyonu.
 *
 * Tasarım referansı: /mnt/data/Downloads/_retimsayfam-tasar_m.html içindeki
 * DemoFrame + DemoAIPanel — birebir port (TICK_MS, ANIM markers, sahne mantığı,
 * tipografi, renkler).
 *
 * 3 sahne tek döngüde (~29 saniye):
 *   Scene 1 (0–125)   — Öğretmenler: kullanıcı yeni öğretmen ekleme komutu yazıyor,
 *                       AI cevaplıyor, tabloya satır kayarak giriyor
 *   Scene 2 (125–235) — Programı Üret: kuralı ekliyor, üretimi başlatıyor,
 *                       progress bar dolu, log satırları akıyor
 *   Scene 3 (235–360) — Program: 5×8 grid hücre hücre renkli doluyor,
 *                       başarı kartı belirir
 */

import { useEffect, useState } from 'react';

const TICK_MS = 80;

const ANIM = {
  s1_intro: 0,
  s1_type_start: 5,
  s1_send: 58,
  s1_think: 62,
  s1_reply_start: 68,
  s1_tool1: 82,
  s1_tool2: 96,
  s1_row_in: 104,
  s1_hold: 120,

  s2_switch: 125,
  s2_type_start: 130,
  s2_send: 170,
  s2_think: 174,
  s2_reply: 180,
  s2_gen_start: 186,
  s2_gen_end: 220,
  s2_success: 222,
  s2_hold: 230,

  s3_switch: 235,
  s3_reply: 240,
  s3_fill_start: 248,
  s3_fill_end: 328,
  s3_hold: 340,

  loop: 360,
};

const USER_MSG_1 =
  "Ahmet Yılmaz matematik öğretmeni. 9A, 9B, 9C'ye 6'şar saat giriyor.";
const USER_MSG_2 = 'Şimdi programı üret. Beden eğitimi son derste olsun.';

const AI_MSG_1 =
  "Tamam. Ahmet Yılmaz'ı ekledim ve 9A/9B/9C'ye 6'şar saat Matematik atadım.";
const AI_MSG_2 = 'Kuralı ekledim ve üretimi başlatıyorum…';
const AI_MSG_3 =
  'Tamamlandı. 455 slot, 0 çakışma — Beden eğitimi her gün son derste.';

const GEN_LOGS = [
  'FET çekirdek başlatıldı (12 öğretmen · 13 sınıf · 9 ders)',
  'Kısıtlamalar yükleniyor… 7 kural aktif',
  'İlk çözüm aranıyor…',
  'İlk çözüm bulundu (0.4s) · 38 yumuşak ihlal',
  'Optimizasyon turu 1/3 … 12 ihlal',
  'Optimizasyon turu 2/3 …  3 ihlal',
  'Optimizasyon turu 3/3 …  0 ihlal',
  'Tamamlandı: 455 slot · 0 çakışma · 1.2s',
];

// 8 ders rengi — grid hücreleri için
const SUBJECT_COLORS = [
  '#1E3FAE',
  '#5C7A4A',
  '#D89B2A',
  '#7C5BD8',
  '#1F8C8C',
  '#C9621C',
  '#B83A7A',
  '#2090A8',
];

type Scene = 1 | 2 | 3;

function deriveScene(tick: number) {
  let scene: Scene = 1;
  if (tick >= ANIM.s2_switch) scene = 2;
  if (tick >= ANIM.s3_switch) scene = 3;

  const cursor = Math.floor(tick / 4) % 2 === 0;

  const s1_typed = Math.max(
    0,
    Math.min(
      USER_MSG_1.length,
      Math.floor((tick - ANIM.s1_type_start) * 1.3),
    ),
  );
  const s1_sent = tick >= ANIM.s1_send;
  const s1_thinking = tick >= ANIM.s1_think && tick < ANIM.s1_reply_start;
  const s1_reply_chars = Math.max(
    0,
    Math.min(AI_MSG_1.length, Math.floor((tick - ANIM.s1_reply_start) * 1.8)),
  );
  const s1_tool1 = tick >= ANIM.s1_tool1;
  const s1_tool2 = tick >= ANIM.s1_tool2;
  const s1_row = tick >= ANIM.s1_row_in;

  const s2_typed = Math.max(
    0,
    Math.min(USER_MSG_2.length, Math.floor((tick - ANIM.s2_type_start) * 1.5)),
  );
  const s2_sent = tick >= ANIM.s2_send;
  const s2_thinking = tick >= ANIM.s2_think && tick < ANIM.s2_reply;
  const s2_reply_chars = Math.max(
    0,
    Math.min(AI_MSG_2.length, Math.floor((tick - ANIM.s2_reply) * 2)),
  );
  const s2_progress =
    tick < ANIM.s2_gen_start
      ? 0
      : tick >= ANIM.s2_gen_end
        ? 100
        : ((tick - ANIM.s2_gen_start) / (ANIM.s2_gen_end - ANIM.s2_gen_start)) *
          100;
  const s2_log_count =
    tick < ANIM.s2_gen_start
      ? 0
      : Math.min(
          GEN_LOGS.length,
          Math.floor((tick - ANIM.s2_gen_start) / 4.5) + 1,
        );
  const s2_success = tick >= ANIM.s2_success;

  const s3_fill =
    tick < ANIM.s3_fill_start
      ? 0
      : tick >= ANIM.s3_fill_end
        ? 1
        : (tick - ANIM.s3_fill_start) /
          (ANIM.s3_fill_end - ANIM.s3_fill_start);
  const s3_reply_chars = Math.max(
    0,
    Math.min(AI_MSG_3.length, Math.floor((tick - ANIM.s3_reply) * 1.8)),
  );

  return {
    scene,
    cursor,
    s1: {
      typed: s1_typed,
      sent: s1_sent,
      thinking: s1_thinking,
      replyChars: s1_reply_chars,
      tool1: s1_tool1,
      tool2: s1_tool2,
      row: s1_row,
    },
    s2: {
      typed: s2_typed,
      sent: s2_sent,
      thinking: s2_thinking,
      replyChars: s2_reply_chars,
      progress: s2_progress,
      logCount: s2_log_count,
      success: s2_success,
    },
    s3: { fill: s3_fill, replyChars: s3_reply_chars },
  };
}

type DerivedState = ReturnType<typeof deriveScene>;

export default function LoginDemo() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(
      () => setTick((t) => (t + 1) % ANIM.loop),
      TICK_MS,
    );
    return () => window.clearInterval(id);
  }, []);

  const st = deriveScene(tick);

  return (
    <div className="card-defter relative flex h-full flex-1 overflow-hidden">
      <span className="tape" />
      <div className="flex w-[52%] flex-shrink-0 border-r border-line bg-paper">
        {st.scene === 1 && <ScenePageTeachers row={st.s1.row} />}
        {st.scene === 2 && (
          <ScenePageGenerate
            progress={st.s2.progress}
            logCount={st.s2.logCount}
            done={st.s2.success}
          />
        )}
        {st.scene === 3 && <ScenePageTimetable fill={st.s3.fill} />}
      </div>
      <div className="flex flex-1 flex-col bg-paper2">
        <DemoAIPanel st={st} tick={tick} />
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
 * Mini pages — gerçek defter sayfalarının kompakt görsel temsili
 * ──────────────────────────────────────────────────────────────── */

function ScenePageTeachers({ row }: { row: boolean }) {
  const staticTeachers = [
    { name: 'Selim Erdoğan', subj: 'MAT', hours: 24 },
    { name: 'Nazan Kara', subj: 'FİZ', hours: 18 },
    { name: 'Burak Demir', subj: 'TÜR', hours: 20 },
    { name: 'Cem Toprak', subj: 'KİM', hours: 16 },
    { name: 'Elif Yıldız', subj: 'İNG', hours: 22 },
  ];

  return (
    <div className="flex w-full flex-col">
      <MiniTopBar active="Öğretmenler" />
      <div className="flex-1 overflow-hidden px-4 py-3">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="serif text-[15px] text-ink">
            Öğretmenler{' '}
            <span className="text-muted">({staticTeachers.length + (row ? 1 : 0)})</span>
          </h3>
          <span className="rounded bg-primary px-2 py-0.5 text-[9px] font-semibold text-white">
            + Öğretmen
          </span>
        </div>
        <div className="overflow-hidden rounded border border-cardBorder bg-card">
          <div className="grid grid-cols-[1fr_44px_44px] border-b border-cardBorder bg-paper2 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted">
            <span>Öğretmen</span>
            <span>Ders</span>
            <span className="text-right">Saat</span>
          </div>
          {staticTeachers.map((t) => (
            <div
              key={t.name}
              className="grid grid-cols-[1fr_44px_44px] border-b border-cardBorder/60 px-3 py-1.5 text-[10.5px] last:border-b-0"
            >
              <span className="text-ink">{t.name}</span>
              <span className="text-muted">{t.subj}</span>
              <span className="text-right tabular-nums text-ink-700">
                {t.hours}
              </span>
            </div>
          ))}
          {row && (
            <div
              className="grid animate-[d1slideUp_0.3s_ease-out] grid-cols-[1fr_44px_44px] border-l-[3px] border-primary bg-primary-soft px-3 py-1.5 text-[10.5px]"
              style={{ borderTopColor: '#1E3FAE' }}
            >
              <span className="flex items-center gap-1.5 font-semibold text-ink">
                <span className="grid size-3 place-items-center rounded-full bg-primary text-[7px] font-bold text-white">
                  ✦
                </span>
                Ahmet Yılmaz
              </span>
              <span className="text-primary">MAT</span>
              <span className="text-right tabular-nums font-semibold text-primary">
                18
              </span>
            </div>
          )}
        </div>
        <div className="mt-2 text-[9px] text-muted">
          AI ile eklenenler{' '}
          <span className="inline-block size-1 rounded-full bg-primary" /> ile
          işaretlenir.
        </div>
      </div>
    </div>
  );
}

function ScenePageGenerate({
  progress,
  logCount,
  done,
}: {
  progress: number;
  logCount: number;
  done: boolean;
}) {
  const logs = GEN_LOGS.slice(0, logCount);
  return (
    <div className="flex w-full flex-col">
      <MiniTopBar active="Programı Üret" />
      <div className="flex flex-1 flex-col overflow-hidden px-4 py-3">
        <h3 className="serif mb-2 text-[15px] text-ink">
          Programı <span className="serif-italic text-primary">üret</span>
        </h3>

        <div className="mb-2 rounded-lg border border-cardBorder bg-card p-2.5">
          <div className="mb-1 flex items-center justify-between text-[10px] text-muted">
            <span>Zaman limiti</span>
            <span className="tabular-nums">120 sn</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-paper2">
            <div className="h-full w-[60%] rounded-full bg-line" />
          </div>
        </div>

        <div className="mb-2 flex items-center gap-2">
          <button
            disabled
            className={
              'rounded-lg px-3 py-1.5 text-[10px] font-semibold transition-colors ' +
              (done
                ? 'bg-accent-leaf text-white'
                : progress > 0
                  ? 'bg-accent-amber text-white'
                  : 'bg-primary text-white')
            }
          >
            {done ? '✓ Tamamlandı' : progress > 0 ? 'Üretiyor…' : 'Üret'}
          </button>
          <span className="text-[10px] tabular-nums text-muted">
            {Math.round(progress)}%
          </span>
        </div>

        <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-paper2">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex-1 overflow-hidden rounded border border-cardBorder bg-paper2">
          <div className="border-b border-cardBorder bg-paper2 px-2 py-1 font-mono text-[8.5px] uppercase tracking-wider text-muted">
            FET log
          </div>
          <div className="space-y-0.5 px-2 py-1.5 font-mono text-[9.5px] leading-tight text-ink-700">
            {logs.map((line, i) => (
              <div
                key={i}
                className="animate-[d1slideUp_0.2s_ease-out]"
                style={{
                  color:
                    line.includes('Tamamlandı') || line.includes('0 ihlal')
                      ? '#5C7A4A'
                      : line.includes('ihlal')
                        ? '#D89B2A'
                        : '#3F3A33',
                }}
              >
                {line}
              </div>
            ))}
            {!done && progress > 0 && (
              <div className="text-muted">
                <span className="inline-block animate-pulse">▊</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScenePageTimetable({ fill }: { fill: number }) {
  // 5 gün × 8 saat = 40 hücre
  const days = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum'];
  const cellCount = 40;
  const visibleCount = Math.floor(cellCount * fill);

  return (
    <div className="flex w-full flex-col">
      <MiniTopBar active="Program" />
      <div className="flex flex-1 flex-col overflow-hidden px-4 py-3">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="serif text-[15px] text-ink">
            <span className="serif-italic text-primary">9-A</span> · haftalık
            program
          </h3>
          <span className="rounded bg-paper2 px-1.5 py-0.5 text-[9px] text-muted">
            PDF · XLSX
          </span>
        </div>

        <div className="flex-1 overflow-hidden rounded-lg border border-cardBorder bg-card p-2">
          <div className="grid grid-cols-[28px_repeat(5,1fr)] gap-1 text-[8.5px]">
            <div />
            {days.map((d) => (
              <div
                key={d}
                className="text-center font-semibold uppercase tracking-wider text-muted"
              >
                {d}
              </div>
            ))}
            {Array.from({ length: 8 }).map((_, row) => (
              <>
                <div
                  key={`h-${row}`}
                  className="flex items-center justify-end pr-0.5 font-semibold tabular-nums text-muted"
                >
                  {row + 1}
                </div>
                {Array.from({ length: 5 }).map((_, col) => {
                  const idx = row * 5 + col;
                  const skip = idx === 7 || idx === 23 || idx === 31; // teneffüs benzeri
                  const visible = idx < visibleCount && !skip;
                  const colorIdx = (idx * 3 + col + 1) % SUBJECT_COLORS.length;
                  const color = SUBJECT_COLORS[colorIdx]!;
                  return (
                    <div
                      key={`c-${idx}`}
                      className="h-5 overflow-hidden rounded text-center transition-all duration-200"
                      style={{
                        background: visible
                          ? color
                          : 'rgba(217,209,188,0.35)',
                        transform: visible ? 'scale(1)' : 'scale(0.85)',
                        opacity: visible ? 0.9 : 1,
                      }}
                    >
                      {visible && (
                        <div className="flex h-full items-center justify-center text-[8.5px] font-semibold text-white">
                          {['MAT', 'FİZ', 'TÜR', 'TAR', 'BED', 'KİM', 'İNG', 'COĞ'][colorIdx]}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            ))}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between text-[9.5px] text-muted">
          <span>
            {visibleCount}/{cellCount} slot doldu
          </span>
          <span className="text-accent-leaf">
            {fill >= 1 ? '✓ 0 çakışma · 1.2s' : '…'}
          </span>
        </div>
      </div>
    </div>
  );
}

function MiniTopBar({ active }: { active: string }) {
  const tabs = ['Başlangıç', 'Dersler', 'Sınıflar', 'Öğretmenler', 'Programı Üret', 'Program'];
  return (
    <div className="flex items-center gap-1.5 border-b border-line bg-paper px-2.5 py-1.5">
      <div className="mr-1.5 flex items-center gap-1">
        <div className="grid size-4 place-items-center rounded bg-primary text-[8px] text-white">
          <span className="serif-italic">ö</span>
        </div>
      </div>
      {tabs.map((t) => (
        <div
          key={t}
          className={
            'rounded px-1.5 py-0.5 text-[8.5px] font-medium whitespace-nowrap ' +
            (t === active
              ? 'bg-primary-soft text-primary'
              : 'text-ink-700/70')
          }
        >
          {t}
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
 * AI panel — birebir port (sağda chat + composer)
 * ──────────────────────────────────────────────────────────────── */

function DemoAIPanel({ st, tick }: { st: DerivedState; tick: number }) {
  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line bg-paper px-3 py-2">
        <div className="flex items-center gap-2">
          <Spk color="#1E3FAE" size={13} />
          <div>
            <div className="text-[12px] font-semibold leading-tight">
              AI Asistan
            </div>
            <div className="font-mono text-[9px] leading-tight text-muted">
              haiku-4-5 · sahne {st.scene}/3
            </div>
          </div>
        </div>
        <div className="flex gap-1 text-[12px] text-muted">
          <span>⇤</span>
          <span>×</span>
        </div>
      </div>

      {/* Mesajlar */}
      <div className="flex flex-1 flex-col gap-2 overflow-hidden p-3">
        <div className="card-defter shrink-0 px-2.5 py-2 text-[11px] leading-snug">
          Merhaba <span className="serif-italic">Müdür Bey</span>. Komutlarını
          yaz; ben yaparım.
        </div>

        {/* Scene 1 */}
        {st.s1.sent && <UserBubble text={USER_MSG_1} />}
        {tick >= ANIM.s1_think && st.s1.thinking && <Typing />}
        {st.s1.replyChars > 0 && (
          <AiBubble>
            {AI_MSG_1.slice(0, st.s1.replyChars)}
            {st.s1.replyChars < AI_MSG_1.length && (
              <Caret color="#1A1A1A" visible={st.cursor} />
            )}
          </AiBubble>
        )}
        {st.s1.tool1 && (
          <ToolRow ok text="Öğretmen eklendi" detail="Ahmet Yılmaz · MAT" />
        )}
        {st.s1.tool2 && (
          <ToolRow
            ok
            highlight
            text="Ders dağılımı"
            detail="9A · 9B · 9C → 6 saat MAT"
          />
        )}

        {/* Scene 2 */}
        {st.scene >= 2 && st.s2.sent && <UserBubble text={USER_MSG_2} />}
        {st.scene >= 2 && st.s2.thinking && <Typing />}
        {st.scene >= 2 && st.s2.replyChars > 0 && (
          <AiBubble>
            {AI_MSG_2.slice(0, st.s2.replyChars)}
            {st.s2.replyChars < AI_MSG_2.length && (
              <Caret color="#1A1A1A" visible={st.cursor} />
            )}
          </AiBubble>
        )}
        {st.s2.success && (
          <ToolRow
            ok
            highlight
            text="Program üretildi"
            detail="455 slot · 0 çakışma · 1.2s"
          />
        )}

        {/* Scene 3 */}
        {st.scene >= 3 && st.s3.replyChars > 0 && (
          <AiBubble>
            {AI_MSG_3.slice(0, st.s3.replyChars)}
            {st.s3.replyChars < AI_MSG_3.length && (
              <Caret color="#1A1A1A" visible={st.cursor} />
            )}
          </AiBubble>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-line bg-paper p-2.5">
        <div
          className="relative rounded-lg border-[1.5px] border-primary/30 bg-card px-2.5 py-1.5"
          style={{ boxShadow: '0 0 0 3px rgba(30,63,174,0.06)' }}
        >
          <div className="min-h-[28px] pr-7 text-[11px] leading-relaxed text-ink">
            <ComposerContent st={st} />
          </div>
          <div className="absolute bottom-1 right-1 grid size-[22px] place-items-center rounded-md bg-primary">
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="13 6 19 12 13 18" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function ComposerContent({ st }: { st: DerivedState }) {
  if (st.scene === 1) {
    if (!st.s1.sent) {
      return (
        <>
          {USER_MSG_1.slice(0, st.s1.typed)}
          <Caret color="#1E3FAE" visible={st.cursor || st.s1.typed > 0} />
        </>
      );
    }
    return (
      <span className="serif-italic text-[11.5px] text-muted">
        asistan yanıt veriyor…
      </span>
    );
  }
  if (st.scene === 2) {
    if (!st.s2.sent) {
      return (
        <>
          {USER_MSG_2.slice(0, st.s2.typed)}
          <Caret color="#1E3FAE" visible={st.cursor || st.s2.typed > 0} />
        </>
      );
    }
    return (
      <span className="serif-italic text-[11.5px] text-muted">
        üretim sürüyor…
      </span>
    );
  }
  return (
    <span className="serif-italic text-[11.5px] text-muted">Mesaj yaz…</span>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex shrink-0 animate-[d1slideUp_0.25s_ease-out] justify-end">
      <div
        className="max-w-[90%] bg-primary px-2.5 py-1.5 text-[11px] leading-snug text-white"
        style={{ borderRadius: '10px 10px 3px 10px' }}
      >
        {text}
      </div>
    </div>
  );
}

function AiBubble({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="max-w-[92%] shrink-0 animate-[d1slideUp_0.25s_ease-out] border border-cardBorder bg-card px-2.5 py-1.5 text-[11px] leading-relaxed text-ink"
      style={{ borderRadius: '3px 10px 10px 10px' }}
    >
      {children}
    </div>
  );
}

function Typing() {
  return (
    <div className="flex shrink-0 gap-1 pl-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 rounded-full bg-muted"
          style={{
            animation: `d1pulse 0.9s infinite`,
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}

function ToolRow({
  text,
  detail,
  ok: _ok,
  highlight,
}: {
  text: string;
  detail: string;
  ok?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        'flex shrink-0 animate-[d1slideUp_0.25s_ease-out] items-start gap-1.5 rounded-lg border px-2 py-1.5 text-[10.5px] ' +
        (highlight
          ? 'border-primary/40 bg-primary-soft'
          : 'border-cardBorder bg-card')
      }
    >
      <span
        className="mt-0.5 grid size-3.5 shrink-0 place-items-center rounded-full"
        style={{ background: highlight ? '#1E3FAE' : '#5C7A4A' }}
      >
        <svg
          width="7"
          height="7"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12 L10 17 L20 6" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] font-semibold leading-tight text-ink">
          {text}
        </div>
        <div className="mt-0.5 text-[9.5px] leading-tight text-muted">
          {detail}
        </div>
      </div>
    </div>
  );
}

function Caret({ color, visible }: { color: string; visible: boolean }) {
  return (
    <span
      className="-mb-0.5 ml-0.5 inline-block h-[11px] w-[1.5px] align-middle"
      style={{ background: color, opacity: visible ? 1 : 0 }}
    />
  );
}

function Spk({ color = '#1E3FAE', size = 14 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2 L13.6 9.4 L21 11 L13.6 12.6 L12 20 L10.4 12.6 L3 11 L10.4 9.4 Z"
        fill={color}
      />
    </svg>
  );
}
