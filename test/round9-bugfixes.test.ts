// Tur-9 bug avı regresyon testleri (saf/electron-bağımsız fix'ler).
// NOT: set_hours_per_day kilit-budama (#2) ve delete_day/set_days gün-prune (#4) constraintsRepo
// (electron-bağımlı DB) gerektirdiğinden burada birim-test edilmiyor; ortak constraint-maintenance
// modülüne çıkarıldılar ve kod-okuması + adversarial ile teyit edildi.

import { describe, it, expect } from 'vitest';
import { shiftClock, parseHM, shiftsFor, adjustOverflows } from '../electron/utils/clock';
import { buildFetXml } from '../electron/fet/xml-builder';
import type { SchoolBundle } from '../electron/fet/types';

// ===========================================================================
// #1 — shiftClock gün-içi saatte ertesi güne SARMAMALI (eski %1440 bug'ı), [00:00,23:59] clamp.
// ===========================================================================
describe('#1 clock — shiftClock clamp (gece-yarısı sarması yok)', () => {
  it('ileri kaydırma gün sonunu aşmaz (23:30 +60 → 23:59, ESKİ bug: 00:30)', () => {
    expect(shiftClock('23:30', 60)).toBe('23:59');
  });
  it('geri kaydırma 00:00 altına düşmez (00:20 -60 → 00:00)', () => {
    expect(shiftClock('00:20', -60)).toBe('00:00');
  });
  it('normal kaydırma doğru (08:00 +95 → 09:35)', () => {
    expect(shiftClock('08:00', 95)).toBe('09:35');
  });
  it('biçimsiz girdi olduğu gibi döner', () => {
    expect(shiftClock('abc', 10)).toBe('abc');
  });
  it('parseHM', () => {
    expect(parseHM('09:05')).toBe(545);
    expect(parseHM(null)).toBeNull();
    expect(parseHM('xx')).toBeNull();
  });
});

// ===========================================================================
// #1 (guard) — bulkAdjustBreaks/extendBreaks yazmadan önce taşma/çakışmayı yakalamalı.
// ===========================================================================
describe('#1 clock — adjustOverflows guard (yazmadan önce taşma/çakışma)', () => {
  const rows = (arr: Array<[string, string]>) =>
    arr.map(([s, e], i) => ({ orderIndex: i, startTime: s, endTime: e }));

  it('shiftsFor: break modu kümülatif (i ile çarpan), start/end modu sabit (çarpan 1)', () => {
    expect(shiftsFor(3, 10, 'break')).toEqual({ startShift: 30, endShift: 30 });
    expect(shiftsFor(3, 10, 'start')).toEqual({ startShift: 10, endShift: 0 });
    expect(shiftsFor(3, 10, 'end')).toEqual({ startShift: 0, endShift: 10 });
  });

  it('geç dersi gün sonunu aşıran kümülatif kaydırma → taşma (true)', () => {
    // index 2 → +120 dk; 23:00 → 25:00 (geçersiz)
    const r = rows([['08:00', '08:40'], ['09:00', '09:40'], ['23:00', '23:40']]);
    expect(adjustOverflows(r, 60, 'break')).toBe(true);
  });

  it('negatif kaydırma 00:00 altına düşürüyorsa → taşma (true)', () => {
    const r = rows([['00:10', '00:50'], ['01:00', '01:40']]);
    expect(adjustOverflows(r, -60, 'break')).toBe(true);
  });

  it('makul kaydırma sorunsuz (false)', () => {
    const r = rows([['08:00', '08:40'], ['09:00', '09:40'], ['10:00', '10:40']]);
    expect(adjustOverflows(r, 5, 'break')).toBe(false);
  });

  it('saatsiz (null) satırlar taşma üretmez', () => {
    const r = [{ orderIndex: 0, startTime: null, endTime: null }];
    expect(adjustOverflows(r, 600, 'break')).toBe(false);
  });
});

// ===========================================================================
// #3 — appendHomeRoomConstraints, ctx (xmlSafe) adlarını kullanmalı; raw kontrol karakterli ad
// XML'e sızmamalı (Students_List/Rooms_List ile byte-eş kalmalı).
// ===========================================================================
function bundleWithControlChars(): SchoolBundle {
  return {
    institutionName: 'Tur9',
    days: [{ id: 1, name: 'Pazartesi', orderIndex: 0 }],
    hours: [{ id: 1, name: '1. Ders', orderIndex: 0, startTime: null, endTime: null }],
    subjects: [{ id: 1, name: 'Matematik', shortCode: 'MAT', color: null, notes: null }],
    teachers: [{ id: 1, name: 'Ahmet', weeklyTargetHours: 0, notes: null, subjectIds: [1] }],
    years: [{ id: 1, name: '9', orderIndex: 0 }],
    // Sınıf ve oda adında XML-yasak kontrol karakteri (0x01):
    classes: [{ id: 1, yearId: 1, name: '9AB', studentCount: 20, homeRoomId: 1 }],
    rooms: [{ id: 1, name: '101', capacity: 40, building: null, notes: null }],
    activities: [{ id: 1, classId: 1, subjectId: 1, teacherId: 1, weeklyHours: 1, blockDuration: 1, notes: null }],
    constraints: [],
  };
}

describe('#3 xml-builder — home-room kısıtı sanitize edilmiş (ctx) ad kullanır', () => {
  it('kontrol karakterli sınıf/oda adı XML\'e sızmaz; auto home-room sanitize ad yazar', () => {
    const { xml } = buildFetXml(bundleWithControlChars());
    // Hiçbir yerde ham kontrol karakteri olmamalı (raw ad sızması = FET dosyayı reddeder):
    expect(xml.includes('')).toBe(false);
    // Auto ana-derslik kısıtı üretilmiş olmalı:
    expect(xml).toContain('ConstraintStudentsSetHomeRoom');
    expect(xml).toContain('Ana derslik (auto)');
    // Sanitize edilmiş adlar hem listelerde hem kısıtta tutarlı görünür:
    expect(xml).toContain('9AB');
    expect(xml).toContain('101');
  });
});
