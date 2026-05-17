/**
 * Split activities + per-day hours kabul testleri.
 *
 * - Split: aynı split_group_id'li iki aktivitenin FET XML'inde
 *   ConstraintActivitiesSameStartingTime ile birleştirildiğini doğrular ve
 *   üretilen timetable'da gerçekten aynı saatte olduklarını ispatlar.
 * - Per-day: bir gün için 5 saat, diğerleri 6 saat verildiğinde global
 *   Hours_List=6 olur ve kısa günün 6. saatine ConstraintBreakTimes
 *   eklenir; üretilen timetable o slot'ta hiç aktivite barındırmaz.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';

import { buildFetXml } from '../electron/fet/xml-builder';
import { parseTimetable } from '../electron/fet/xml-parser';
import type { SchoolBundle } from '../electron/fet/types';

const haveFet = (() => {
  try {
    execSync('which fet-cl', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
})();

function baseBundle(): SchoolBundle {
  return {
    institutionName: 'Split & PerDay Test Lisesi',
    days: [
      { id: 1, name: 'Pazartesi', orderIndex: 0 },
      { id: 2, name: 'Salı', orderIndex: 1 },
      { id: 3, name: 'Çarşamba', orderIndex: 2 },
      { id: 4, name: 'Perşembe', orderIndex: 3 },
      { id: 5, name: 'Cuma', orderIndex: 4 },
    ],
    hours: Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      name: `${i + 1}. Ders`,
      orderIndex: i,
      startTime: null,
      endTime: null,
    })),
    subjects: [
      { id: 1, name: 'Matematik', shortCode: 'MAT', color: null, notes: null },
      { id: 2, name: 'Görsel Sanatlar', shortCode: 'GS', color: null, notes: null },
      { id: 3, name: 'Müzik', shortCode: 'MUZ', color: null, notes: null },
    ],
    teachers: [
      { id: 1, name: 'Ahmet Yılmaz', weeklyTargetHours: 0, notes: null, subjectIds: [1] },
      { id: 2, name: 'Ayşe Demir', weeklyTargetHours: 0, notes: null, subjectIds: [2] },
      { id: 3, name: 'Hasan Kaya', weeklyTargetHours: 0, notes: null, subjectIds: [3] },
    ],
    classes: [
      { id: 1, yearId: 1, name: '9A', studentCount: 30, homeRoomId: null },
    ],
    years: [{ id: 1, name: '9', orderIndex: 0 }],
    rooms: [
      { id: 1, name: '101', capacity: 30, building: null, notes: null },
      { id: 2, name: 'Atölye', capacity: 30, building: null, notes: null },
      { id: 3, name: 'Müzik Odası', capacity: 30, building: null, notes: null },
    ],
    activities: [
      // 9A Matematik: 5 saat
      { id: 1, classId: 1, subjectId: 1, teacherId: 1, weeklyHours: 5, blockDuration: 1, notes: null, splitGroupId: null },
      // 9A Görsel Sanatlar: 1 saat — split (eş)
      { id: 2, classId: 1, subjectId: 2, teacherId: 2, weeklyHours: 1, blockDuration: 1, notes: null, splitGroupId: 1 },
      // 9A Müzik: 1 saat — split (eş)
      { id: 3, classId: 1, subjectId: 3, teacherId: 3, weeklyHours: 1, blockDuration: 1, notes: null, splitGroupId: 1 },
    ],
    constraints: [],
    dayHours: [],
  };
}

describe('buildFetXml — split activities', () => {
  it('aynı split_group_id\'li aktiviteler için ConstraintActivitiesSameStartingTime üretir', () => {
    const out = buildFetXml(baseBundle());
    expect(out.xml).toContain('ConstraintActivitiesSameStartingTime');
    // Görsel sanatlar (DB id=2) ve müzik (DB id=3) FET id'leri:
    const visualIds = out.fetActivityIdsByActivity.get(2) ?? [];
    const musicIds = out.fetActivityIdsByActivity.get(3) ?? [];
    expect(visualIds.length).toBeGreaterThan(0);
    expect(musicIds.length).toBeGreaterThan(0);
  });

  it('split bağı olmayan aktivitelerde same-time constraint üretmez', () => {
    const b = baseBundle();
    b.activities[1]!.splitGroupId = null;
    b.activities[2]!.splitGroupId = null;
    const out = buildFetXml(b);
    expect(out.xml).not.toContain('ConstraintActivitiesSameStartingTime');
  });
});

describe('buildFetXml — per-day hours (kısa günler)', () => {
  it('kısa günler için ConstraintBreakTimes üretir', () => {
    const b = baseBundle();
    // Cuma 5 saat, diğerleri 6 (global). Cuma için day_hours: 5 satır.
    b.dayHours = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      dayId: 5, // Cuma
      orderIndex: i,
      name: `${i + 1}. Ders`,
      startTime: null,
      endTime: null,
    }));
    const out = buildFetXml(b);
    expect(out.xml).toContain('ConstraintBreakTimes');
    // 6. saatin Cuma için bloklandığını gör (Hour adı 6. Ders)
    expect(out.xml).toMatch(/<Day>Cuma<\/Day>\s*<Hour>6\. Ders<\/Hour>/);
  });

  it('global ile tüm günler aynı saat sayısı → break time eklenmez', () => {
    const out = buildFetXml(baseBundle());
    // dayHours boş → break time auto eklenmemeli
    expect(out.xml).not.toContain('Per-day kısa gün boş saatleri');
  });

  it('daha uzun bir gün global\'i aşıyorsa Hours_List o uzunluğa yetişir', () => {
    const b = baseBundle();
    // Pazartesi 8 saat (global 6 saat) — Hours_List 8 olmalı
    b.dayHours = Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      dayId: 1, // Pazartesi
      orderIndex: i,
      name: `${i + 1}. Ders`,
      startTime: null,
      endTime: null,
    }));
    const out = buildFetXml(b);
    expect(out.xml).toMatch(/<Number_of_Hours>8<\/Number_of_Hours>/);
    // Salı/Çarşamba/Perşembe/Cuma için 7,8. saatler kapalı olmalı
    expect(out.xml).toMatch(/<Day>Salı<\/Day>\s*<Hour>7\. Ders<\/Hour>/);
    expect(out.xml).toMatch(/<Day>Cuma<\/Day>\s*<Hour>8\. Ders<\/Hour>/);
  });
});

describe.skipIf(!haveFet)('FET entegrasyon — split + per-day', () => {
  it('split aktiviteler aynı slotta çıkar', async () => {
    const bundle = baseBundle();
    const out = buildFetXml(bundle);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dpo-split-'));
    const inFile = path.join(tmp, 'input.fet');
    const outDir = path.join(tmp, 'out');
    fs.mkdirSync(outDir);
    fs.writeFileSync(inFile, out.xml, 'utf-8');

    const r = spawnSync('/usr/bin/fet-cl', [
      `--inputfile=${inFile}`,
      `--outputdir=${outDir}`,
      '--language=en_US',
      '--timelimitseconds=30',
      '--htmllevel=2',
    ], { encoding: 'utf-8', timeout: 60_000 });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Simulation successful');

    const slots = await parseTimetable(outDir, {
      bundle,
      fetActivityIdsByActivity: out.fetActivityIdsByActivity,
    });
    const visual = slots.find(s => s.subjectName === 'Görsel Sanatlar');
    const music = slots.find(s => s.subjectName === 'Müzik');
    expect(visual).toBeTruthy();
    expect(music).toBeTruthy();
    expect(visual!.dayIndex).toBe(music!.dayIndex);
    expect(visual!.hourIndex).toBe(music!.hourIndex);
  }, 90_000);

  it('per-day kısa gün: o saatte hiç aktivite olmaz', async () => {
    const bundle = baseBundle();
    // Cuma 5 saat (global 6) — Cuma 6. saat kapalı olmalı.
    bundle.dayHours = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      dayId: 5,
      orderIndex: i,
      name: `${i + 1}. Ders`,
      startTime: null,
      endTime: null,
    }));
    const out = buildFetXml(bundle);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dpo-perday-'));
    const inFile = path.join(tmp, 'input.fet');
    const outDir = path.join(tmp, 'out');
    fs.mkdirSync(outDir);
    fs.writeFileSync(inFile, out.xml, 'utf-8');

    const r = spawnSync('/usr/bin/fet-cl', [
      `--inputfile=${inFile}`,
      `--outputdir=${outDir}`,
      '--language=en_US',
      '--timelimitseconds=30',
      '--htmllevel=2',
    ], { encoding: 'utf-8', timeout: 60_000 });
    expect(r.status).toBe(0);

    const slots = await parseTimetable(outDir, {
      bundle,
      fetActivityIdsByActivity: out.fetActivityIdsByActivity,
    });
    // Cuma (dayIndex=4) 6. saat (hourIndex=5) hiç dolmamalı.
    const fridayLast = slots.filter(s => s.dayIndex === 4 && s.hourIndex === 5);
    expect(fridayLast.length).toBe(0);
  }, 90_000);
});
