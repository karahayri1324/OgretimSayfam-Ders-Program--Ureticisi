import { describe, it, expect } from 'vitest';

import { buildFetXml } from '../electron/fet/xml-builder.js';
import type { SchoolBundle } from '../electron/fet/types.js';
import type { Constraint, DayHour } from '../src/lib/types.js';


function makeBundle(opts: {
  constraints?: Constraint[];
  homeRoomId?: number | null;
  dayHours?: DayHour[];
} = {}): SchoolBundle {
  return {
    institutionName: 'Test Okulu',
    days: [
      { id: 1, name: 'Pazartesi', orderIndex: 0 },
      { id: 2, name: 'Salı', orderIndex: 1 },
      { id: 3, name: 'Çarşamba', orderIndex: 2 },
    ],
    hours: [
      { id: 1, name: '1. Ders', orderIndex: 0, startTime: null, endTime: null },
      { id: 2, name: '2. Ders', orderIndex: 1, startTime: null, endTime: null },
      { id: 3, name: '3. Ders', orderIndex: 2, startTime: null, endTime: null },
    ],
    dayHours: opts.dayHours,
    subjects: [{ id: 1, name: 'Matematik', shortCode: 'MAT', color: null, notes: null }],
    teachers: [
      { id: 1, name: 'Ahmet Yılmaz', weeklyTargetHours: 0, notes: null, subjectIds: [1] },
    ],
    classes: [
      { id: 1, yearId: 1, name: '9A', studentCount: 30, homeRoomId: opts.homeRoomId ?? null },
    ],
    years: [{ id: 1, name: '9', orderIndex: 0 }],
    rooms: [{ id: 1, name: '101', capacity: 30, building: null, notes: null }],
    activities: [
      { id: 1, classId: 1, subjectId: 1, teacherId: 1, weeklyHours: 4, blockDuration: 1, notes: null },
    ],
    constraints: opts.constraints ?? [],
  };
}

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

const countTag = (xml: string, tag: string) =>
  (xml.match(new RegExp(`<${tag}>`, 'g')) || []).length;

describe('ACTIVITY_FIXED_TIME — çok-saatli aktivite (#1/#4)', () => {
  it('tek slot kilidi çok-saatli aktivitenin TÜM alt-aktivitelerini pinlemez (yalnızca 1)', () => {
    const xml = buildFetXml(
      makeBundle({
        constraints: [constraint('ACTIVITY_FIXED_TIME', { activityId: 1, day: 'Pazartesi', hour: 1 })],
      }),
    ).xml;
    expect(countTag(xml, 'ConstraintActivityPreferredStartingTime')).toBe(1);
  });

  it('aynı aktiviteye iki ayrı slot kilidi FARKLI alt-aktivitelere ayrılır', () => {
    const xml = buildFetXml(
      makeBundle({
        constraints: [
          constraint('ACTIVITY_FIXED_TIME', { activityId: 1, day: 'Pazartesi', hour: 1 }),
          constraint('ACTIVITY_FIXED_TIME', { activityId: 1, day: 'Salı', hour: 2 }),
        ],
      }),
    ).xml;
    expect(countTag(xml, 'ConstraintActivityPreferredStartingTime')).toBe(2);
    const ids = [...xml.matchAll(/<ConstraintActivityPreferredStartingTime>[\s\S]*?<Activity_Id>(\d+)<\/Activity_Id>/g)].map(
      (m) => m[1],
    );
    expect(ids.length).toBe(2);
    expect(new Set(ids).size).toBe(2); // iki farklı fetId → çelişki yok
  });
});

