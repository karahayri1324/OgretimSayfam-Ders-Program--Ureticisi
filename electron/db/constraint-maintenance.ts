// Gün/saat şeması değişince bayatlayan kısıtların ortak bakımı (I/O sarmalayıcı). Saf karar
// mantığı constraint-prune-logic.ts'te (birim-testli); burada yalnız constraintsRepo ile uygula.
// Birden çok yol saat sayısını düşürebilir (delete_hour / set_hour_times / set_hours_per_day) veya
// gün kaldırabilir (delete_day / set_days / remove_day); temizlenmezse kısıtlar FET-build'de
// SESSİZCE skip ediliyor. Tek kaynak → yollar ıraksamaz.

import { constraintsRepo } from './repositories/constraints.js';
import {
  planFixedTimeLocksBeyondHour,
  planConstraintsForRemovedDays,
} from './constraint-prune-logic.js';

/** Saat sayısı azalınca aralık-DIŞI ACTIVITY_FIXED_TIME kilitlerini siler; silinen sayıyı döner. */
export function pruneFixedTimeLocksBeyondHour(hourCount: number): number {
  const ids = planFixedTimeLocksBeyondHour(constraintsRepo.list(), hourCount);
  for (const id of ids) constraintsRepo.delete(id);
  return ids.length;
}

/** Gün(ler) kaldırılınca o güne atıf yapan kısıtları temizler (sil/güncelle); etkilenen sayıyı döner. */
export function pruneConstraintsForRemovedDays(removedNames: string[]): number {
  const plan = planConstraintsForRemovedDays(constraintsRepo.list(), removedNames);
  for (const id of plan.deleteIds) constraintsRepo.delete(id);
  for (const u of plan.updates) constraintsRepo.updateParams(u.id, u.params);
  return plan.deleteIds.length + plan.updates.length;
}
