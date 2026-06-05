// Tur-8/9'da electron-bağımlı DB yüzünden birim-test EDİLEMEYEN fix'lerin saf-mantık testleri.
// (better-sqlite3 native addon Electron ABI'sine derli → vitest node altında DB import'u
// yüklenemiyor; bu yüzden karar mantığı I/O'dan ayrılıp saf modüllere taşındı.)

import { describe, it, expect } from 'vitest';
import {
  planFixedTimeLocksBeyondHour,
  planConstraintsForRemovedDays,
  planConstraintRename,
  type ConstraintLike,
} from '../electron/db/constraint-prune-logic';
import { decideGroupActivity } from '../electron/ai/group-activity-decision';

function c(id: number, type: string, params: Record<string, unknown>): ConstraintLike {
  return { id, type, params };
}

// ===========================================================================
// Tur-8 #8 / Tur-9 #2 — saat azalınca aralık-dışı ACTIVITY_FIXED_TIME kilitleri budanmalı.
// ===========================================================================
describe('planFixedTimeLocksBeyondHour', () => {
  it('hour > hourCount olan ACTIVITY_FIXED_TIME id\'lerini döner, diğerlerine dokunmaz', () => {
    const list = [
      c(1, 'ACTIVITY_FIXED_TIME', { activityId: 1, day: 'Pazartesi', hour: 3 }),
      c(2, 'ACTIVITY_FIXED_TIME', { activityId: 2, day: 'Salı', hour: 8 }),
      c(3, 'ACTIVITY_FIXED_TIME', { activityId: 3, day: 'Çarşamba', hour: 6 }),
      c(4, 'TEACHER_MAX_HOURS_DAILY', { teacher: 'A', maxHours: 5 }),
    ];
    expect(planFixedTimeLocksBeyondHour(list, 5).sort()).toEqual([2, 3]);
  });

  it('hepsi aralık içindeyse boş döner', () => {
    const list = [c(1, 'ACTIVITY_FIXED_TIME', { hour: 2 })];
    expect(planFixedTimeLocksBeyondHour(list, 8)).toEqual([]);
  });

  it('hour sayısal değilse yok sayar (çökmez)', () => {
    const list = [c(1, 'ACTIVITY_FIXED_TIME', { hour: '8' }), c(2, 'ACTIVITY_FIXED_TIME', {})];
    expect(planFixedTimeLocksBeyondHour(list, 5)).toEqual([]);
  });
});

// ===========================================================================
// Tur-9 #4 — gün kaldırınca o güne bağlı kısıtlar temizlenmeli.
// ===========================================================================
describe('planConstraintsForRemovedDays', () => {
  it('tek-gün sil, days[]/slots[] temizle, boşalan sil, ilgisize dokunma', () => {
    const list = [
      c(1, 'ACTIVITY_FIXED_TIME', { day: 'Cuma', hour: 3 }),
      c(2, 'SUBJECT_NOT_ON_DAY', { subject: 'Mat', days: ['Cuma', 'Salı'] }),
      c(3, 'TEACHER_NOT_AVAILABLE', { teacher: 'A', slots: [{ day: 'Cuma', hour: 1 }, { day: 'Pazartesi', hour: 1 }] }),
      c(4, 'CLASS_NOT_AVAILABLE', { class: '9A', slots: [{ day: 'Cuma', hour: 1 }] }),
      c(5, 'TEACHER_MAX_HOURS_DAILY', { teacher: 'A', maxHours: 5 }),
    ];
    const plan = planConstraintsForRemovedDays(list, ['Cuma']);
    expect(plan.deleteIds.sort()).toEqual([1, 4]); // tek-gün + tüm-slot-gitti
    const updById = new Map(plan.updates.map((u) => [u.id, u.params]));
    expect((updById.get(2) as { days: string[] }).days).toEqual(['Salı']);
    expect((updById.get(3) as { slots: unknown[] }).slots).toEqual([{ day: 'Pazartesi', hour: 1 }]);
    expect(updById.has(5)).toBe(false); // ilgisiz
  });

  it('kaldırılan gün hiçbir kısıtta yoksa boş plan', () => {
    const list = [c(1, 'ACTIVITY_FIXED_TIME', { day: 'Pazartesi', hour: 3 })];
    const plan = planConstraintsForRemovedDays(list, ['Cumartesi']);
    expect(plan.deleteIds).toEqual([]);
    expect(plan.updates).toEqual([]);
  });

  it('boş removedNames → hiç iş yok', () => {
    const list = [c(1, 'ACTIVITY_FIXED_TIME', { day: 'Cuma', hour: 3 })];
    const plan = planConstraintsForRemovedDays(list, []);
    expect(plan.deleteIds).toEqual([]);
    expect(plan.updates).toEqual([]);
  });

  it('girdi listesini mutasyona uğratmaz (saf)', () => {
    const orig = c(1, 'SUBJECT_NOT_ON_DAY', { subject: 'Mat', days: ['Cuma', 'Salı'] });
    planConstraintsForRemovedDays([orig], ['Cuma']);
    expect((orig.params as { days: string[] }).days).toEqual(['Cuma', 'Salı']); // değişmedi
  });

  it('gün adı eşleşmesi büyük/küçük harf duyarsız (trim+lowercase)', () => {
    const list = [c(1, 'ACTIVITY_FIXED_TIME', { day: 'Cuma', hour: 3 })];
    expect(planConstraintsForRemovedDays(list, ['  cuma ']).deleteIds).toEqual([1]);
  });
});

