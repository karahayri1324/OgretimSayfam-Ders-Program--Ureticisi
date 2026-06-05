// Uçtan-uca kısıt boru hattı testi: AI parametresi → DB(Constraint) → FET XML → fet-cl kabulü
// → (sert kısıtlar için) üretilen programda DAVRANIŞ doğrulaması.
//
// Neden bu kadar katmanlı? Round-3/7'de gördük ki FET, TANIMADIĞI bir constraint tag'ini
// REDDETMİYOR — stdout'a "There is an unrecognized XML tag ... will be ignored" basıp status 0
// ("Simulation successful") ile devam ediyor. Yani salt "status 0" bir tag'in gerçek olduğunu
// KANITLAMAZ; hayalet tag de bu testi geçer. Bu yüzden:
//   Katman 1 (hızlı, fet-cl yok): her tip doğru FET tag'ini üretiyor mu / sessizce düşüyor mu.
//   Katman 2 (gerçek fet-cl): üretilen tag FET tarafından TANINIYOR mu ("unrecognized XML tag"
//             uyarısının YOKLUĞU ile kanıtlanır) — hayalet tag'i burada yakalarız.
//   Katman 3 (gerçek fet-cl + parse): sert kısıt çıktı programda gerçekten UYGULANIYOR mu.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { buildFetXml } from '../electron/fet/xml-builder';
import { parseTimetable } from '../electron/fet/xml-parser';
import { HANDLERS } from '../electron/fet/constraints/handlers';
import { ConstraintTypeEnum } from '../electron/ai/schema';
import type { SchoolBundle } from '../electron/fet/types';
import type { Constraint, ConstraintType } from '../src/lib/types';

const FET_BIN = '/usr/bin/fet-cl';

// ---------------------------------------------------------------------------
// Bol, fizibıl temel okul: 5 gün × 8 saat = 40 slot. Yükler hafif tutuldu ki tek bir kısıt
// eklenince FET her zaman çözüm bulabilsin (status 0). Set-bazlı kısıtlar için 1 saatlik,
// farklı sınıf+öğretmenli (aynı anda başlayabilen) act5/act6 müzik aktiviteleri var.
// ---------------------------------------------------------------------------
function baseSchool(constraints: Constraint[]): SchoolBundle {
  return {
    institutionName: 'ÖğretimSayfam Kısıt Test Lisesi',
    days: [
      { id: 1, name: 'Pazartesi', orderIndex: 0 },
      { id: 2, name: 'Salı', orderIndex: 1 },
      { id: 3, name: 'Çarşamba', orderIndex: 2 },
      { id: 4, name: 'Perşembe', orderIndex: 3 },
      { id: 5, name: 'Cuma', orderIndex: 4 },
    ],
    hours: Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      name: `${i + 1}. Ders`,
      orderIndex: i,
      startTime: null,
      endTime: null,
    })),
    subjects: [
      { id: 1, name: 'Matematik', shortCode: 'MAT', color: null, notes: null },
      { id: 2, name: 'Fizik', shortCode: 'FIZ', color: null, notes: null },
      { id: 3, name: 'Müzik', shortCode: 'MUZ', color: null, notes: null },
    ],
    teachers: [
      { id: 1, name: 'Ahmet Yılmaz', weeklyTargetHours: 0, notes: null, subjectIds: [1] },
      { id: 2, name: 'Ayşe Demir', weeklyTargetHours: 0, notes: null, subjectIds: [2] },
      { id: 3, name: 'Veli Kaya', weeklyTargetHours: 0, notes: null, subjectIds: [3] },
      { id: 4, name: 'Fatma Ak', weeklyTargetHours: 0, notes: null, subjectIds: [3] },
    ],
    years: [{ id: 1, name: '9. Sınıf', orderIndex: 0 }],
    classes: [
      { id: 1, yearId: 1, name: '9A', studentCount: 20, homeRoomId: null },
      { id: 2, yearId: 1, name: '9B', studentCount: 20, homeRoomId: null },
    ],
    rooms: [
      { id: 1, name: '101', capacity: 40, building: null, notes: null },
      { id: 2, name: '102', capacity: 40, building: null, notes: null },
      { id: 3, name: '103', capacity: 40, building: null, notes: null },
    ],
    activities: [
      { id: 1, classId: 1, subjectId: 1, teacherId: 1, weeklyHours: 4, blockDuration: 1, notes: null },
      { id: 2, classId: 1, subjectId: 2, teacherId: 2, weeklyHours: 3, blockDuration: 1, notes: null },
      { id: 3, classId: 2, subjectId: 1, teacherId: 1, weeklyHours: 4, blockDuration: 1, notes: null },
      { id: 4, classId: 2, subjectId: 2, teacherId: 2, weeklyHours: 3, blockDuration: 1, notes: null },
      // set-bazlı kısıtlar için aynı anda başlayabilen 1 saatlik aktiviteler:
      { id: 5, classId: 1, subjectId: 3, teacherId: 3, weeklyHours: 1, blockDuration: 1, notes: null },
      { id: 6, classId: 2, subjectId: 3, teacherId: 4, weeklyHours: 1, blockDuration: 1, notes: null },
    ],
    constraints,
  };
}