describe('EARLY_MAX_BEGINNINGS ağırlığı (#7 → tur-11 revizyonu)', () => {
  // Tur-1'deki #7 fix'i kullanıcı ağırlığını olduğu gibi geçiriyordu; fet-cl 6.8.5 ile ampirik
  // doğrulandı ki bu aile <100 ağırlıkta ÜRETİMİN TAMAMINI abort ediyor ("Cannot optimize...
  // early m.b.a.s.h. ... with weight percentage less than 100%"). Doğru davranış: 100'e clamp.
  it('<100 ağırlığı 100e sabitler ve yorumda belirtir (FET zorunluluğu)', () => {
    const xml = buildFetXml(
      makeBundle({
        constraints: [constraint('CLASS_EARLY_MAX_BEGINNINGS', { class: '9A', maxBeginnings: 0 }, 80)],
      }),
    ).xml;
    expect(xml).toMatch(
      /<ConstraintStudentsSetEarlyMaxBeginningsAtSecondHour>[\s\S]*?<Weight_Percentage>100<\/Weight_Percentage>/,
    );
    expect(xml).toMatch(/Ağırlık 80→100 sabitlendi/);
  });
});

describe('Ana derslik (home_room_id) üretimde uygulanır (C1)', () => {
  it('home_room_id set ise ConstraintStudentsSetHomeRoom otomatik üretilir', () => {
    const xml = buildFetXml(makeBundle({ homeRoomId: 1 })).xml;
    expect(xml).toMatch(
      /<ConstraintStudentsSetHomeRoom>[\s\S]*?<Students>9A<\/Students>[\s\S]*?<Room>101<\/Room>/,
    );
  });

  it('explicit CLASS_HOME_ROOM varsa otomatik üretim ÇİFTLEMEZ', () => {
    const xml = buildFetXml(
      makeBundle({
        homeRoomId: 1,
        constraints: [constraint('CLASS_HOME_ROOM', { class: '9A', room: '101' })],
      }),
    ).xml;
    expect(countTag(xml, 'ConstraintStudentsSetHomeRoom')).toBe(1);
  });

  it('home_room_id null ise otomatik kısıt üretilmez', () => {
    const xml = buildFetXml(makeBundle({ homeRoomId: null })).xml;
    expect(countTag(xml, 'ConstraintStudentsSetHomeRoom')).toBe(0);
  });
});

describe('Uzun gün saat listesi parser\'a aktarılır (#6)', () => {
  it('bir gün global\'den uzunsa BuildResult.hours genişletilmiş listeyi içerir', () => {
    const dayHours: DayHour[] = [0, 1, 2, 3, 4].map((i) => ({
      id: i + 1,
      dayId: 1,
      orderIndex: i,
      name: `${i + 1}. Ders`,
      startTime: null,
      endTime: null,
    }));
    const built = buildFetXml(makeBundle({ dayHours }));
    expect(built.hours.length).toBe(5);
    expect(built.hours.map((h) => h.name)).toContain('4. Ders');
    expect(built.hours.map((h) => h.name)).toContain('5. Ders');
  });
});

