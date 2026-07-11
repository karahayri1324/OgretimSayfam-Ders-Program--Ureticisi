import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { buildFetXml } from '../electron/fet/xml-builder.js';
import {
  clampRequired100Weight,
  REQUIRES_100_WEIGHT_TAGS,
} from '../electron/fet/constraints/requires-100-weight.js';
import { normalizePageRoute, VALID_PAGE_SLUGS } from '../src/lib/pages.js';
import type { SchoolBundle } from '../electron/fet/types.js';
import type { Activity, Constraint } from '../src/lib/types.js';

const FET_BIN = '/usr/bin/fet-cl';
const hasFet = fs.existsSync(FET_BIN);

function constraint(type: string, params: Record<string, unknown>, weight = 100): Constraint {
  return {
    id: Math.floor(weight) + Object.keys(params).length,
    type: type as Constraint['type'],
    weight,
    active: true,
    source: 'ai',
    aiMessageId: null,
    createdAt: '',
    notes: null,
    params,
  };
}

// İki sınıf (5A, 5B), her sınıfta Beden dersi. splitGroupId ile ne kurulduğunu opsiyon belirler.
function mkBundle(activities: Activity[], constraints: Constraint[] = []): SchoolBundle {
  return {
    institutionName: 'Test Okulu',
    days: [
      { id: 1, name: 'Pazartesi', orderIndex: 0 },
      { id: 2, name: 'Salı', orderIndex: 1 },
      { id: 3, name: 'Çarşamba', orderIndex: 2 },
      { id: 4, name: 'Perşembe', orderIndex: 3 },
      { id: 5, name: 'Cuma', orderIndex: 4 },
    ],
    hours: [
      { id: 1, name: '1. Ders', orderIndex: 0, startTime: null, endTime: null },
      { id: 2, name: '2. Ders', orderIndex: 1, startTime: null, endTime: null },
      { id: 3, name: '3. Ders', orderIndex: 2, startTime: null, endTime: null },
      { id: 4, name: '4. Ders', orderIndex: 3, startTime: null, endTime: null },
    ],
    dayHours: undefined,
    subjects: [
      { id: 1, name: 'Beden', shortCode: 'BED', color: null, notes: null },
      { id: 2, name: 'Matematik', shortCode: 'MAT', color: null, notes: null },
    ],
    teachers: [
      { id: 1, name: 'Ali Veli', weeklyTargetHours: 0, notes: null, subjectIds: [1, 2] },
      { id: 2, name: 'Veli Ali', weeklyTargetHours: 0, notes: null, subjectIds: [1, 2] },
    ],
    classes: [
      { id: 1, yearId: 1, name: '5A', studentCount: 30, homeRoomId: null },
      { id: 2, yearId: 1, name: '5B', studentCount: 30, homeRoomId: null },
    ],
    years: [{ id: 1, name: '5', orderIndex: 0 }],
    rooms: [
      { id: 1, name: '101', capacity: 40, building: null, notes: null },
      { id: 2, name: '102', capacity: 40, building: null, notes: null },
    ],
    activities,
    constraints,
  };
}

function act(
  id: number,
  classId: number,
  subjectId: number,
  splitGroupId: number | null,
  teacherId = 1,
): Activity {
  return { id, classId, subjectId, teacherId, weeklyHours: 2, blockDuration: 1, notes: null, splitGroupId };
}