// ===========================================================================
// Tur-10 #3 — entity rename, ada-göre referans veren kısıtları YENİ ada cascade etmeli
// (yoksa kısıt FET-build'de bilinmeyen-ad yüzünden sessizce skip ediliyordu).
// ===========================================================================
describe('planConstraintRename', () => {
  it('scalar alan (teacher) eski addan yeni ada güncellenir', () => {
    const list = [
      c(1, 'TEACHER_NOT_AVAILABLE', { teacher: 'Ahmet Yılmaz', slots: [] }),
      c(2, 'TEACHER_MAX_DAYS_PER_WEEK', { teacher: 'Ayşe', maxDays: 4 }),
    ];
    const upd = planConstraintRename(list, 'teacher', 'Ahmet Yılmaz', 'Ahmet Y.');
    expect(upd).toHaveLength(1);
    expect(upd[0]!.id).toBe(1);
    expect((upd[0]!.params as { teacher: string }).teacher).toBe('Ahmet Y.');
  });

  it('room: hem scalar params.room hem params.rooms[] güncellenir', () => {
    const list = [
      c(1, 'SUBJECT_PREFERRED_ROOM', { subject: 'Mat', room: '101' }),
      c(2, 'SUBJECT_PREFERRED_ROOMS', { subject: 'Mat', rooms: ['101', '102'] }),
      c(3, 'SUBJECT_PREFERRED_ROOM', { subject: 'Fiz', room: '103' }),
    ];
    const upd = planConstraintRename(list, 'room', '101', 'A-101');
    const byId = new Map(upd.map((u) => [u.id, u.params]));
    expect((byId.get(1) as { room: string }).room).toBe('A-101');
    expect((byId.get(2) as { rooms: string[] }).rooms).toEqual(['A-101', '102']);
    expect(byId.has(3)).toBe(false); // 103 etkilenmez
  });

  it('eski ad == yeni ad → boş (no-op)', () => {
    const list = [c(1, 'TEACHER_NOT_AVAILABLE', { teacher: 'Ahmet' })];
    expect(planConstraintRename(list, 'teacher', 'Ahmet', 'Ahmet')).toEqual([]);
  });

  it('eşleşme Türkçe-duyarsız (deburr); girdiyi mutasyona uğratmaz', () => {
    const orig = c(1, 'TEACHER_NOT_AVAILABLE', { teacher: 'Şükrü' });
    const upd = planConstraintRename([orig], 'teacher', 'şükrü', 'Yeni');
    expect(upd).toHaveLength(1);
    expect((orig.params as { teacher: string }).teacher).toBe('Şükrü'); // değişmedi
  });
});

// ===========================================================================
// Tur-8 #2/#3 — merge/split mevcut aktiviteyi sessizce ezmemeli.
// ===========================================================================
describe('decideGroupActivity', () => {
  it('mevcut yoksa → create', () => {
    expect(decideGroupActivity(null, 4)).toEqual({ kind: 'create' });
  });
  it('mevcut + saat aynı → reuse (mevcut kayıt korunur)', () => {
    expect(decideGroupActivity({ id: 7, weeklyHours: 4 }, 4)).toEqual({ kind: 'reuse', id: 7 });
  });
  it('mevcut + saat farklı → conflict (sessiz ezme yerine reddet)', () => {
    expect(decideGroupActivity({ id: 7, weeklyHours: 4 }, 2)).toEqual({ kind: 'conflict', existingHours: 4 });
  });
});