const TEACHER = 'Ahmet Yılmaz';

type Case = {
  params: Record<string, unknown>;
  tag?: string; // beklenen FET tag'i (destekleniyorsa)
  skip?: boolean; // FET doğrudan desteklemiyor → handler bilerek skipped[]'e yazar
};

// Her ConstraintType için: AI'ın göndereceği params + beklenen FET tag'i.
// Bu harita ConstraintTypeEnum ile birebir olmalı (aşağıda meta-test zorluyor).
const CASES: Record<ConstraintType, Case> = {
  TEACHER_NOT_AVAILABLE: { params: { teacher: TEACHER, slots: [{ day: 'Cuma', hour: 8 }] }, tag: 'ConstraintTeacherNotAvailableTimes' },
  TEACHER_MAX_DAYS_PER_WEEK: { params: { teacher: TEACHER, maxDays: 5 }, tag: 'ConstraintTeacherMaxDaysPerWeek' },
  TEACHER_MAX_HOURS_DAILY: { params: { teacher: TEACHER, maxHours: 6 }, tag: 'ConstraintTeacherMaxHoursDaily' },
  TEACHER_MAX_GAPS_PER_DAY: { params: { teacher: TEACHER, maxGaps: 3 }, tag: 'ConstraintTeacherMaxGapsPerDay' },
  TEACHER_MAX_GAPS_PER_WEEK: { params: { teacher: TEACHER, maxGaps: 10 }, tag: 'ConstraintTeacherMaxGapsPerWeek' },
  TEACHERS_MAX_GAPS_PER_WEEK: { params: { maxGaps: 20 }, tag: 'ConstraintTeachersMaxGapsPerWeek' },
  CLASS_NOT_AVAILABLE: { params: { class: '9A', slots: [{ day: 'Cuma', hour: 8 }] }, tag: 'ConstraintStudentsSetNotAvailableTimes' },
  CLASS_MAX_GAPS_PER_WEEK: { params: { class: '9A', maxGaps: 20 }, tag: 'ConstraintStudentsSetMaxGapsPerWeek' },
  SUBJECT_NOT_ON_DAY: { params: { subject: 'Müzik', days: ['Cuma'] }, tag: 'ConstraintActivityPreferredTimeSlots' },
  SUBJECT_PREFERRED_HOURS: { params: { subject: 'Müzik', preferredHours: [2, 3, 4, 5] }, tag: 'ConstraintActivityPreferredTimeSlots' },
  SUBJECT_LAST_HOUR_OF_DAY: { params: { subject: 'Müzik' }, tag: 'ConstraintActivityEndsStudentsDay' },
  SUBJECT_MAX_HOURS_DAILY: { params: { subject: 'Matematik', maxHours: 2 }, skip: true },
  SUBJECT_CONSECUTIVE_HOURS: { params: { subject: 'Matematik', class: '9A' }, tag: 'ConstraintTwoActivitiesConsecutive' },
  ROOM_NOT_AVAILABLE: { params: { room: '103', slots: [{ day: 'Cuma', hour: 8 }] }, tag: 'ConstraintRoomNotAvailableTimes' },
  SUBJECT_PREFERRED_ROOM: { params: { subject: 'Matematik', room: '101' }, tag: 'ConstraintSubjectPreferredRoom' },
  TEACHER_HOME_ROOM: { params: { teacher: TEACHER, room: '101' }, tag: 'ConstraintTeacherHomeRoom' },
  CLASS_HOME_ROOM: { params: { class: '9A', room: '101' }, tag: 'ConstraintStudentsSetHomeRoom' },
  TEACHER_MIN_HOURS_DAILY: { params: { teacher: TEACHER, minHours: 2 }, tag: 'ConstraintTeacherMinHoursDaily' },
  TEACHER_NOT_AVAILABLE_INTERVAL: { params: { teacher: TEACHER, day: 'Cuma', startHour: 7, endHour: 8 }, tag: 'ConstraintTeacherNotAvailableTimes' },
  TEACHER_MIN_DAYS_PER_WEEK: { params: { teacher: TEACHER, minDays: 1 }, tag: 'ConstraintTeacherMinDaysPerWeek' },
  TEACHER_MAX_HOURS_CONTINUOUSLY: { params: { teacher: TEACHER, maxHours: 5 }, tag: 'ConstraintTeacherMaxHoursContinuously' },
  TEACHER_MAX_BUILDING_CHANGES_PER_DAY: { params: { teacher: TEACHER, maxChanges: 3 }, tag: 'ConstraintTeacherMaxBuildingChangesPerDay' },
  TEACHER_MAX_BUILDING_CHANGES_PER_WEEK: { params: { teacher: TEACHER, maxChanges: 5 }, tag: 'ConstraintTeacherMaxBuildingChangesPerWeek' },
  TEACHER_MIN_GAPS_BETWEEN_BUILDING_CHANGES: { params: { teacher: TEACHER, minGaps: 1 }, tag: 'ConstraintTeacherMinGapsBetweenBuildingChanges' },
  TEACHER_NOT_FIRST_HOUR: { params: { teacher: TEACHER }, tag: 'ConstraintTeacherNotAvailableTimes' },
  TEACHER_NOT_LAST_HOUR: { params: { teacher: TEACHER }, tag: 'ConstraintTeacherNotAvailableTimes' },
  TEACHER_MIN_REST_BETWEEN_DAYS: { params: { teacher: TEACHER, minRestHours: 2 }, tag: 'ConstraintTeacherNotAvailableTimes' },
  CLASS_MAX_HOURS_DAILY: { params: { class: '9A', maxHours: 6 }, tag: 'ConstraintStudentsSetMaxHoursDaily' },
  CLASS_MIN_HOURS_DAILY: { params: { class: '9A', minHours: 2 }, tag: 'ConstraintStudentsSetMinHoursDaily' },
  CLASS_MAX_GAPS_PER_DAY: { params: { class: '9A', maxGaps: 4 }, tag: 'ConstraintStudentsSetMaxGapsPerDay' },
  CLASS_EARLY_MAX_BEGINNINGS: { params: { class: '9A', maxBeginnings: 5 }, tag: 'ConstraintStudentsSetEarlyMaxBeginningsAtSecondHour' },
  CLASS_MAX_BUILDING_CHANGES_PER_DAY: { params: { class: '9A', maxChanges: 3 }, tag: 'ConstraintStudentsSetMaxBuildingChangesPerDay' },
  CLASS_MIN_GAPS_BETWEEN_BUILDING_CHANGES: { params: { class: '9A', minGaps: 1 }, tag: 'ConstraintStudentsSetMinGapsBetweenBuildingChanges' },
  CLASS_NOT_FIRST_HOUR: { params: { class: '9A' }, tag: 'ConstraintStudentsSetNotAvailableTimes' },
  CLASS_MAX_HOURS_CONTINUOUSLY: { params: { class: '9A', maxHours: 6 }, tag: 'ConstraintStudentsSetMaxHoursContinuously' },
  ACTIVITY_FIXED_TIME: { params: { activityId: 5, day: 'Pazartesi', hour: 1 }, tag: 'ConstraintActivityPreferredStartingTime' },
  ACTIVITIES_SAME_STARTING_TIME: { params: { activityIds: [5, 6] }, tag: 'ConstraintActivitiesSameStartingTime' },
  ACTIVITIES_NOT_OVERLAPPING: { params: { activityIds: [5, 6] }, tag: 'ConstraintActivitiesNotOverlapping' },
  ACTIVITIES_SAME_STARTING_DAY: { params: { activityIds: [5, 6] }, tag: 'ConstraintActivitiesSameStartingDay' },
  ACTIVITY_ENDS_STUDENTS_DAY: { params: { activityId: 5 }, tag: 'ConstraintActivityEndsStudentsDay' },
  SUBJECT_NOT_FIRST_HOUR: { params: { subject: 'Müzik' }, tag: 'ConstraintActivityPreferredTimeSlots' },
  MIN_DAYS_BETWEEN_ACTIVITIES_CUSTOM: { params: { activityIds: [5, 6], minDays: 1 }, tag: 'ConstraintMinDaysBetweenActivities' },
  MIN_GAPS_BETWEEN_ACTIVITIES: { params: { activityIds: [5, 6], minGaps: 1 }, tag: 'ConstraintMinGapsBetweenActivities' },
  // FET varsayılan modu desteklemiyor (üretimi kilitliyor) → handler bilerek atlar.
  MAX_GAPS_BETWEEN_ACTIVITIES: { params: { activityIds: [5, 6], maxGaps: 6 }, skip: true },
  ACTIVITY_PREFERRED_STARTING_TIMES: { params: { activityId: 5, slots: [{ day: 'Pazartesi', hour: 1 }, { day: 'Salı', hour: 1 }] }, tag: 'ConstraintActivityPreferredStartingTimes' },
  SUBJECT_PREFERRED_ROOMS: { params: { subject: 'Matematik', rooms: ['101', '102'] }, tag: 'ConstraintSubjectPreferredRooms' },
  TEACHER_PREFERRED_ROOM: { params: { teacher: TEACHER, room: '101' }, tag: 'ConstraintTeacherHomeRoom' },
  TEACHER_PREFERRED_ROOMS: { params: { teacher: TEACHER, rooms: ['101', '102'] }, tag: 'ConstraintTeacherHomeRooms' },
  ACTIVITY_PREFERRED_ROOM: { params: { activityId: 5, room: '101' }, tag: 'ConstraintActivityPreferredRoom' },
  ACTIVITY_PREFERRED_ROOMS: { params: { activityId: 5, rooms: ['101', '102'] }, tag: 'ConstraintActivityPreferredRooms' },
  SUBJECT_ACTIVITY_TAG_PREFERRED_ROOM: { params: { subject: 'Matematik', activityTag: 'Lab', room: '101' }, tag: 'ConstraintSubjectActivityTagPreferredRoom' },
  ACTIVITIES_OCCUPY_MAX_DIFFERENT_ROOMS: { params: { activityIds: [5, 6], maxDifferentRooms: 2 }, tag: 'ConstraintActivitiesOccupyMaxDifferentRooms' },
  STUDENTS_SET_HOME_ROOMS: { params: { class: '9A', rooms: ['101', '102'] }, tag: 'ConstraintStudentsSetHomeRooms' },
  BREAK_TIMES: { params: { slots: [{ day: 'Cuma', hour: 8 }] }, tag: 'ConstraintBreakTimes' },
  ALL_TEACHERS_MAX_HOURS_DAILY: { params: { maxHours: 6 }, tag: 'ConstraintTeachersMaxHoursDaily' },
  ALL_TEACHERS_MAX_DAYS_PER_WEEK: { params: { maxDays: 5 }, tag: 'ConstraintTeachersMaxDaysPerWeek' },
  STUDENTS_MAX_GAPS_PER_WEEK: { params: { maxGaps: 20 }, tag: 'ConstraintStudentsMaxGapsPerWeek' },
  STUDENTS_EARLY_MAX_BEGINNINGS: { params: { maxBeginnings: 5 }, tag: 'ConstraintStudentsEarlyMaxBeginningsAtSecondHour' },
  STUDENTS_MAX_HOURS_DAILY: { params: { maxHours: 8 }, tag: 'ConstraintStudentsMaxHoursDaily' },
  MAX_TOTAL_ACTIVITIES_FROM_SET: { params: { activityIds: [5, 6], maxHours: 2 }, skip: true },
  TWO_ACTIVITIES_CONSECUTIVE: { params: { firstActivityId: 5, secondActivityId: 6 }, tag: 'ConstraintTwoActivitiesConsecutive' },
};

