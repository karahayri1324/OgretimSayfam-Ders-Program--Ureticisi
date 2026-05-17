/**
 * FET XML builder smoke testi.
 *
 * Bu test:
 *  - Küçük bir SchoolBundle ile buildFetXml çağırır
 *  - Türkçe karakter, block expansion, auto constraint'ler ve constraint
 *    handler çıktısının XML'de doğru göründüğünü doğrular
 *  - Üretilen XML'i geçici dosyaya yazıp /usr/bin/fet-cl ile çalıştırarak
 *    FET'in dosyayı kabul ettiğini ve activities.xml ürettiğini ispatlar
 *    (CI/headless ortamlarda fet-cl yoksa o blok skip edilir)
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';

import { buildFetXml } from '../electron/fet/xml-builder.js';
import type { SchoolBundle } from '../electron/fet/types.js';

function makeBundle(): SchoolBundle {
  return {
    institutionName: 'Şişli Lisesi',
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
    ],
    subjects: [
      { id: 1, name: 'Matematik', shortCode: 'MAT', color: null, notes: null },
      { id: 2, name: 'Beden Eğitimi', shortCode: 'BE', color: null, notes: null },
    ],
    teachers: [
      {
        id: 1,
        name: 'Çağla Öztürk',
        weeklyTargetHours: 0,
        notes: null,
        subjectIds: [1],
      },
      {
        id: 2,
        name: 'İzmirli Ali',
        weeklyTargetHours: 0,
        notes: null,
        subjectIds: [2],
      },
    ],
    classes: [
      { id: 1, yearId: 1, name: '9A', studentCount: 30, homeRoomId: null },
      { id: 2, yearId: 1, name: '9B', studentCount: 30, homeRoomId: null },
    ],
    years: [{ id: 1, name: '9', orderIndex: 0 }],
    rooms: [
      { id: 1, name: '101', capacity: 30, building: null, notes: null },
      { id: 2, name: 'Spor Salonu', capacity: 60, building: null, notes: null },
    ],
    activities: [
      // 9A Matematik: weekly=4, block=1 → 4 ayrı Activity, Duration=1
      {
        id: 1,
        classId: 1,
        subjectId: 1,
        teacherId: 1,
        weeklyHours: 4,
        blockDuration: 1,
        notes: null,
      },
      // 9B Beden Eğitimi: weekly=4, block=2 → 2 ayrı Activity, Duration=2
      {
        id: 2,
        classId: 2,
        subjectId: 2,
        teacherId: 2,
        weeklyHours: 4,
        blockDuration: 2,
        notes: null,
      },
    ],
    constraints: [
      {
        id: 100,
        type: 'TEACHER_NOT_AVAILABLE',
        weight: 100,
        active: true,
        source: 'manual',
        aiMessageId: null,
        createdAt: '',
        notes: null,
        params: {
          teacher: 'Çağla Öztürk',
          slots: [{ day: 'Cuma', hour: 1 }, { day: 'Cuma', hour: 2 }],
        },
      },
      // Bilinmeyen öğretmen → skipped
      {
        id: 101,
        type: 'TEACHER_NOT_AVAILABLE',
        weight: 100,
        active: true,
        source: 'ai',
        aiMessageId: null,
        createdAt: '',
        notes: null,
        params: { teacher: 'Bilinmeyen Hoca', slots: [{ day: 'Cuma', hour: 1 }] },
      },
    ],
  };
}

describe('buildFetXml', () => {
  it('Türkçe karakterleri UTF-8 olarak korur', () => {
    const out = buildFetXml(makeBundle());
    expect(out.xml).toContain('Şişli Lisesi');
    expect(out.xml).toContain('Çağla Öztürk');
    expect(out.xml).toContain('İzmirli Ali');
    expect(out.xml).toContain('Beden Eğitimi');
    expect(out.xml).toContain('Spor Salonu');
    expect(out.xml).toMatch(/<\?xml version="1\.0" encoding="UTF-8"\?>/);
  });

  it('Activity satırlarını block duration\'a göre genişletir', () => {
    const out = buildFetXml(makeBundle());
    // 9A Mat: 4 saat, block 1 → 4 ayrı Activity (Id'leri 1,2,3,4)
    // 9B Beden: 4 saat, block 2 → 2 ayrı Activity (Id'leri 5,6), Duration=2
    const ids9A = out.fetActivityIdsByActivity.get(1);
    const ids9B = out.fetActivityIdsByActivity.get(2);
    expect(ids9A).toHaveLength(4);
    expect(ids9B).toHaveLength(2);
    // her DB activity ayrı Activity_Group_Id
    expect(out.activityGroupIdById.get(1)).not.toBe(out.activityGroupIdById.get(2));
  });

  it('Otomatik constraint\'leri ekler', () => {
    const xml = buildFetXml(makeBundle()).xml;
    expect(xml).toContain('<ConstraintBasicCompulsoryTime>');
    expect(xml).toContain('<ConstraintBasicCompulsorySpace>');
    expect(xml).toContain('<ConstraintMinDaysBetweenActivities>');
    expect(xml).toMatch(/<MinDays>1<\/MinDays>/);
  });

  it('Constraint handler\'larını çağırır ve TEACHER_NOT_AVAILABLE üretir', () => {
    const xml = buildFetXml(makeBundle()).xml;
    expect(xml).toContain('<ConstraintTeacherNotAvailableTimes>');
    expect(xml).toMatch(/<Teacher>Çağla Öztürk<\/Teacher>/);
  });

  it('Bilinmeyen öğretmeni skipped\'a ekler', () => {
    const out = buildFetXml(makeBundle());
    expect(out.skipped.length).toBeGreaterThan(0);
    expect(out.skipped.find(s => s.reason.includes('Bilinmeyen Hoca'))).toBeTruthy();
  });

  it('FET 6.x Subgroup zorunluluğunu karşılar (Group != Subgroup adı)', () => {
    const xml = buildFetXml(makeBundle()).xml;
    expect(xml).toMatch(/<Group>\s*<Name>9A<\/Name>/);
    expect(xml).toMatch(/<Subgroup>\s*<Name>9A_s<\/Name>/);
  });
});

describe('fet-cl entegrasyon (sadece sistem fet-cl varsa)', () => {
  const haveFet = (() => {
    try {
      execSync('which fet-cl', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  })();

  it.skipIf(!haveFet)('üretilen XML\'i FET kabul eder ve activities.xml üretir', () => {
    const out = buildFetXml(makeBundle());
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dpotest-'));
    const inFile = path.join(tmp, 'input.fet');
    const outDir = path.join(tmp, 'out');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(inFile, out.xml, 'utf-8');

    const r = spawnSync(
      '/usr/bin/fet-cl',
      [
        `--inputfile=${inFile}`,
        `--outputdir=${outDir}`,
        '--language=en_US',
        '--timelimitseconds=15',
        '--htmllevel=0',
      ],
      { encoding: 'utf-8' },
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Simulation successful');

    // activities.xml bulunmalı
    let found: string | null = null;
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/_activities\.xml$/.test(e.name)) found = full;
      }
    };
    walk(outDir);
    expect(found).toBeTruthy();

    const acts = fs.readFileSync(found!, 'utf-8');
    expect(acts).toContain('<Activities_Timetable>');
    // 4 (9A Mat) + 2 (9B Beden) = 6 Activity
    expect(acts.match(/<Activity>/g)?.length).toBe(6);
  });
});
