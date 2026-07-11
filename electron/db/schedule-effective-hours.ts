import { hoursRepo } from './repositories/hours.js';
import { daysRepo } from './repositories/days.js';
import { dayHoursRepo } from './repositories/day_hours.js';

// Güne-özel saat düzeni (day_hours override) globalden UZUN olabilir. ACTIVITY_FIXED_TIME
// kilitleri budanırken eşik GLOBAL saat sayısı alınırsa, uzun günün geçerli kilitleri yanlışlıkla
// silinir. Eşik her zaman EFEKTİF max (global vs kalan override'ların en uzunu) olmalı.
// Hem AI (mutation-executor) hem manuel (ipc/schedule) yollar bu fonksiyonları kullanır.

/** Tüm günler üzerinden efektif azami saat sayısı: max(global, en uzun override). */
export function effectiveMaxHourCount(): number {
  let mx = hoursRepo.list().length;
  for (const d of daysRepo.list()) {
    const o = dayHoursRepo.listByDay(d.id);
    if (o.length > mx) mx = o.length;
  }
  return mx;
}

/** Belirli bir günün efektif saat sayısı: override varsa uzunluğu, yoksa global. */
export function effectiveHourCountForDay(dayId: number): number {
  const o = dayHoursRepo.listByDay(dayId);
  return o.length > 0 ? o.length : hoursRepo.list().length;
}