function mkConstraint(type: ConstraintType, params: Record<string, unknown>, weight = 100): Constraint {
  return {
    id: 1,
    type,
    weight,
    active: true,
    params,
    source: 'ai',
    aiMessageId: null,
    createdAt: '',
    notes: null,
  };
}

type FetRun = {
  status: number | null;
  stdout: string;
  stderr: string;
  outDir: string;
};

function runFet(xml: string, timeLimitSec = 6): FetRun {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dpo-allc-'));
  const inputPath = path.join(tmp, 'in.fet');
  fs.writeFileSync(inputPath, xml, 'utf-8');
  const outDir = path.join(tmp, 'out');
  fs.mkdirSync(outDir);
  const r = spawnSync(FET_BIN, [
    `--inputfile=${inputPath}`,
    `--outputdir=${outDir}`,
    '--language=en_US', // "unrecognized XML tag" uyarısını İngilizce yakalamak için
    `--timelimitseconds=${timeLimitSec}`,
    '--htmllevel=2',
  ], { encoding: 'utf-8', timeout: (timeLimitSec + 30) * 1000 });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', outDir };
}

const ALL_TYPES = ConstraintTypeEnum.options as ConstraintType[];
const SUPPORTED = ALL_TYPES.filter((t) => !CASES[t].skip);
const SKIPPED = ALL_TYPES.filter((t) => CASES[t].skip);

