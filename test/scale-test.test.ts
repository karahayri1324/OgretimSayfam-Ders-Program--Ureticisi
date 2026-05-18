import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { buildFetXml } from '../electron/fet/xml-builder';
import { parseTimetable } from '../electron/fet/xml-parser';
import type { SchoolBundle } from '../electron/fet/types';

function makeLargeSchool(): SchoolBundle {
  const days = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'].map(
    (name, i) => ({ id: i + 1, name, orderIndex: i }),
  );
  const hours = Array.from({ length: 8 }, (_, i) => ({
    id: i + 1,
    name: `${i + 1}. Ders`,
    orderIndex: i,
    startTime: null,
    endTime: null,
  }));

  const subjectNames = [
    'Matematik', 'Geometri', 'Fizik', 'Kimya', 'Biyoloji',
    'Türk Dili ve Edebiyatı', 'Tarih', 'Coğrafya', 'Felsefe',
    'İngilizce', 'Almanca', 'Din Kültürü', 'Beden Eğitimi',
    'Görsel Sanatlar',
  ];
  const subjects = subjectNames.map((name, i) => ({
    id: i + 1, name, shortCode: null, color: null, notes: null,
  }));

  const subjectHours: Record<string, number> = {
    'Matematik': 6, 'Geometri': 2, 'Fizik': 3, 'Kimya': 3, 'Biyoloji': 3,
    'Türk Dili ve Edebiyatı': 5, 'Tarih': 2, 'Coğrafya': 2, 'Felsefe': 2,
    'İngilizce': 4, 'Almanca': 2, 'Din Kültürü': 1, 'Beden Eğitimi': 2,
    'Görsel Sanatlar': 1,
  };

  const teacherNames = [
    'Ahmet Yılmaz', 'Mehmet Kaya', 'Mustafa Demir', 'Ali Şahin',
    'Hasan Öztürk', 'Hüseyin Çelik', 'Osman Özdemir', 'Yusuf Arslan',
    'İbrahim Aydın', 'Murat Doğan', 'Süleyman Çetin',
    'Selim Erdoğan', 'Halil Koç', 'Ramazan Kılıç', 'Kadir Kurt',
    'Ayşe Demir', 'Fatma Aksoy', 'Zeynep Akın', 'Hatice Polat',
    'Emine Tunç', 'Hülya Yalçın', 'Sevgi Ünal',
    'Şule Ergin', 'Esra Korkmaz', 'Nesrin Bayrak', 'Pınar Karaca',
    'Gülşen Aktaş', 'Burcu Sezer',
    'Yasemin Erdem', 'Çiğdem Güneş', 'Şeyma Yavuz',
    'Merve Kara', 'Selin Avcı', 'Damla Yıldırım',
    'Nazan Aslan', 'Sibel Çakır',
    'Ferhan Köse', 'Tuğba Acar', 'Banu Şentürk', 'Pelin Tan',
    'Gizem Aksu', 'Deniz Öz',
    'Cem Toprak', 'Onur Bilgin',
    'Tolga Çiftçi', 'Berk Akar', 'Caner Gül',
    'Volkan Bingöl', 'Emre Polat', 'Burak Soylu', 'Furkan Tunç',
    'Erdem Saraç', 'Gökhan Yiğit', 'Barış Aktan',
  ];

  const teacherSubjects: Record<string, string> = {};
  let idx = 0;
  for (const [subj, count] of [
    ['Matematik', 8], ['Geometri', 3], ['Fizik', 4], ['Kimya', 4], ['Biyoloji', 3],
    ['Türk Dili ve Edebiyatı', 6], ['Tarih', 3], ['Coğrafya', 3], ['Felsefe', 2],
    ['İngilizce', 6], ['Almanca', 2], ['Din Kültürü', 3], ['Beden Eğitimi', 4],
    ['Görsel Sanatlar', 3],
  ] as [string, number][]) {
    for (let i = 0; i < count; i++) {
      teacherSubjects[teacherNames[idx]] = subj;
      idx++;
    }
  }

  const teachers = teacherNames.map((name, i) => ({
    id: i + 1,
    name,
    weeklyTargetHours: 0,
    notes: null,
    subjectIds: [subjects.find((s) => s.name === teacherSubjects[name])!.id],
  }));

  const years = [
    { id: 1, name: '9. Sınıf', orderIndex: 0 },
    { id: 2, name: '10. Sınıf', orderIndex: 1 },
    { id: 3, name: '11. Sınıf', orderIndex: 2 },
  ];
  const classes: SchoolBundle['classes'] = [];
  let classId = 0;
  for (const year of years) {
    const grade = year.name.split('.')[0];
    for (const letter of ['A', 'B', 'C', 'D', 'E', 'F']) {
      classId++;
      classes.push({
        id: classId,
        yearId: year.id,
        name: `${grade}${letter}`,
        studentCount: 30,
        homeRoomId: null,
      });
    }
  }

  const rooms: SchoolBundle['rooms'] = [];
  for (let i = 101; i <= 120; i++) {
    rooms.push({ id: rooms.length + 1, name: String(i), capacity: 30, building: null, notes: null });
  }
  for (const special of ['Fizik Lab', 'Kimya Lab', 'Biyoloji Lab', 'Spor Salonu', 'Resim Atölyesi']) {
    rooms.push({ id: rooms.length + 1, name: special, capacity: 30, building: null, notes: null });
  }

  const activities: SchoolBundle['activities'] = [];
  const teacherIndexBySubject: Record<string, number> = {};
  const teachersBySubject: Record<string, typeof teachers> = {};
  for (const t of teachers) {
    const sname = teacherSubjects[t.name];
    if (!teachersBySubject[sname]) teachersBySubject[sname] = [];
    teachersBySubject[sname].push(t);
  }
  let actId = 0;
  for (const cls of classes) {
    for (const subj of subjects) {
      const hrs = subjectHours[subj.name];
      const teacherPool = teachersBySubject[subj.name];
      const ti = (teacherIndexBySubject[subj.name] ?? 0) % teacherPool.length;
      teacherIndexBySubject[subj.name] = (teacherIndexBySubject[subj.name] ?? 0) + 1;
      const teacher = teacherPool[ti];
      actId++;
      activities.push({
        id: actId,
        classId: cls.id,
        subjectId: subj.id,
        teacherId: teacher.id,
        weeklyHours: hrs,
        blockDuration: 1,
        notes: null,
      });
    }
  }

  return {
    institutionName: 'ÖğretimSayfam Test Lisesi (Büyük Ölçek)',
    days,
    hours,
    subjects,
    teachers,
    years,
    classes,
    rooms,
    activities,
    constraints: [
      ...['Ahmet Yılmaz', 'Ayşe Demir', 'Cem Toprak'].map((name, i) => ({
        id: i + 1,
        type: 'TEACHER_NOT_AVAILABLE' as const,
        weight: 100,
        active: true,
        params: {
          teacher: name,
          slots: Array.from({ length: 8 }, (_, h) => ({ day: 'Cuma', hour: h + 1 })),
        },
        source: 'manual' as const,
        aiMessageId: null,
        createdAt: new Date().toISOString(),
        notes: null,
      })),
      {
        id: 10,
        type: 'SUBJECT_LAST_HOUR_OF_DAY' as const,
        weight: 100,
        active: true,
        params: { subject: 'Beden Eğitimi', class: null },
        source: 'manual' as const,
        aiMessageId: null,
        createdAt: new Date().toISOString(),
        notes: null,
      },
    ],
  };
}

