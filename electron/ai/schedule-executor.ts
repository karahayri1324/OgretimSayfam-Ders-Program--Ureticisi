import { daysRepo } from '../db/repositories/days.js';
import { hoursRepo } from '../db/repositories/hours.js';
import { dayHoursRepo } from '../db/repositories/day_hours.js';
import { log } from '../utils/logger.js';
import type { AIScheduleUpdateResponse, Hour } from '../../src/lib/types.js';


export type ScheduleUpdateApplyResult = {
  ok: true;
  action: string;
  message: string;
  data: {
    days: ReturnType<typeof daysRepo.list>;
    hours: ReturnType<typeof hoursRepo.list>;
    dayHours: ReturnType<typeof dayHoursRepo.list>;
  };
};

function deburr(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/i̇/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o');
}

function snapshot(): ScheduleUpdateApplyResult['data'] {
  return {
    days: daysRepo.list(),
    hours: hoursRepo.list(),
    dayHours: dayHoursRepo.list(),
  };
}

function shiftClock(time: string, deltaMinutes: number): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return time;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return time;
  let totalMin = hh * 60 + mm + deltaMinutes;
  // Gün-içi saat: ertesi güne SARMA (eski %1440 → sonraki dersi öncekinden erken başlatıyordu)
  // ya da negatife düşme yerine [00:00, 23:59] aralığına sınırla (#6).
  if (totalMin < 0) totalMin = 0;
  if (totalMin > 23 * 60 + 59) totalMin = 23 * 60 + 59;
  const nh = Math.floor(totalMin / 60);
  const nm = totalMin % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

