// Ders saati (gün-içi "HH:MM") aritmetiği — TEK kaynak. Eskiden schedule.ts (manuel IPC) ve
// schedule-executor.ts (AI) ayrı kopyalar tutuyordu; biri sertleştirilip diğeri ESKİ gece-yarısı
// sarma (modulo 1440) davranışında kalınca manuel teneffüs ayarı saatleri sessizce bozabiliyordu.
// Ortak kullanım divergence'ı önler.

/** "HH:MM" + dakika → "HH:MM". Gün-içi saat ertesi güne SARMAZ; [00:00, 23:59] aralığına clamp'lenir.
 *  Geçersiz/biçimsiz girdi olduğu gibi döner. */
export function shiftClock(time: string, deltaMinutes: number): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return time;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return time;
  let total = hh * 60 + mm + deltaMinutes;
  if (total < 0) total = 0;
  if (total > 23 * 60 + 59) total = 23 * 60 + 59;
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

/** "HH:MM" → günün dakikası; geçersizse null. */
export function parseHM(t: string | null | undefined): number | null {
  const m = t ? /^(\d{1,2}):(\d{2})$/.exec(t.trim()) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export type BreakAdjustMode = 'start' | 'end' | 'break';

/** Teneffüs/kaydırma modunun i. ders için start/end kaymasını verir. 'break' kümülatiftir
 *  (multiplier=i). schedule.ts (manuel) ile schedule-executor (AI) AYNI mantığı kullansın. */
export function shiftsFor(
  i: number,
  delta: number,
  mode: BreakAdjustMode,
): { startShift: number; endShift: number } {
  const multiplier = mode === 'break' ? i : 1;
  return {
    startShift: mode === 'end' ? 0 : delta * multiplier,
    endShift: mode === 'start' ? 0 : delta * multiplier,
  };
}

/** Kaydırma uygulanınca herhangi bir saat gün dışına taşıyor mu, ders süresi negatife düşüyor mu
 *  ya da ardışık dersler çakışıyor mu? shiftClock sessizce [00:00,23:59]'a clamp'lediği için bu
 *  denetim YAZMADAN ÖNCE çağrılmalı (yoksa bozuk saat sessizce DB'ye/FET'e gider). */
export function adjustOverflows(
  hours: Array<{ orderIndex: number; startTime: string | null; endTime: string | null }>,
  delta: number,
  mode: BreakAdjustMode,
): boolean {
  const sorted = [...hours].sort((a, b) => a.orderIndex - b.orderIndex);
  let prevEnd: number | null = null;
  for (let i = 0; i < sorted.length; i++) {
    const { startShift, endShift } = shiftsFor(i, delta, mode);
    const s = parseHM(sorted[i]!.startTime);
    const e = parseHM(sorted[i]!.endTime);
    const ss = s == null ? null : s + startShift;
    const se = e == null ? null : e + endShift;
    if (ss != null && (ss < 0 || ss > 23 * 60 + 59)) return true;
    if (se != null && (se < 0 || se > 23 * 60 + 59)) return true;
    if (ss != null && se != null && se < ss) return true;
    if (prevEnd != null && ss != null && ss < prevEnd) return true;
    if (se != null) prevEnd = se;
    else if (ss != null) prevEnd = ss;
  }
  return false;
}