function runFet(xml: string, timeLimitSec = 6): { status: number | null; stdout: string; stderr: string } {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dpo-r11-'));
  const inputPath = path.join(tmp, 'in.fet');
  fs.writeFileSync(inputPath, xml, 'utf-8');
  const outDir = path.join(tmp, 'out');
  fs.mkdirSync(outDir);
  const r = spawnSync(
    FET_BIN,
    [
      `--inputfile=${inputPath}`,
      `--outputdir=${outDir}`,
      '--language=en_US',
      `--timelimitseconds=${timeLimitSec}`,
      '--htmllevel=2',
    ],
    { encoding: 'utf-8', timeout: (timeLimitSec + 30) * 1000 },
  );
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

// ============================================================================
// A1: Yetim / cross-class split grubu XML savunma katmanı
// ============================================================================
describe('A1 — 1 üyeli split grubu tanımsız _gN üretmez', () => {
  it('sınıf-içi 1 üyeli yetim grup (silme sonrası) tam sınıf adına düşer, _g1 referansı yok', () => {
    // 5A Beden yalnız 1 üyeli split grup (2. üye branş/sınıf silinmiş gibi).
    const xml = buildFetXml(mkBundle([act(1, 1, 1, 7)])).xml;
    expect(xml).not.toContain('5A_g1');
    expect(xml).toContain('<Students>5A</Students>');
  });

  it('sınıflar-arası merge (5A+5B tek grup, her sınıfta 1 üye) tanımsız _g1 üretmez', () => {
    // Cross-class merge: iki farklı sınıfın aktivitesi aynı split_group_id'de → her sınıfta 1 üye.
    const xml = buildFetXml(mkBundle([act(1, 1, 1, 9, 1), act(2, 2, 1, 9, 2)])).xml;
    expect(xml).not.toContain('5A_g1');
    expect(xml).not.toContain('5B_g1');
    expect(xml).toContain('<Students>5A</Students>');
    expect(xml).toContain('<Students>5B</Students>');
  });

  it.runIf(hasFet)('gerçek fet-cl cross-class merge XMLini KABUL eder (eskiden reddediyordu)', () => {
    // Her sınıf farklı öğretmenle (aynı saatte olabilsinler); asıl fix: tanımsız Students seti yok.
    const xml = buildFetXml(mkBundle([act(1, 1, 1, 9, 1), act(2, 2, 1, 9, 2)])).xml;
    const r = runFet(xml);
    // Eskiden: "Students set 5A_g1 was not found ... aborting". Fix'le bu hata artık YOK.
    expect(r.stdout + r.stderr).not.toMatch(/was not found in the students sets list/i);
    expect(r.status).toBe(0);
  });

  it('sağlıklı sınıf-içi 2 üyeli split hâlâ _g1/_g2 üretir (regresyon yok)', () => {
    // 5A'da iki branş aynı grupta (gerçek bölünmüş ders).
    const xml = buildFetXml(mkBundle([act(1, 1, 1, 3), act(2, 1, 2, 3)])).xml;
    expect(xml).toContain('5A_g1');
    expect(xml).toContain('5A_g2');
  });
});

// ============================================================================
// A2: FET %100-zorunlu kısıt tiplerinde weight clamp
// ============================================================================
describe('A2 — REQUIRES_100_WEIGHT ailesinde <100 ağırlık 100e clamplenir', () => {
  it('clampRequired100Weight tek noktada 100e sabitler ve yorum ekler', () => {
    const node = { tag: 'ConstraintTeacherNotAvailableTimes', body: { Weight_Percentage: 80, Comments: '' } };
    expect(clampRequired100Weight(node)).toBe(true);
    expect(node.body.Weight_Percentage).toBe(100);
    expect(String(node.body.Comments)).toMatch(/80→100 sabitlendi/);
  });

  it('liste-dışı tag (örn. TeacherMaxHoursDaily = yalnız uyarı) dokunulmaz', () => {
    const node = { tag: 'ConstraintTeacherMaxHoursDaily', body: { Weight_Percentage: 80 } };
    expect(clampRequired100Weight(node)).toBe(false);
    expect(node.body.Weight_Percentage).toBe(80);
  });

  it('buildFetXml, farklı %100-zorunlu ailelerde <100 ağırlığı XMLe 100 yazar', () => {
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ['TEACHER_NOT_AVAILABLE', { teacher: 'Ali Veli', slots: [{ day: 'Pazartesi', hour: 1 }] }, 'ConstraintTeacherNotAvailableTimes'],
      ['TEACHER_MAX_GAPS_PER_WEEK', { teacher: 'Ali Veli', maxGaps: 2 }, 'ConstraintTeacherMaxGapsPerWeek'],
      ['BREAK_TIMES', { slots: [{ day: 'Pazartesi', hour: 4 }] }, 'ConstraintBreakTimes'],
    ];
    for (const [type, params, tag] of cases) {
      const xml = buildFetXml(mkBundle([act(1, 1, 1, null)], [constraint(type, params, 75)])).xml;
      const re = new RegExp(`<${tag}>[\\s\\S]*?<Weight_Percentage>(\\d+)</Weight_Percentage>`);
      const m = re.exec(xml);
      expect(m, `${tag} XMLde yok`).toBeTruthy();
      expect(m![1], `${tag} ağırlığı 100 değil`).toBe('100');
    }
  });

  it('REQUIRES_100_WEIGHT kümesi FET binary ground-truth ile örtüşen tag adları içerir', () => {
    expect(REQUIRES_100_WEIGHT_TAGS.has('ConstraintBreakTimes')).toBe(true);
    expect(REQUIRES_100_WEIGHT_TAGS.has('ConstraintStudentsSetNotAvailableTimes')).toBe(true);
    expect(REQUIRES_100_WEIGHT_TAGS.has('ConstraintActivityEndsStudentsDay')).toBe(true);
  });
});

// ============================================================================
// navigate_to sayfa whitelist (saf)
// ============================================================================
describe('normalizePageRoute — geçersiz sayfa reddedilir', () => {
  it('geçerli slug /-önekli rotaya çevrilir (büyük/küçük harf, /-önek toleranslı)', () => {
    expect(normalizePageRoute('Timetable')).toBe('/timetable');
    expect(normalizePageRoute('/SCHEDULE')).toBe('/schedule');
    for (const s of VALID_PAGE_SLUGS) expect(normalizePageRoute(s)).toBe(`/${s}`);
  });

  it('bilinmeyen/boş sayfa null döner (boş ekran/takılma yerine)', () => {
    expect(normalizePageRoute('haydi-hacker')).toBeNull();
    expect(normalizePageRoute('')).toBeNull();
    expect(normalizePageRoute(undefined)).toBeNull();
    expect(normalizePageRoute('../../etc/passwd')).toBeNull();
  });
});
