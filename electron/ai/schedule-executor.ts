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
  while (totalMin < 0) totalMin += 24 * 60;
  totalMin = totalMin % (24 * 60);
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

// --- Handlers --------------------------------------------------------------

function extendBreaks(params: Record<string, unknown>): ScheduleUpdateApplyResult {
  const minutes = requireNumber(params, 'minutes', 'count', 'delta');
  if (minutes === null || minutes === 0) {
    throw new Error("'minutes' parametresi gerekli (sıfırdan farklı sayı).");
  }
  const cur = hoursRepo.list();
  if (cur.length === 0) {
    throw new Error('Henüz tanımlı ders saati yok — önce ders saatlerini ekleyin.');
  }
  // mode='break': her saatin SÜRESİNİ koru, i. saati i*delta kaydır.
  const next = cur.map((h, i) => ({
    name: h.name,
    startTime: h.startTime ? shiftClock(h.startTime, minutes * i) : h.startTime,
    endTime: h.endTime ? shiftClock(h.endTime, minutes * i) : h.endTime,
  }));
  hoursRepo.replaceAll(next);
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

  // Mevcut day-specific hours yoksa global'den seed et
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

  // Son saatin end'ini başlangıç al; yoksa null start/end ile ekle.
  const last = baseline[baseline.length - 1];
  let nextStart: string | null = last?.endTime ?? null;
  for (let i = 0; i < count; i++) {
    const order = baseline.length;
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
    // Yeni saat — önceki saatin end'inden 10dk sonra başlat (varsa)
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
  // day_hours override'ları temizle — global'e dönüş
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

/**
 * Schedule update response'unu uygular. UI'dan çağrılır (kullanıcı onayı sonrası).
 * Hata Türkçe throw eder; caller IPC hata zarfına çevirir.
 */
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