// ===========================================================================
// META: harita/enum/handler senkron mu? (ileride tip eklenince test kırmızı olsun)
// ===========================================================================
describe('Kısıt envanteri tutarlılığı', () => {
  it('CASES haritası ConstraintTypeEnum ile birebir aynı tipleri kapsıyor', () => {
    expect(Object.keys(CASES).sort()).toEqual([...ALL_TYPES].sort());
  });

  it('Her ConstraintType için bir FET handler tanımlı', () => {
    for (const t of ALL_TYPES) {
      expect(HANDLERS[t], `handler eksik: ${t}`).toBeTypeOf('function');
    }
  });

  it('Desteklenen tip sayısı + bilerek atlanan tip sayısı = toplam', () => {
    expect(SUPPORTED.length + SKIPPED.length).toBe(ALL_TYPES.length);
    // Bilerek atlananlar: FET'in varsayılan modda doğrudan desteklemediği kısıtlar.
    // (küme günlük-azami-saat, küme toplam-aktivite, aktiviteler-arası azami-boşluk)
    expect([...SKIPPED].sort()).toEqual([
      'MAX_GAPS_BETWEEN_ACTIVITIES',
      'MAX_TOTAL_ACTIVITIES_FROM_SET',
      'SUBJECT_MAX_HOURS_DAILY',
    ]);
  });
});