describe('Round-3: FET geçersiz tag/alan adları (#10-#16)', () => {
  it('TEACHER_MAX_BUILDING_CHANGES_PER_DAY space-kısıtı <Teacher> kullanır (Teacher_Name DEĞİL)', () => {
    const xml = buildFetXml(
      makeBundle({
        constraints: [
          constraint('TEACHER_MAX_BUILDING_CHANGES_PER_DAY', { teacher: 'Ahmet Yılmaz', maxChanges: 1 }),
        ],
      }),
    ).xml;
    const block = xml.match(
      /<ConstraintTeacherMaxBuildingChangesPerDay>[\s\S]*?<\/ConstraintTeacherMaxBuildingChangesPerDay>/,
    )?.[0];
    expect(block).toBeTruthy();
    expect(block).toContain('<Teacher>Ahmet Yılmaz</Teacher>');
    expect(block).not.toContain('Teacher_Name');
    expect(block).toContain('<Max_Building_Changes_Per_Day>');
  });

  it('TEACHER_MIN_GAPS_BETWEEN_BUILDING_CHANGES → <Teacher> + <Min_Gaps_Between_Building_Changes>', () => {
    const xml = buildFetXml(
      makeBundle({
        constraints: [
          constraint('TEACHER_MIN_GAPS_BETWEEN_BUILDING_CHANGES', { teacher: 'Ahmet Yılmaz', minGaps: 1 }),
        ],
      }),
    ).xml;
    const block = xml.match(
      /<ConstraintTeacherMinGapsBetweenBuildingChanges>[\s\S]*?<\/ConstraintTeacherMinGapsBetweenBuildingChanges>/,
    )?.[0];
    expect(block).toBeTruthy();
    expect(block).toContain('<Teacher>Ahmet Yılmaz</Teacher>');
    expect(block).toContain('<Min_Gaps_Between_Building_Changes>');
    expect(block).not.toContain('Teacher_Name');
  });

  it('ACTIVITIES_OCCUPY_MAX_DIFFERENT_ROOMS → <Max_Number_of_Different_Rooms> (yanlış Max_Different_Rooms DEĞİL)', () => {
    const xml = buildFetXml(
      makeBundle({
        constraints: [
          constraint('ACTIVITIES_OCCUPY_MAX_DIFFERENT_ROOMS', { activityIds: [1], maxDifferentRooms: 1 }),
        ],
      }),
    ).xml;
    expect(xml).toContain('<Max_Number_of_Different_Rooms>');
    expect(xml).not.toContain('<Max_Different_Rooms>');
  });

  it('SUBJECT_PREFERRED_HOURS (sınıfsız) hayalet ConstraintSubjectPreferredTimeSlots ÜRETMEZ', () => {
    const xml = buildFetXml(
      makeBundle({
        constraints: [constraint('SUBJECT_PREFERRED_HOURS', { subject: 'Matematik', preferredHours: [1, 2] })],
      }),
    ).xml;
    expect(xml).not.toContain('ConstraintSubjectPreferredTimeSlots');
    expect(countTag(xml, 'ConstraintActivityPreferredTimeSlots')).toBeGreaterThan(0);
  });

  it('SUBJECT_MAX_HOURS_DAILY hayalet ConstraintActivitiesMaxHoursDaily ÜRETMEZ', () => {
    const xml = buildFetXml(
      makeBundle({
        constraints: [constraint('SUBJECT_MAX_HOURS_DAILY', { subject: 'Matematik', maxHours: 2 })],
      }),
    ).xml;
    expect(xml).not.toContain('ConstraintActivitiesMaxHoursDaily');
  });
});

describe('Round-5 regresyon', () => {
  it('expandSlots numerik-STRING saat ("2") ile slotu DÜŞÜRMEZ — kısıt üretilir (#1)', () => {
    const xml = buildFetXml(
      makeBundle({
        constraints: [
          constraint('TEACHER_NOT_AVAILABLE', {
            teacher: 'Ahmet Yılmaz',
            slots: [{ day: 'Pazartesi', hour: '2' }],
          }),
        ],
      }),
    ).xml;
    expect(countTag(xml, 'ConstraintTeacherNotAvailableTimes')).toBe(1);
  });

  it('SUBJECT_CONSECUTIVE_HOURS (sınıfsız) FARKLI sınıfların derslerini ardışık zorlamaz (#2)', () => {
    const bundle: SchoolBundle = {
      institutionName: 'Test',
      days: [
        { id: 1, name: 'Pazartesi', orderIndex: 0 },
        { id: 2, name: 'Salı', orderIndex: 1 },
      ],
      hours: [
        { id: 1, name: '1. Ders', orderIndex: 0, startTime: null, endTime: null },
        { id: 2, name: '2. Ders', orderIndex: 1, startTime: null, endTime: null },
      ],
      subjects: [{ id: 1, name: 'Matematik', shortCode: null, color: null, notes: null }],
      teachers: [{ id: 1, name: 'T1', weeklyTargetHours: 0, notes: null, subjectIds: [1] }],
      classes: [
        { id: 1, yearId: 1, name: '9A', studentCount: 30, homeRoomId: null },
        { id: 2, yearId: 1, name: '9B', studentCount: 30, homeRoomId: null },
      ],
      years: [{ id: 1, name: '9', orderIndex: 0 }],
      rooms: [{ id: 1, name: '101', capacity: 30, building: null, notes: null }],
      activities: [
        { id: 1, classId: 1, subjectId: 1, teacherId: 1, weeklyHours: 1, blockDuration: 1, notes: null },
        { id: 2, classId: 2, subjectId: 1, teacherId: 1, weeklyHours: 1, blockDuration: 1, notes: null },
      ],
      constraints: [constraint('SUBJECT_CONSECUTIVE_HOURS', { subject: 'Matematik' })],
    };
    // 9A ve 9B'nin 1'er saatlik dersleri çapraz eşleşmemeli → hiç consecutive çifti olmamalı.
    expect(countTag(buildFetXml(bundle).xml, 'ConstraintTwoActivitiesConsecutive')).toBe(0);
  });

  it('SUBJECT_CONSECUTIVE_HOURS tek sınıfta çok-bloklu dersi KENDİ alt-aktiviteleri içinde çiftler (#2)', () => {
    const xml = buildFetXml(
      makeBundle({
        constraints: [constraint('SUBJECT_CONSECUTIVE_HOURS', { subject: 'Matematik' })],
      }),
    ).xml;
    // 9A Matematik weeklyHours=4 → 4 alt-aktivite → 2 ardışık çift (sınıf-içi davranış korunur).
    expect(countTag(xml, 'ConstraintTwoActivitiesConsecutive')).toBe(2);
  });
});

