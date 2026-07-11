// Gün/saat şeması değişince bayatlayan kısıtların ortak bakımı (I/O sarmalayıcı). Saf karar
// mantığı constraint-prune-logic.ts'te (birim-testli); burada yalnız constraintsRepo ile uygula.
// Birden çok yol saat sayısını düşürebilir (delete_hour / set_hour_times / set_hours_per_day) veya
// gün kaldırabilir (delete_day / set_days / remove_day); temizlenmezse kısıtlar FET-build'de
// SESSİZCE skip ediliyor. Tek kaynak → yollar ıraksamaz.

import { constraintsRepo } from './repositories/constraints.js';
import {
  planFixedTimeLocksBeyondHour,
  planConstraintsForRemovedDays,
  planConstraintRename,
  deburr,
} from './constraint-prune-logic.js';

export type ConstraintEntityField = 'teacher' | 'class' | 'subject' | 'room';

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

/** Entity silinince, ada (deburr-eş) atıf yapan kısıtları siler; silinen sayıyı döner.
 *  Hem AI (mutation-executor) hem manuel IPC silme yolları BU fonksiyonu kullanmalı —
 *  aksi halde silinen entity'nin kısıtları listede aktif görünüp FET-build'de sessizce
 *  atlanır ve aynı adla yeni entity eklenirse habersiz yeniden canlanır. */
export function pruneConstraintsByName(field: ConstraintEntityField, name: string): number {
  const target = deburr(name);
  let removed = 0;
  for (const c of constraintsRepo.list()) {
    const p = c.params as Record<string, unknown>;
    let hit = typeof p[field] === 'string' && deburr(p[field] as string) === target;
    if (!hit && field === 'room' && Array.isArray(p['rooms'])) {
      hit = (p['rooms'] as unknown[]).some((r) => typeof r === 'string' && deburr(r) === target);
    }
    if (hit) {
      constraintsRepo.delete(c.id);
      removed++;
    }
  }
  return removed;
}

/** Entity yeniden adlandırılınca, eski ada atıf yapan kısıt params'larını yeni ada taşır;
 *  güncellenen sayıyı döner. Kısıtlar adı snapshot olarak sakladığından, rename cascade'i
 *  olmayan her yol (AI veya manuel) kullanıcının kısıtlarını sessizce öldürür. */
export function renameConstraintReferences(
  field: ConstraintEntityField,
  oldName: string,
  newName: string,
): number {
  const updates = planConstraintRename(constraintsRepo.list(), field, oldName, newName);
  for (const u of updates) constraintsRepo.updateParams(u.id, u.params);
  return updates.length;
}

/** Aktivite(ler) silinince, id'lerine atıf yapan kısıtları siler; silinen sayıyı döner. */
export function pruneConstraintsByActivityIds(ids: number[]): number {
  if (ids.length === 0) return 0;
  const idset = new Set(ids);
  let removed = 0;
  for (const c of constraintsRepo.list()) {
    const p = c.params as Record<string, unknown>;
    const single = typeof p['activityId'] === 'number' && idset.has(p['activityId'] as number);
    const many =
      Array.isArray(p['activityIds']) &&
      (p['activityIds'] as unknown[]).some((x) => typeof x === 'number' && idset.has(x as number));
    const pair =
      (typeof p['firstActivityId'] === 'number' && idset.has(p['firstActivityId'] as number)) ||
      (typeof p['secondActivityId'] === 'number' && idset.has(p['secondActivityId'] as number));
    if (single || many || pair) {
      constraintsRepo.delete(c.id);
      removed++;
    }
  }
  return removed;
}