// ===========================================================================
// KATMAN 1: param → XML. Desteklenen her tip doğru tag'i ÜRETMELİ ve SESSİZCE DÜŞMEMELİ.
// Atlanan tipler skipped[]'e AÇIK gerekçeyle yazılmalı (sessiz değil).
// ===========================================================================
describe('Katman 1 — AI param → DB → FET XML (tüm tipler)', () => {
  for (const type of ALL_TYPES) {
    const c = CASES[type];
    it(`${type} → ${c.skip ? 'bilerek atlanır (FET desteklemiyor)' : c.tag}`, () => {
      const bundle = baseSchool([mkConstraint(type, c.params)]);
      const { xml, skipped } = buildFetXml(bundle);
      const skip = skipped.find((s) => s.constraintId === 1);

      if (c.skip) {
        expect(skip, `${type} skipped[]'e yazılmalı`).toBeDefined();
        expect(skip!.reason).toMatch(/FET/);
        return;
      }

      // SESSİZ DÜŞME OLMAMALI: handler bu kısıtı atlamamış olmalı.
      expect(skip, `${type} sessizce düştü: ${skip?.reason}`).toBeUndefined();
      // Doğru FET tag'i üretilmiş olmalı.
      expect(xml.includes(`<${c.tag}>`), `${type} için <${c.tag}> XML'de yok`).toBe(true);
    });
  }
});

