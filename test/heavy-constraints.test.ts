import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { buildFetXml } from '../electron/fet/xml-builder';
import { parseTimetable } from '../electron/fet/xml-parser';
import type { SchoolBundle, Constraint } from '../electron/fet/types';

function makeHeavySchool(): SchoolBundle {
  const days = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'].map(
    (name, i) => ({ id: i + 1, name, orderIndex: i }),
  );
  const hours = Array.from({ length: 8 }, (_, i) => ({
    id: i + 1, name: `${i + 1}. Ders`, orderIndex: i, startTime: null, endTime: null,
  }));

  const subjectNames = [
    'Matematik', 'Geometri', 'Fizik', 'Kimya', 'Biyoloji',
    'Türk Dili ve Edebiyatı', 'Tarih', 'Coğrafya', 'Felsefe',
    'İngilizce', 'Almanca', 'Din Kültürü', 'Beden Eğitimi', 'Görsel Sanatlar',
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
  const teacherCounts: [string, number][] = [
    ['Matematik', 8], ['Geometri', 3], ['Fizik', 4], ['Kimya', 4], ['Biyoloji', 3],
    ['Türk Dili ve Edebiyatı', 6], ['Tarih', 3], ['Coğrafya', 3], ['Felsefe', 2],
    ['İngilizce', 6], ['Almanca', 2], ['Din Kültürü', 3], ['Beden Eğitimi', 4],
    ['Görsel Sanatlar', 3],
  ];
  const teacherSubjects: Record<string, string> = {};
  let idx = 0;
  for (const [subj, count] of teacherCounts) {
    for (let i = 0; i < count; i++) {
      teacherSubjects[teacherNames[idx]] = subj;
      idx++;
    }
  }
  const teachers = teacherNames.map((name, i) => ({
    id: i + 1, name, weeklyTargetHours: 0, notes: null,
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
      classes.push({ id: classId, yearId: year.id, name: `${grade}${letter}`, studentCount: 30, homeRoomId: null });
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
  const teachersBySubject: Record<string, typeof teachers> = {};
  for (const t of teachers) {
    const sname = teacherSubjects[t.name];
    if (!teachersBySubject[sname]) teachersBySubject[sname] = [];
    teachersBySubject[sname].push(t);
  }
  const teacherIndexBySubject: Record<string, number> = {};
  let actId = 0;
  for (const cls of classes) {
    for (const subj of subjects) {
      const hrs = subjectHours[subj.name];
      const pool = teachersBySubject[subj.name];
      const ti = (teacherIndexBySubject[subj.name] ?? 0) % pool.length;
      teacherIndexBySubject[subj.name] = (teacherIndexBySubject[subj.name] ?? 0) + 1;
      actId++;
      activities.push({
        id: actId, classId: cls.id, subjectId: subj.id,
        teacherId: pool[ti].id, weeklyHours: hrs, blockDuration: 1, notes: null,
      });
    }
  }

  const mkConstraint = (type: any, weight: number, params: any, id: number): Constraint => ({
    id, type, weight, active: true, params,
    source: 'manual' as const, aiMessageId: null,
    createdAt: new Date().toISOString(), notes: null,
  });

  const allDayCuma = Array.from({ length: 8 }, (_, h) => ({ day: 'Cuma', hour: h + 1 }));
  const allDayPzt = Array.from({ length: 8 }, (_, h) => ({ day: 'Pazartesi', hour: h + 1 }));

  const constraints: Constraint[] = [
    mkConstraint('TEACHER_NOT_AVAILABLE', 100, { teacher: 'Ahmet Yılmaz', slots: allDayCuma }, 1),
    mkConstraint('TEACHER_NOT_AVAILABLE', 100, { teacher: 'Ayşe Demir', slots: allDayCuma }, 2),
    mkConstraint('TEACHER_NOT_AVAILABLE', 100, { teacher: 'Cem Toprak', slots: allDayCuma }, 3),
    mkConstraint('TEACHER_NOT_AVAILABLE', 100, { teacher: 'Ferhan Köse', slots: allDayCuma }, 4),

    mkConstraint('TEACHER_NOT_AVAILABLE', 100, {
      teacher: 'Mehmet Kaya',
      slots: [{ day: 'Pazartesi', hour: 1 }, { day: 'Pazartesi', hour: 2 }, { day: 'Pazartesi', hour: 3 }],
    }, 5),

    mkConstraint('SUBJECT_LAST_HOUR_OF_DAY', 100, { subject: 'Beden Eğitimi', class: null }, 6),
    mkConstraint('SUBJECT_LAST_HOUR_OF_DAY', 100, { subject: 'Görsel Sanatlar', class: null }, 7),

    mkConstraint('SUBJECT_MAX_HOURS_DAILY', 100, { subject: 'Matematik', class: null, maxHours: 2 }, 8),
    mkConstraint('SUBJECT_MAX_HOURS_DAILY', 100, { subject: 'Türk Dili ve Edebiyatı', class: null, maxHours: 2 }, 9),

    mkConstraint('TEACHER_MAX_HOURS_DAILY', 100, { teacher: 'Mustafa Demir', maxHours: 6 }, 10),
    mkConstraint('TEACHER_MAX_HOURS_DAILY', 100, { teacher: 'Fatma Aksoy', maxHours: 6 }, 11),
    mkConstraint('TEACHER_MAX_HOURS_DAILY', 100, { teacher: 'Hasan Öztürk', maxHours: 5 }, 12),

    mkConstraint('SUBJECT_NOT_ON_DAY', 100, { subject: 'Felsefe', class: null, days: ['Pazartesi'] }, 13),
    mkConstraint('SUBJECT_NOT_ON_DAY', 100, { subject: 'Almanca', class: null, days: ['Cuma'] }, 14),

    mkConstraint('CLASS_MAX_GAPS_PER_WEEK', 100, { class: '9A', maxGaps: 0 }, 15),
    mkConstraint('CLASS_MAX_GAPS_PER_WEEK', 100, { class: '10A', maxGaps: 0 }, 16),

    mkConstraint('TEACHER_MAX_GAPS_PER_DAY', 100, { teacher: 'Pelin Tan', maxGaps: 2 }, 17),
    mkConstraint('TEACHER_MAX_GAPS_PER_DAY', 100, { teacher: 'Zeynep Akın', maxGaps: 2 }, 18),

    mkConstraint('TEACHERS_MAX_GAPS_PER_WEEK', 100, { maxGaps: 5 }, 19),

    mkConstraint('TEACHER_MAX_DAYS_PER_WEEK', 100, { teacher: 'Tolga Çiftçi', maxDays: 4 }, 20),
  ];

  return {
    institutionName: 'ÖğretimSayfam Test Lisesi (Heavy Constraints)',
    days, hours, subjects, teachers, years, classes, rooms, activities, constraints,
  };
}

describe('FET 20 kısıtlamalı stres testi', () => {
  it('20 kısıtlamayı eşzamanlı uygulayarak gerçekçi okul için program üretir', async () => {
    const bundle = makeHeavySchool();
    console.log(`Öğretmen: ${bundle.teachers.length}, Sınıf: ${bundle.classes.length}, Activity: ${bundle.activities.length}, Kısıtlama: ${bundle.constraints.length}`);

    const built = buildFetXml(bundle);
    const xml = built.xml;
    const fetActivityIdsByActivity = built.fetActivityIdsByActivity;
    console.log(`XML uzunluğu: ${xml?.length ?? 'YOK'} char`);
    console.log(`XML başı: ${xml?.slice(0, 150)}`);
    console.log(`XML constraint sayısı: ${(xml?.match(/<Constraint/g) ?? []).length}`);
    if (built.skipped?.length) {
      console.log(`SKIPPED: ${built.skipped.length}`, built.skipped.slice(0, 3));
    }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dpo-heavy-'));
    const inputPath = path.join(tmp, 'input.fet');
    fs.writeFileSync(inputPath, xml, 'utf-8');
    const stat = fs.statSync(inputPath);
    console.log(`Yazılan dosya: ${inputPath} (${stat.size} bytes)`);
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
    console.log('FET stdout:', result.stdout?.split('\n').slice(-10).join('\n'));
    console.log('FET stderr:', result.stderr ?? '(boş)');
    fs.copyFileSync(inputPath, '/tmp/dpo-heavy-DEBUG.fet');
    console.log('XML saved to /tmp/dpo-heavy-DEBUG.fet for manual inspection');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Simulation successful');

    const slots = await parseTimetable(outDir, { bundle, fetActivityIdsByActivity });
    console.log(`Üretilen slot sayısı: ${slots.length}`);


    const checkTeacherDay = (teacher: string, day: number, hours: number[] | 'all') => {
      const conflicts = slots.filter(
        (s) =>
          s.teacherName === teacher &&
          s.dayIndex === day &&
          (hours === 'all' || hours.includes(s.hourIndex)),
      );
      if (conflicts.length > 0) {
        throw new Error(`${teacher} ${day}. günde ${hours} ihlali: ${conflicts.length} slot`);
      }
    };
    checkTeacherDay('Ahmet Yılmaz', 4, 'all');
    checkTeacherDay('Ayşe Demir', 4, 'all');
    checkTeacherDay('Cem Toprak', 4, 'all');
    checkTeacherDay('Ferhan Köse', 4, 'all');
    checkTeacherDay('Mehmet Kaya', 0, [0, 1, 2]);

    for (const subjectName of ['Beden Eğitimi', 'Görsel Sanatlar']) {
      const ss = slots.filter((s) => s.subjectName === subjectName);
      expect(ss.length).toBeGreaterThan(0);
      for (const b of ss) {
        const later = slots.filter(
          (s) =>
            s.classId === b.classId &&
            s.dayIndex === b.dayIndex &&
            s.hourIndex > b.hourIndex,
        );
        if (later.length > 0) {
          throw new Error(`${subjectName} son ders değil: ${b.className} day=${b.dayIndex} h=${b.hourIndex}, sonra ${later.length} ders var`);
        }
      }
    }

    for (const subjectName of ['Matematik', 'Türk Dili ve Edebiyatı']) {
      const byClassDay = new Map<string, number>();
      for (const s of slots.filter((x) => x.subjectName === subjectName)) {
        const k = `${s.className}|${s.dayIndex}`;
        byClassDay.set(k, (byClassDay.get(k) ?? 0) + 1);
      }
      for (const [k, c] of byClassDay) {
        if (c > 2) throw new Error(`${subjectName} ${k} ihlali: ${c}/2`);
      }
    }

    const teacherDailyHours = (teacher: string) => {
      const m = new Map<number, number>();
      for (const s of slots.filter((x) => x.teacherName === teacher)) {
        m.set(s.dayIndex, (m.get(s.dayIndex) ?? 0) + 1);
      }
      return m;
    };
    for (const [t, max] of [['Mustafa Demir', 6], ['Fatma Aksoy', 6], ['Hasan Öztürk', 5]] as [string, number][]) {
      const m = teacherDailyHours(t);
      for (const [day, count] of m) {
        if (count > max) throw new Error(`${t} day=${day} ${count}>${max}`);
      }
    }

    expect(slots.filter((s) => s.subjectName === 'Felsefe' && s.dayIndex === 0).length).toBe(0);
    expect(slots.filter((s) => s.subjectName === 'Almanca' && s.dayIndex === 4).length).toBe(0);

    const classGaps = (className: string): number => {
      let total = 0;
      for (let d = 0; d < 5; d++) {
        const dayHours = slots
          .filter((s) => s.className === className && s.dayIndex === d)
          .map((s) => s.hourIndex)
          .sort((a, b) => a - b);
        if (dayHours.length < 2) continue;
        const span = dayHours[dayHours.length - 1] - dayHours[0] + 1;
        total += span - dayHours.length;
      }
      return total;
    };
    const gaps9A = classGaps('9A');
    const gaps10A = classGaps('10A');
    if (gaps9A > 0) throw new Error(`9A haftada ${gaps9A} boşluk var (limit 0)`);
    if (gaps10A > 0) throw new Error(`10A haftada ${gaps10A} boşluk var (limit 0)`);

    const tolgaDays = new Set(slots.filter((s) => s.teacherName === 'Tolga Çiftçi').map((s) => s.dayIndex));
    if (tolgaDays.size > 4) throw new Error(`Tolga ${tolgaDays.size} gün gelmiş`);

    const teacherSlot = new Map<string, number>();
    for (const s of slots) {
      const k = `${s.teacherName}|${s.dayIndex}|${s.hourIndex}`;
      teacherSlot.set(k, (teacherSlot.get(k) ?? 0) + 1);
    }
    for (const [k, c] of teacherSlot) {
      if (c > 1) throw new Error(`Öğretmen çakışması: ${k} = ${c}`);
    }
    const classSlot = new Map<string, number>();
    for (const s of slots) {
      const k = `${s.className}|${s.dayIndex}|${s.hourIndex}`;
      classSlot.set(k, (classSlot.get(k) ?? 0) + 1);
    }
    for (const [k, c] of classSlot) {
      if (c > 1) throw new Error(`Sınıf çakışması: ${k} = ${c}`);
    }

    console.log(`✓ 20/20 kısıtlama eşzamanlı sağlandı. Süre: ${elapsed}s`);
  }, 400_000);
});
