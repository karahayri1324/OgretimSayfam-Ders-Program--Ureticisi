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

describe('EARLY_MAX_BEGINNINGS ağırlığı (#7)', () => {
  it('kullanıcı ağırlığını kullanır (sabit 100 değil)', () => {
    const xml = buildFetXml(
      makeBundle({
        constraints: [constraint('CLASS_EARLY_MAX_BEGINNINGS', { class: '9A', maxBeginnings: 0 }, 80)],
      }),
    ).xml;
    expect(xml).toMatch(
      /<ConstraintStudentsSetEarlyMaxBeginningsAtSecondHour>[\s\S]*?<Weight_Percentage>80<\/Weight_Percentage>/,
    );
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