// ===========================================================================
// REGRESYON: bu turda e2e ile yakalanan, üretimi KİLİTLEYEN kısıtlar artık temiz atlanmalı.
// FET bu üçünü "data is wrong - aborting" / "incompatible with the current mode" ile reddedip
// tüm programı çökertiyordu. Handler artık geçersiz XML üretmek yerine skipped[]'e yazıp üretimin
// devam etmesini sağlamalı — VE eklenince fet-cl yine başarıyla çözebilmeli.
// ===========================================================================
describe('Regresyon — FET-kilitleyen kısıtlar temiz atlanır (üretim devam eder)', () => {
  it.each([
    ['TEACHER_MIN_HOURS_DAILY', { teacher: TEACHER, minHours: 1 }],
    ['TEACHER_MIN_HOURS_DAILY', { teacher: TEACHER, minHours: 0 }],
    ['CLASS_MIN_HOURS_DAILY', { class: '9A', minHours: 1 }],
  ] as [ConstraintType, Record<string, unknown>][])(
    '%s minHours<2 → atlanır ve XML üretimi-kilitlemez',
    (type, params) => {
      const bundle = baseSchool([mkConstraint(type, params)]);
      const { xml, skipped } = buildFetXml(bundle);
      const sk = skipped.find((s) => s.constraintId === 1);
      expect(sk, `${type} ${JSON.stringify(params)} atlanmalıydı`).toBeDefined();
      expect(sk!.reason).toMatch(/>=2/);
      // min-saat tag'i HİÇ üretilmemeli (aksi halde fet-cl abort eder).
      expect(xml).not.toContain('MinHoursDaily');
      // Ve fet-cl gerçekten sorunsuz çözmeli.
      const r = runFet(xml);
      expect(r.status, `fet abort etti: ${r.stdout.slice(-300)}`).toBe(0);
      expect(r.stdout).toContain('Simulation successful');
    },
    60_000,
  );

  it('MIN_HOURS_DAILY minHours>=2 hâlâ çalışır (tag üretilir, fet çözer)', () => {
    const bundle = baseSchool([mkConstraint('TEACHER_MIN_HOURS_DAILY', { teacher: TEACHER, minHours: 2 })]);
    const { xml, skipped } = buildFetXml(bundle);
    expect(skipped.find((s) => s.constraintId === 1)).toBeUndefined();
    expect(xml).toContain('ConstraintTeacherMinHoursDaily');
    const r = runFet(xml);
    expect(r.status).toBe(0);
  }, 60_000);

  it('MAX_GAPS_BETWEEN_ACTIVITIES → atlanır, ConstraintMaxGapsBetweenActivities ASLA üretilmez', () => {
    const bundle = baseSchool([mkConstraint('MAX_GAPS_BETWEEN_ACTIVITIES', { activityIds: [5, 6], maxGaps: 6 })]);
    const { xml, skipped } = buildFetXml(bundle);
    const sk = skipped.find((s) => s.constraintId === 1);
    expect(sk).toBeDefined();
    expect(sk!.reason).toMatch(/varsayılan modda desteklemiyor/);
    expect(xml).not.toContain('ConstraintMaxGapsBetweenActivities');
    const r = runFet(xml);
    expect(r.status, `fet abort etti: ${r.stdout.slice(-300)}`).toBe(0);
    expect(r.stdout).not.toContain('incompatible with the current mode');
  }, 60_000);
});

// ===========================================================================
// KATMAN 2: gerçek fet-cl her tag'i TANIYOR mu? "unrecognized XML tag" uyarısının yokluğu
// hayalet tag'i yakalar. Ayrıca XML'in tümüyle geçerli olduğunu (status 0 + başarılı) doğrular.
// ===========================================================================
describe('Katman 2 — fet-cl her constraint tag\'ini tanıyor (hayalet tag yok)', () => {
  for (const type of SUPPORTED) {
    const c = CASES[type];
    it(`${type}: fet-cl <${c.tag}> tag'ini tanıyor ve XML geçerli`, () => {
      const bundle = baseSchool([mkConstraint(type, c.params)]);
      const { xml } = buildFetXml(bundle);
      const r = runFet(xml);

      // FET tanımadığı tag'i "ignored" diyerek yutar → bunu açıkça yasakla.
      expect(
        r.stdout.includes('unrecognized XML tag'),
        `FET <${c.tag}> tag'ini TANIMADI (hayalet tag). FET çıktısı:\n${r.stdout.slice(-500)}`,
      ).toBe(false);
      // XML tümüyle geçerli ve çözülebilir olmalı.
      expect(r.status, `fet-cl status≠0 (${type}). stderr:\n${r.stderr.slice(-400)}`).toBe(0);
      expect(r.stdout).toContain('Simulation successful');
    }, 60_000);
  }
});