describe('Round-6 — FET XML guvenligi', () => {
  // XML 1.0 metin-yasak kontrol karakterleri: 0x00-08, 0x0B, 0x0C, 0x0E-1F.
  const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;

  it('ad/notlardaki XML-1.0-yasak kontrol karakterleri strip edilir; XML well-formed kalir (#6)', () => {
    const b = makeBundle();
    // Guvenilmez serbest metin: ic kontrol karakteri + dusey-tab; eskiden ham yazilip fet-cl'in
    // XML parser'ini cokertiyordu.
    b.teachers[0]!.name = 'Ahmet\u0001\u000BYilmaz';
    b.rooms[0]!.name = 'Lab\u0001';
    b.subjects[0]!.notes = 'not\u0002satiri';
    const { xml } = buildFetXml(b);
    expect(CONTROL_RE.test(xml)).toBe(false);
    expect(xml).toContain('AhmetYilmaz');
    expect(xml).toContain('Lab</Name>');
  });

  it('turetilmis ogrenci-kumesi adi baska sinifin adiyla cakisirsa net hata firlatir (#7)', () => {
    const b = makeBundle();
    b.classes = [
      { id: 1, yearId: 1, name: '5A', studentCount: 30, homeRoomId: null },
      { id: 2, yearId: 1, name: '5A_g1', studentCount: 20, homeRoomId: null },
    ];
    // 5A'yi 2 gruba bol -> sentetik altgrup '5A_g1' uretilir; gercek '5A_g1' sinifinin Group'u
    // ile cakisir -> FET ayni isimli iki Students-set gorur. Uretimden ONCE net hatayla yakala.
    b.activities = [
      { id: 1, classId: 1, subjectId: 1, teacherId: 1, weeklyHours: 2, blockDuration: 1, notes: null, splitGroupId: 10 },
      { id: 2, classId: 1, subjectId: 1, teacherId: 1, weeklyHours: 2, blockDuration: 1, notes: null, splitGroupId: 10 },
      { id: 3, classId: 2, subjectId: 1, teacherId: 1, weeklyHours: 2, blockDuration: 1, notes: null },
    ];
    expect(() => buildFetXml(b)).toThrow(/çakış/i);
  });

  it('normal sinif adlari cakisma denetimini tetiklemez (false-positive yok)', () => {
    expect(() => buildFetXml(makeBundle())).not.toThrow();
  });
});
