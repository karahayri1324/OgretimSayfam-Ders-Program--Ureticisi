
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { buildFetXml } from '../electron/fet/xml-builder';
import { parseTimetable } from '../electron/fet/xml-parser';
import type { SchoolBundle } from '../electron/fet/types';

function fetBinaryAvailable(): string | null {
  const candidates = [
    '/usr/bin/fet-cl',
    path.resolve(process.cwd(), 'resources', 'bin', 'linux', 'fet-cl'),
  ];
  for (const c of candidates) {
    try {
      fs.accessSync(c, fs.constants.F_OK | fs.constants.X_OK);
      return c;
    } catch {
    }
  }
  return null;
}

function buildSchoolForFullFlow(): SchoolBundle {
  return {
    institutionName: 'Full-Flow Test Lisesi',
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
    dayHours: [],
    subjects: [
      { id: 1, name: 'Matematik', shortCode: 'MAT', color: '#3b82f6', notes: null },
      { id: 2, name: 'Türkçe', shortCode: 'TÜR', color: '#f59e0b', notes: null },
      { id: 3, name: 'Beden Eğitimi', shortCode: 'BED', color: '#ef4444', notes: null },
    ],
    teachers: [
      { id: 1, name: 'Ahmet Yılmaz', weeklyTargetHours: 0, notes: null, subjectIds: [1] },
      { id: 2, name: 'Ayşe Demir', weeklyTargetHours: 0, notes: null, subjectIds: [2, 3] },
    ],
    years: [{ id: 1, name: '9. Sınıf', orderIndex: 0 }],
    classes: [
      { id: 1, yearId: 1, name: '9A', studentCount: 30, homeRoomId: null },
      { id: 2, yearId: 1, name: '9B', studentCount: 30, homeRoomId: null },
      { id: 3, yearId: null, name: '10A', studentCount: 25, homeRoomId: null },
    ],
    rooms: [
      { id: 1, name: '101', capacity: 30, building: null, notes: null },
      { id: 2, name: '102', capacity: 30, building: null, notes: null },
    ],
    activities: [
      { id: 1, classId: 1, subjectId: 1, teacherId: 1, weeklyHours: 4, blockDuration: 1, notes: null },
      { id: 2, classId: 1, subjectId: 2, teacherId: 2, weeklyHours: 3, blockDuration: 1, notes: null },
      { id: 3, classId: 2, subjectId: 1, teacherId: 1, weeklyHours: 4, blockDuration: 1, notes: null },
      { id: 4, classId: 2, subjectId: 2, teacherId: 2, weeklyHours: 3, blockDuration: 1, notes: null },
      { id: 5, classId: 3, subjectId: 3, teacherId: 2, weeklyHours: 2, blockDuration: 1, notes: null },
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

describe('Full-flow E2E: boş veri → XML → FET → doğrulama', () => {
  const fetBin = fetBinaryAvailable();

  (fetBin ? it : it.skip)(
    '3 ders + 3 sınıf + 2 derslik + 2 öğretmen + 5 activity + 2 constraint pipeline',
    async () => {
      expect(fetBin).toBeTruthy();
      const bundle = buildSchoolForFullFlow();

      expect(bundle.subjects.length).toBe(3);
      expect(bundle.classes.length).toBe(3);
      expect(bundle.rooms.length).toBe(2);
      expect(bundle.teachers.length).toBe(2);
      expect(bundle.activities.length).toBe(5);
      expect(bundle.constraints.length).toBe(2);

      const { xml, fetActivityIdsByActivity, skipped } = buildFetXml(bundle);
      expect(skipped.length).toBe(0);
      expect(xml).toContain('ConstraintTeacherNotAvailableTimes');
      expect(xml).toContain('ConstraintActivityEndsStudentsDay');
      expect(xml).toContain('Ayşe Demir');
      expect(xml).toContain('Beden Eğitimi');

      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dpo-full-flow-'));
      const inputPath = path.join(tmp, 'input.fet');
      fs.writeFileSync(inputPath, xml, 'utf-8');
      const outDir = path.join(tmp, 'out');
      fs.mkdirSync(outDir);

      const result = spawnSync(
        fetBin!,
        [
          `--inputfile=${inputPath}`,
          `--outputdir=${outDir}`,
          '--language=tr',
          '--timelimitseconds=60',
          '--htmllevel=2',
        ],
        { encoding: 'utf-8', timeout: 90_000 },
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Simulation successful');
      expect(result.stdout.length).toBeGreaterThan(20);

      const slots = await parseTimetable(outDir, {
        bundle,
        fetActivityIdsByActivity,
      });

      const expectedSlots = bundle.activities.reduce((s, a) => s + a.weeklyHours, 0);
      expect(slots.length).toBe(expectedSlots);

      const ahmetFriday = slots.filter(
        (s) => s.teacherName === 'Ahmet Yılmaz' && s.dayIndex === 4,
      );
      expect(ahmetFriday).toEqual([]);

      const beden = slots.filter((s) => s.subjectName === 'Beden Eğitimi');
      expect(beden.length).toBe(2);
      for (const b of beden) {
        const laterSameDay = slots.filter(
          (s) =>
            s.classId === b.classId &&
            s.dayIndex === b.dayIndex &&
            s.hourIndex > b.hourIndex,
        );
        expect(laterSameDay).toEqual([]);
      }

      for (const a of bundle.activities) {
        const placedCount = slots.filter(
          (s) => s.classId === a.classId && s.subjectId === a.subjectId,
        ).length;
        expect(placedCount).toBe(a.weeklyHours);
      }

      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { }
    },
    120_000,
  );
});
