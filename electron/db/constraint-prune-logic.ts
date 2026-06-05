// Kısıt budama KARARLARI — SAF mantık, DB/I-O bağımlılığı YOK. constraint-maintenance.ts bunu
// constraintsRepo ile sarar. Ayrı dosya olmasının sebebi: better-sqlite3 native addon Electron
// ABI'sine derlendiğinden DB katmanını import eden hiçbir modül vitest (node) altında yüklenemiyor;
// saf mantığı izole ederek birim-test edilebilir kılıyoruz.

export type ConstraintLike = {
  id: number;
  type: string;
  params: Record<string, unknown>;
};

/** Saat sayısı hourCount'a düşünce aralık-DIŞI kalan ACTIVITY_FIXED_TIME (hour 1-tabanlı) kilit
 *  id'lerini döner (silinecekler). */
export function planFixedTimeLocksBeyondHour(
  constraints: ConstraintLike[],
  hourCount: number,
): number[] {
  return constraints
    .filter((c) => {
      if (c.type !== 'ACTIVITY_FIXED_TIME') return false;
      const h = (c.params as { hour?: unknown }).hour;
      return typeof h === 'number' && h > hourCount;
    })
    .map((c) => c.id);
}

export type DayPrunePlan = {
  deleteIds: number[];
  updates: Array<{ id: number; params: Record<string, unknown> }>;
};

function norm(s: string): string {
  return s.trim().toLocaleLowerCase('tr');
}

// Türkçe-duyarsız karşılaştırma (mutation-executor/tools'taki deburr ile aynı) — saf modülün
// kendi kendine yeterli ve test edilebilir kalması için burada kopya.
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

/** Entity yeniden adlandırılınca, eski ada (deburr-eş) atıf yapan kısıt params'larını yeni ada
 *  güncelleyecek (id, yeni params) çiftlerini döner. 'room' için hem scalar params.room hem
 *  params.rooms[] dizisi taranır. Saf — girdiyi mutasyona uğratmaz. */
export function planConstraintRename(
  constraints: ConstraintLike[],
  field: 'teacher' | 'class' | 'subject' | 'room',
  oldName: string,
  newName: string,
): Array<{ id: number; params: Record<string, unknown> }> {
  if (oldName === newName) return [];
  const target = deburr(oldName);
  const updates: Array<{ id: number; params: Record<string, unknown> }> = [];
  for (const c of constraints) {
    const p = { ...c.params };
    let hit = false;
    if (typeof p[field] === 'string' && deburr(p[field] as string) === target) {
      p[field] = newName;
      hit = true;
    }
    if (field === 'room' && Array.isArray(p.rooms)) {
      let arrChanged = false;
      const next = (p.rooms as unknown[]).map((r) => {
        if (typeof r === 'string' && deburr(r) === target) {
          arrChanged = true;
          return newName;
        }
        return r;
      });
      if (arrChanged) {
        p.rooms = next;
        hit = true;
      }
    }
    if (hit) updates.push({ id: c.id, params: p });
  }
  return updates;
}

/** Gün(ler) kaldırılınca: tek-gün alanlı (params.day) kısıtlar tamamen silinir; days[]/slots[]
 *  alanlılardan kaldırılan günler çıkarılır (boşalırsa silinir). Silinecek id'leri ve güncellenecek
 *  (id, yeni params) çiftlerini döner. Saf — girdi listesini MUTASYONA UĞRATMAZ (kopyalar). */
export function planConstraintsForRemovedDays(
  constraints: ConstraintLike[],
  removedNames: string[],
): DayPrunePlan {
  const removed = new Set(removedNames.map(norm).filter(Boolean));
  const plan: DayPrunePlan = { deleteIds: [], updates: [] };
  if (removed.size === 0) return plan;
  const isRemoved = (d: unknown): boolean => typeof d === 'string' && removed.has(norm(d));

  for (const c of constraints) {
    const p = { ...c.params };
    let dead = false;
    let changed = false;

    if (typeof p.day === 'string' && isRemoved(p.day)) {
      dead = true;
    }

    if (!dead && Array.isArray(p.days)) {
      const kept = p.days.filter((d) => !isRemoved(d));
      if (kept.length !== p.days.length) {
        if (kept.length === 0) dead = true;
        else {
          p.days = kept;
          changed = true;
        }
      }
    }

    if (!dead && Array.isArray(p.slots)) {
      const kept = p.slots.filter((s) => {
        const day = s && typeof s === 'object' ? (s as { day?: unknown }).day : undefined;
        return !isRemoved(day);
      });
      if (kept.length !== p.slots.length) {
        if (kept.length === 0) dead = true;
        else {
          p.slots = kept;
          changed = true;
        }
      }
    }

    if (dead) plan.deleteIds.push(c.id);
    else if (changed) plan.updates.push({ id: c.id, params: p });
  }
  return plan;
}
