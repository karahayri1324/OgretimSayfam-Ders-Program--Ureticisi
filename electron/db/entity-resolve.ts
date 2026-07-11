// Ad-tabanlı entity çözümleme + kısıt param normalizasyonu — ORTAK modül.
// Hem AI yolu (mutation-executor add_constraint / add_activity_constraint) hem manuel yol
// (ipc constraints:add) kısıt params'ını DB'ye yazmadan önce BURADAN geçirmeli: gün adları
// kanonikleşir, entity referansları doğrulanıp kanonikleşir. Aksi halde typo'lu/hayalet
// referanslı kısıt DB'ye girer, UI'da aktif görünür ve FET-build'de sessizce atlanır.

import { daysRepo } from './repositories/days.js';
import { teachersRepo } from './repositories/teachers.js';
import { classesRepo } from './repositories/classes.js';
import { subjectsRepo } from './repositories/subjects.js';
import { roomsRepo } from './repositories/rooms.js';
import { deburr } from './constraint-prune-logic.js';

export function findByName<T extends { id: number; name: string }>(
  needle: string,
  list: T[],
): T | null {
  const target = deburr(needle.trim());
  if (!target) return null;
  for (const item of list) if (deburr(item.name) === target) return item;
  for (const item of list) if (deburr(item.name).includes(target)) return item;
  // 3. fallback (aranan ad, entity adını ALT-DİZE olarak içeriyor — örn. "Matematik dersi" →
  // "Matematik"): kısa adlı entity'ler ("M" odası, "9" sınıfı) bu kuralla YANLIŞ eşleşiyordu
  // (örn. "Matematik 1" → 'm' içerdiği için "M" odası). Yalnız >=3 karakterlik adları değerlendir
  // ve birden çok aday varsa EN UZUN (en spesifik) olanı seç.
  let best: T | null = null;
  let bestLen = 0;
  for (const item of list) {
    const n = deburr(item.name);
    if (n.length >= 3 && target.includes(n) && n.length > bestLen) {
      best = item;
      bestLen = n.length;
    }
  }
  if (best) return best;
  const parts = target.split(/\s+/).filter((p) => p.length >= 3);
  for (const item of list) {
    const lowName = deburr(item.name);
    for (const p of parts) {
      const re = new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      if (re.test(lowName)) return item;
    }
  }
  return null;
}

// Ham gün adını ('pazartesi','Carsamba','CUMA') KANONIK days tablosu adına ('Pazartesi')
// çevirir. FET handler'ları (xml-builder dayByName) günü TAM eşler; ham string FET-build'de
// sessizce unknownDays'e düşüp kısıtı kaybettirir. Bulunamazsa null.
export function canonicalDayName(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const days = daysRepo.list();
  const exact = days.find((d) => d.name === raw.trim());
  if (exact) return exact.name;
  const fuzzy = days.find((d) => deburr(d.name) === deburr(raw));
  return fuzzy ? fuzzy.name : null;
}

// Bir entity ad alanını ('teacher'/'class'/'subject'/'room') KANONIK DB adına çözer ve var
// olduğunu DOĞRULAR. FET, kısıt referanslarını ada-göre tam eşler; doğrulanmadan yazılan
// hayalet entity'ler FET'te skip → AI/DB ↔ FET kalıcı sapma üretir.
function resolveEntityField(
  p: Record<string, unknown>,
  key: string,
  list: { id: number; name: string }[],
  label: string,
): void {
  const v = p[key];
  if (typeof v !== 'string' || !v.trim()) return;
  const hit = findByName(v, list);
  if (!hit) throw new Error(`${label} bulunamadı: '${v}'`);
  p[key] = hit.name;
}

// Kısıt param'larını DB'ye yazmadan ÖNCE normalleştir: gün adlarını kanonikleştir, entity
// referanslarını doğrula+kanonikleştir. Böylece kısıt ya gerçekten uygulanır ya da net
// hatayla reddedilir — sessiz kayıp olmaz.
export function normalizeConstraintParams(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const p: Record<string, unknown> = { ...raw };

  if ('day' in p && typeof p.day === 'string') {
    const c = canonicalDayName(p.day);
    if (!c) throw new Error(`Gün bulunamadı: '${String(p.day)}'`);
    p.day = c;
  }
  if (Array.isArray(p.days)) {
    p.days = p.days.map((d) => {
      const c = canonicalDayName(d);
      if (!c) throw new Error(`Gün bulunamadı: '${String(d)}'`);
      return c;
    });
  }
  if (Array.isArray(p.slots)) {
    p.slots = p.slots.map((s) => {
      if (s && typeof s === 'object' && 'day' in (s as Record<string, unknown>)) {
        const so = s as Record<string, unknown>;
        if (so.day === null || so.day === undefined) return s;
        const c = canonicalDayName(so.day);
        if (!c) throw new Error(`Gün bulunamadı: '${String(so.day)}'`);
        return { ...so, day: c };
      }
      return s;
    });
  }

  resolveEntityField(p, 'teacher', teachersRepo.list(), 'Öğretmen');
  resolveEntityField(p, 'class', classesRepo.list(), 'Sınıf');
  resolveEntityField(p, 'subject', subjectsRepo.list(), 'Branş');
  resolveEntityField(p, 'room', roomsRepo.list(), 'Derslik');
  if (Array.isArray(p.rooms)) {
    const rooms = roomsRepo.list();
    p.rooms = p.rooms.map((r) => {
      if (typeof r !== 'string' || !r.trim()) return r;
      const hit = findByName(r, rooms);
      if (!hit) throw new Error(`Derslik bulunamadı: '${r}'`);
      return hit.name;
    });
  }

  return p;
}
