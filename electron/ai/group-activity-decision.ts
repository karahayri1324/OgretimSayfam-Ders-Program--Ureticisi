// merge_activities / add_split_activity'nin mevcut-aktivite kararı — SAF mantık (DB yok).
// id'siz activitiesRepo.upsert, ON CONFLICT (sınıf+ders+öğretmen) ile MEVCUT bağımsız bir
// aktivitenin saat/notunu sessizce ezerdi. Karar: aynı kombinasyon yoksa oluştur; varsa saat
// aynıysa mevcut kaydı KORU (yalnız gruba al), saat farklıysa net hatayla REDDET.

export type GroupActivityDecision =
  | { kind: 'create' }
  | { kind: 'reuse'; id: number }
  | { kind: 'conflict'; existingHours: number };

export function decideGroupActivity(
  existing: { id: number; weeklyHours: number } | null | undefined,
  requestedWeeklyHours: number,
): GroupActivityDecision {
  if (!existing) return { kind: 'create' };
  if (existing.weeklyHours !== requestedWeeklyHours) {
    return { kind: 'conflict', existingHours: existing.weeklyHours };
  }
  return { kind: 'reuse', id: existing.id };
}
