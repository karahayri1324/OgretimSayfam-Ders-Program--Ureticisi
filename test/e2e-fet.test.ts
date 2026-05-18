import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { buildFetXml } from '../electron/fet/xml-builder';
import { parseTimetable } from '../electron/fet/xml-parser';
import type { SchoolBundle } from '../electron/fet/types';

function makeRealisticSchool(): SchoolBundle {
  return {
    institutionName: 'ÖğretimSayfam Test Lisesi',
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
      { id: 5, name: '5. Ders', orderIndex: 4, startTime: null, endTime: null },
      { id: 6, name: '6. Ders', orderIndex: 5, startTime: null, endTime: null },
    ],
    subjects: [
      { id: 1, name: 'Matematik', shortCode: 'MAT', color: '#3b82f6', notes: null },
      { id: 2, name: 'Fizik', shortCode: 'FİZ', color: '#10b981', notes: null },
      { id: 3, name: 'Türkçe', shortCode: 'TÜR', color: '#f59e0b', notes: null },
      { id: 4, name: 'Beden Eğitimi', shortCode: 'BED', color: '#ef4444', notes: null },
    ],
    teachers: [
      { id: 1, name: 'Ahmet Yılmaz', weeklyTargetHours: 0, notes: null, subjectIds: [1] },
      { id: 2, name: 'Ayşe Demir', weeklyTargetHours: 0, notes: null, subjectIds: [2] },
      { id: 3, name: 'Mehmet Kaya', weeklyTargetHours: 0, notes: null, subjectIds: [3] },
      { id: 4, name: 'Zeynep Çelik', weeklyTargetHours: 0, notes: null, subjectIds: [4] },
    ],
    years: [{ id: 1, name: '9. Sınıf', orderIndex: 0 }],
    classes: [
      { id: 1, yearId: 1, name: '9A', studentCount: 30, homeRoomId: null },
      { id: 2, yearId: 1, name: '9B', studentCount: 28, homeRoomId: null },
    ],
    rooms: [
      { id: 1, name: '101', capacity: 30, building: null, notes: null },
      { id: 2, name: '102', capacity: 30, building: null, notes: null },
    ],
    activities: [
      { id: 1, classId: 1, subjectId: 1, teacherId: 1, weeklyHours: 4, blockDuration: 1, notes: null },
      { id: 2, classId: 1, subjectId: 2, teacherId: 2, weeklyHours: 3, blockDuration: 1, notes: null },
      { id: 3, classId: 1, subjectId: 3, teacherId: 3, weeklyHours: 5, blockDuration: 1, notes: null },
      { id: 4, classId: 1, subjectId: 4, teacherId: 4, weeklyHours: 2, blockDuration: 1, notes: null },
      { id: 5, classId: 2, subjectId: 1, teacherId: 1, weeklyHours: 4, blockDuration: 1, notes: null },
      { id: 6, classId: 2, subjectId: 2, teacherId: 2, weeklyHours: 3, blockDuration: 1, notes: null },
      { id: 7, classId: 2, subjectId: 3, teacherId: 3, weeklyHours: 5, blockDuration: 1, notes: null },
      { id: 8, classId: 2, subjectId: 4, teacherId: 4, weeklyHours: 2, blockDuration: 1, notes: null },
    ],
    constraints: [
      {
        id: 1,
        type: 'TEACHER_NOT_AVAILABLE',
        weight: 100,
        active: true,
        params: {
          teacher: 'Ahmet Yılmaz',
          slots: [
            { day: 'Cuma', hour: 1 },
            { day: 'Cuma', hour: 2 },
            { day: 'Cuma', hour: 3 },
            { day: 'Cuma', hour: 4 },
            { day: 'Cuma', hour: 5 },
            { day: 'Cuma', hour: 6 },
          ],
        },
        source: 'ai',
        aiMessageId: null,
        createdAt: new Date().toISOString(),
        notes: null,
      },
      {
        id: 2,
        type: 'SUBJECT_LAST_HOUR_OF_DAY',
        weight: 100,
        active: true,
        params: { subject: 'Beden Eğitimi', class: null },
        source: 'ai',
        aiMessageId: null,
        createdAt: new Date().toISOString(),
        notes: null,
      },
    ],
  };
}

describe('FET end-to-end pipeline', () => {
  it('builds XML, runs fet-cl, parses result for a realistic school', async () => {
    const bundle = makeRealisticSchool();
    const { xml, fetActivityIdsByActivity } = buildFetXml(bundle);

    expect(xml).toContain('Ahmet Yılmaz');
    expect(xml).toContain('Cuma');
    expect(xml).toContain('Beden Eğitimi');
    expect(xml).toContain('ConstraintTeacherNotAvailableTimes');
    expect(xml).toContain('ConstraintActivityEndsStudentsDay');

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dpo-e2e-'));
    const inputPath = path.join(tmp, 'input.fet');
    fs.writeFileSync(inputPath, xml, 'utf-8');

    const outDir = path.join(tmp, 'out');
    fs.mkdirSync(outDir);

    const result = spawnSync('/usr/bin/fet-cl', [
      `--inputfile=${inputPath}`,
      `--outputdir=${outDir}`,
      '--language=tr',
      '--timelimitseconds=60',
      '--htmllevel=2',
    ], { encoding: 'utf-8', timeout: 90_000 });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Simulation successful');

    const slots = await parseTimetable(outDir, { bundle, fetActivityIdsByActivity });
    expect(slots.length).toBeGreaterThan(0);

    const ahmetFriday = slots.filter(
      (s) => s.teacherName === 'Ahmet Yılmaz' && s.dayIndex === 4,
    );
    expect(ahmetFriday.length).toBe(0);

    const bedenSlots = slots.filter((s) => s.subjectName === 'Beden Eğitimi');
    expect(bedenSlots.length).toBeGreaterThan(0);
    for (const b of bedenSlots) {
      const laterSameClassSameDay = slots.filter(
        (s) =>
          s.classId === b.classId &&
          s.dayIndex === b.dayIndex &&
          s.hourIndex > b.hourIndex,
      );
      expect(laterSameClassSameDay).toEqual([]);
    }
  }, 120_000);
});