describe('FET büyük ölçek testi', () => {
  it('54 öğretmen + 18 sınıf + 25 derslik + 14 branş × 38 saat program üretir', async () => {
    const bundle = makeLargeSchool();
    console.log(`Öğretmen: ${bundle.teachers.length}, Sınıf: ${bundle.classes.length}, Derslik: ${bundle.rooms.length}, Branş: ${bundle.subjects.length}, Activity: ${bundle.activities.length}, Constraint: ${bundle.constraints.length}`);

    const totalHoursPerClass = bundle.activities
      .filter((a) => a.classId === 1)
      .reduce((s, a) => s + a.weeklyHours, 0);
    console.log(`Sınıf başına haftalık saat: ${totalHoursPerClass} (max 40)`);

    const { xml, fetActivityIdsByActivity } = buildFetXml(bundle);

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dpo-scale-'));
    const inputPath = path.join(tmp, 'input.fet');
    fs.writeFileSync(inputPath, xml, 'utf-8');
    const outDir = path.join(tmp, 'out');
    fs.mkdirSync(outDir);

    const t0 = Date.now();
    const result = spawnSync('/usr/bin/fet-cl', [
      `--inputfile=${inputPath}`,
      `--outputdir=${outDir}`,
      '--language=tr',
      '--timelimitseconds=300',
      '--htmllevel=2',
    ], { encoding: 'utf-8', timeout: 360_000 });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);

    console.log(`FET çözüm süresi: ${elapsed}s`);
    console.log('FET stdout son satırlar:', result.stdout?.split('\n').slice(-5).join(' | '));

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Simulation successful');

    const slots = await parseTimetable(outDir, { bundle, fetActivityIdsByActivity });
    console.log(`Üretilen slot sayısı: ${slots.length}`);

    expect(slots.length).toBeGreaterThan(0);

    const ahmetFriday = slots.filter((s) => s.teacherName === 'Ahmet Yılmaz' && s.dayIndex === 4);
    expect(ahmetFriday.length).toBe(0);

    const bedenSlots = slots.filter((s) => s.subjectName === 'Beden Eğitimi');
    expect(bedenSlots.length).toBeGreaterThan(0);
    for (const b of bedenSlots) {
      const later = slots.filter(
        (s) =>
          s.classId === b.classId &&
          s.dayIndex === b.dayIndex &&
          s.hourIndex > b.hourIndex,
      );
      expect(later).toEqual([]);
    }

    const byTeacherSlot = new Map<string, number>();
    for (const s of slots) {
      const key = `${s.teacherName}|${s.dayIndex}|${s.hourIndex}`;
      byTeacherSlot.set(key, (byTeacherSlot.get(key) ?? 0) + 1);
    }
    for (const [key, count] of byTeacherSlot) {
      if (count > 1) throw new Error(`Öğretmen çakışması: ${key} = ${count}`);
    }

    const byClassSlot = new Map<string, number>();
    for (const s of slots) {
      const key = `${s.className}|${s.dayIndex}|${s.hourIndex}`;
      byClassSlot.set(key, (byClassSlot.get(key) ?? 0) + 1);
    }
    for (const [key, count] of byClassSlot) {
      if (count > 1) throw new Error(`Sınıf çakışması: ${key} = ${count}`);
    }

    console.log(`✓ Tüm doğrulamalar geçti. Süre: ${elapsed}s`);
  }, 400_000);
});