function requireNumber(params: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = params[k];
    if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
    if (typeof v === 'string') {
      const n = parseInt(v, 10);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function requireString(params: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = params[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}


function extendBreaks(params: Record<string, unknown>): ScheduleUpdateApplyResult {
  const minutes = requireNumber(params, 'minutes', 'count', 'delta');
  if (minutes === null || minutes === 0) {
    throw new Error("'minutes' parametresi gerekli (sıfırdan farklı sayı).");
  }
  const cur = hoursRepo.list();
  if (cur.length === 0) {
    throw new Error('Henüz tanımlı ders saati yok — önce ders saatlerini ekleyin.');
  }
  // Kümülatif kaydırma HER İKİ yönde de geçerli kalmalı (global VEYA güne-özel):
  // - uzatmada (pozitif) son dersler 24 saati taşırmamalı,
  // - kısaltmada (negatif) teneffüs eksiye düşüp ardışık dersler ÜST ÜSTE binmemeli veya
  //   saatler 00:00'ın altına düşüp sessizce clamp'lenmemeli (#6 — eskiden yalnız minutes>0
  //   denetleniyordu, negatif tüm guard'ları atlıyordu).
  const parseHM = (t: string | null): number | null => {
    const m = t ? /^(\d{1,2}):(\d{2})$/.exec(t.trim()) : null;
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const shiftInvalid = (
    rows: { startTime: string | null; endTime: string | null }[],
  ): boolean => {
    let prevEnd: number | null = null;
    for (let i = 0; i < rows.length; i++) {
      const s = parseHM(rows[i]!.startTime);
      const e = parseHM(rows[i]!.endTime);
      const ss = s == null ? null : s + minutes * i;
      const se = e == null ? null : e + minutes * i;
      if (ss != null && (ss < 0 || ss > 23 * 60 + 59)) return true;
      if (se != null && (se < 0 || se > 23 * 60 + 59)) return true;
      if (ss != null && se != null && se < ss) return true;
      if (prevEnd != null && ss != null && ss < prevEnd) return true;
      if (se != null) prevEnd = se;
      else if (ss != null) prevEnd = ss;
    }
    return false;
  };
  const dhCheck = dayHoursRepo.list();
  const byDayCheck = new Map<number, typeof dhCheck>();
  for (const r of dhCheck) {
    const arr = byDayCheck.get(r.dayId) ?? [];
    arr.push(r);
    byDayCheck.set(r.dayId, arr);
  }
  const invalid =
    shiftInvalid(cur) ||
    [...byDayCheck.values()].some((rows) =>
      shiftInvalid([...rows].sort((a, b) => a.orderIndex - b.orderIndex)),
    );
  if (invalid) {
    throw new Error(
      minutes > 0
        ? 'Bu kadar uzatma günü (24 saat) taşırıyor; daha küçük bir değer deneyin.'
        : 'Bu kadar kısaltma dersleri çakıştırıyor veya geçersiz saate düşürüyor; daha küçük bir değer deneyin.',
    );
  }
  const next = cur.map((h, i) => ({
    name: h.name,
    startTime: h.startTime ? shiftClock(h.startTime, minutes * i) : h.startTime,
    endTime: h.endTime ? shiftClock(h.endTime, minutes * i) : h.endTime,
  }));
  hoursRepo.replaceAll(next);
  // Güne-özel saat (day_hours) override'larına da aynı kaydırmayı uygula; yoksa override'lı
  // günlerde uzatma sessizce uygulanmaz, bayat saatler kalır (#7).
  const overrides = dayHoursRepo.list();
  if (overrides.length > 0) {
    const byDay = new Map<number, typeof overrides>();
    for (const r of overrides) {
      const arr = byDay.get(r.dayId) ?? [];
      arr.push(r);
      byDay.set(r.dayId, arr);
    }
    for (const [dayId, rows] of byDay) {
      const sorted = [...rows].sort((a, b) => a.orderIndex - b.orderIndex);
      dayHoursRepo.replaceForDay(
        dayId,
        sorted.map((r, i) => ({
          orderIndex: r.orderIndex,
          name: r.name,
          startTime: r.startTime ? shiftClock(r.startTime, minutes * i) : r.startTime,
          endTime: r.endTime ? shiftClock(r.endTime, minutes * i) : r.endTime,
        })),
      );
    }
  }
  return {
    ok: true,
    action: 'extend_breaks',
    message: `Teneffüs süreleri ${minutes} dakika ${minutes > 0 ? 'uzatıldı' : 'kısaltıldı'}.`,
    data: snapshot(),
  };
}

const MAX_HOURS_PER_DAY = 12;

function addHoursToDay(params: Record<string, unknown>): ScheduleUpdateApplyResult {
  const dayName = requireString(params, 'day', 'name', 'dayName');
  if (!dayName) throw new Error("'day' parametresi gerekli.");
  const count = requireNumber(params, 'count', 'hours', 'n', 'amount') ?? 1;
  if (count <= 0) throw new Error("'count' pozitif olmalı.");

  const allDays = daysRepo.list();
  const target = allDays.find((d) => deburr(d.name) === deburr(dayName));
  if (!target) throw new Error(`Gün bulunamadı: '${dayName}'`);

  const globalHours = hoursRepo.list();
  const existing = dayHoursRepo.listByDay(target.id);
  const baseline =
    existing.length > 0
      ? existing.map((d, i) => ({
          orderIndex: d.orderIndex ?? i,
          name: d.name ?? `${i + 1}. Ders`,
          startTime: d.startTime,
          endTime: d.endTime,
        }))
      : globalHours.map((h, i) => ({
          orderIndex: i,
          name: h.name ?? `${i + 1}. Ders`,
          startTime: h.startTime,
          endTime: h.endTime,
        }));

  if (baseline.length + count > MAX_HOURS_PER_DAY) {
    throw new Error(
      `Bir günde en fazla ${MAX_HOURS_PER_DAY} ders saati olabilir (mevcut: ${baseline.length}, istenen: +${count}).`,
    );
  }

  const last = baseline[baseline.length - 1];
  let nextStart: string | null = last?.endTime ?? null;
  // Yeni orderIndex'i mevcutların MAX'ından devam ettir; baseline.length kullanmak süreksiz
  // (gap'li) orderIndex'lerde UNIQUE(day_id, hour_order_index) çakışmasına yol açıyordu (#20).
  let maxOrder = baseline.reduce((m, r) => Math.max(m, r.orderIndex), -1);
  for (let i = 0; i < count; i++) {
    const order = ++maxOrder;
    const start = nextStart;
    const end = start ? shiftClock(start, 40) : null;
    baseline.push({
      orderIndex: order,
      name: `${order + 1}. Ders`,
      startTime: start,
      endTime: end,
    });
    nextStart = end ? shiftClock(end, 10) : null;
  }

  dayHoursRepo.replaceForDay(target.id, baseline);
  return {
    ok: true,
    action: 'add_hours_to_day',
    message: `${target.name} gününe ${count} ders saati eklendi (toplam ${baseline.length}).`,
    data: snapshot(),
  };
}

function setHoursPerDay(params: Record<string, unknown>): ScheduleUpdateApplyResult {
  const n = requireNumber(params, 'hoursPerDay', 'count', 'hours', 'n');
  if (n === null || n <= 0) throw new Error("'hoursPerDay' pozitif sayı olmalı.");
  if (n > MAX_HOURS_PER_DAY) {
    throw new Error(`Günde en fazla ${MAX_HOURS_PER_DAY} ders saati olabilir.`);
  }

  const cur = hoursRepo.list();
  const next: Array<{
    name: string;
    startTime: string | null;
    endTime: string | null;
  }> = [];
  for (let i = 0; i < n; i++) {
    const existing: Hour | undefined = cur[i];
    if (existing) {
      next.push({
        name: existing.name ?? `${i + 1}. Ders`,
        startTime: existing.startTime,
        endTime: existing.endTime,
      });
      continue;
    }
    const prev = next[next.length - 1];
    const start = prev?.endTime ? shiftClock(prev.endTime, 10) : null;
    const end = start ? shiftClock(start, 40) : null;
    next.push({
      name: `${i + 1}. Ders`,
      startTime: start,
      endTime: end,
    });
  }
  hoursRepo.replaceAll(next);
  dayHoursRepo.clearAll();
  return {
    ok: true,
    action: 'set_hours_per_day',
    message: `Günlük ders saati sayısı ${n} olarak ayarlandı.`,
    data: snapshot(),
  };
}

function removeDay(params: Record<string, unknown>): ScheduleUpdateApplyResult {
  const dayName = requireString(params, 'day', 'name');
  if (!dayName) throw new Error("'day' parametresi gerekli.");
  const cur = daysRepo.list().map((d) => d.name);
  const next = cur.filter((d) => deburr(d) !== deburr(dayName));
  if (next.length === cur.length) {
    throw new Error(`Gün bulunamadı: '${dayName}'`);
  }
  if (next.length === 0) {
    throw new Error('Tüm günleri silemezsiniz — en az bir gün kalmalı.');
  }
  daysRepo.replaceAll(next);
  return {
    ok: true,
    action: 'remove_day',
    message: `'${dayName}' günü programdan kaldırıldı.`,
    data: snapshot(),
  };
}

function addDay(params: Record<string, unknown>): ScheduleUpdateApplyResult {
  const dayName = requireString(params, 'day', 'name');
  if (!dayName) throw new Error("'day' parametresi gerekli.");
  const cur = daysRepo.list().map((d) => d.name);
  if (cur.some((d) => deburr(d) === deburr(dayName))) {
    return {
      ok: true,
      action: 'add_day',
      message: `'${dayName}' günü zaten var. Atlandı.`,
      data: snapshot(),
    };
  }
  daysRepo.replaceAll([...cur, dayName]);
  return {
    ok: true,
    action: 'add_day',
    message: `'${dayName}' günü programa eklendi.`,
    data: snapshot(),
  };
}

const HANDLERS: Record<
  string,
  (p: Record<string, unknown>) => ScheduleUpdateApplyResult
> = {
  extend_breaks: extendBreaks,
  add_hours_to_day: addHoursToDay,
  set_hours_per_day: setHoursPerDay,
  remove_day: removeDay,
  add_day: addDay,
};

export function applyScheduleUpdate(
  response: AIScheduleUpdateResponse,
): ScheduleUpdateApplyResult {
  const handler = HANDLERS[response.action];
  if (!handler) {
    throw new Error(
      `Bilinmeyen schedule_update aksiyonu: '${response.action}'. ` +
        `Geçerli aksiyonlar: ${Object.keys(HANDLERS).join(', ')}`,
    );
  }
  try {
    const result = handler(response.params ?? {});
    log.info('AI schedule_update uygulandı', {
      action: response.action,
      message: result.message,
    });
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn('AI schedule_update hatası', { action: response.action, error: msg });
    throw new Error(msg);
  }
}

export { HANDLERS as SCHEDULE_UPDATE_HANDLERS };