// ===========================================================================
// KATMAN 3: sert kısıtlar üretilen programda GERÇEKTEN uygulanıyor mu? (davranışsal kanıt)
// Bunlar "tag tanındı ama uygulanmadı" sessiz hatasını da yakalar.
// ===========================================================================
describe('Katman 3 — sert kısıtlar üretilen programda uygulanıyor (davranış)', () => {
  it('TEACHER_NOT_AVAILABLE: öğretmen kapalı günde HİÇ ders almaz', async () => {
    // Ahmet tüm Cuma kapalı → çıktıda Cuma (dayIndex 4) Ahmet dersi olmamalı.
    const slots = [...Array(8)].map((_, i) => ({ day: 'Cuma', hour: i + 1 }));
    const bundle = baseSchool([mkConstraint('TEACHER_NOT_AVAILABLE', { teacher: TEACHER, slots })]);
    const { xml, fetActivityIdsByActivity } = buildFetXml(bundle);
    const r = runFet(xml, 10);
    expect(r.status).toBe(0);
    const { slots: out } = await parseTimetable(r.outDir, { bundle, fetActivityIdsByActivity });
    const ahmetFriday = out.filter((s) => s.teacherName === TEACHER && s.dayIndex === 4);
    expect(ahmetFriday).toEqual([]);
  }, 60_000);

  it('ACTIVITY_FIXED_TIME (#1 bug): aktivite tam sabitlenen slotta yer alır', async () => {
    // act5 (9A Müzik) Pazartesi 1. saate sabit → çıktıda o fetId dayIndex0/hourIndex0'da olmalı.
    const bundle = baseSchool([mkConstraint('ACTIVITY_FIXED_TIME', { activityId: 5, day: 'Pazartesi', hour: 1 })]);
    const { xml, fetActivityIdsByActivity } = buildFetXml(bundle);
    const fixedFetId = (fetActivityIdsByActivity.get(5) ?? [])[0];
    expect(fixedFetId).toBeDefined();
    const r = runFet(xml, 10);
    expect(r.status).toBe(0);
    const { slots: out } = await parseTimetable(r.outDir, { bundle, fetActivityIdsByActivity });
    const placed = out.find((s) => s.activityId === fixedFetId);
    expect(placed, 'sabitlenen aktivite yerleşmemiş').toBeDefined();
    expect(placed!.dayIndex).toBe(0);
    expect(placed!.hourIndex).toBe(0);
  }, 60_000);

  it('CLASS_NOT_AVAILABLE: sınıf kapalı slotta ders almaz', async () => {
    const slots = [...Array(8)].map((_, i) => ({ day: 'Cuma', hour: i + 1 }));
    const bundle = baseSchool([mkConstraint('CLASS_NOT_AVAILABLE', { class: '9A', slots })]);
    const { xml, fetActivityIdsByActivity } = buildFetXml(bundle);
    const r = runFet(xml, 10);
    expect(r.status).toBe(0);
    const { slots: out } = await parseTimetable(r.outDir, { bundle, fetActivityIdsByActivity });
    const class9aFriday = out.filter((s) => s.className === '9A' && s.dayIndex === 4);
    expect(class9aFriday).toEqual([]);
  }, 60_000);

  it('TWO_ACTIVITIES_CONSECUTIVE (#2 bug): iki aktivite aynı gün ardışık saatlerde', async () => {
    // act5 (9A Müzik) ve act6 (9B Müzik) ardışık olsun → aynı gün, saat farkı tam 1.
    const bundle = baseSchool([mkConstraint('TWO_ACTIVITIES_CONSECUTIVE', { firstActivityId: 5, secondActivityId: 6 })]);
    const { xml, fetActivityIdsByActivity } = buildFetXml(bundle);
    const id5 = (fetActivityIdsByActivity.get(5) ?? [])[0];
    const id6 = (fetActivityIdsByActivity.get(6) ?? [])[0];
    const r = runFet(xml, 10);
    expect(r.status).toBe(0);
    const { slots: out } = await parseTimetable(r.outDir, { bundle, fetActivityIdsByActivity });
    const s5 = out.find((s) => s.activityId === id5);
    const s6 = out.find((s) => s.activityId === id6);
    expect(s5).toBeDefined();
    expect(s6).toBeDefined();
    expect(s5!.dayIndex).toBe(s6!.dayIndex);
    expect(Math.abs(s5!.hourIndex - s6!.hourIndex)).toBe(1);
  }, 60_000);
});
