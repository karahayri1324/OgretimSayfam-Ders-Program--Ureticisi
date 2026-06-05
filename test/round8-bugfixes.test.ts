// Tur-8 bug avı regresyon testleri. Saf-fonksiyon (buildFetXml) ile test edilebilen fix'ler +
// gerçek fet-cl ground-truth'una karşı doğrulanan runner sınıflandırması.
// NOT: mutation-executor (#2/#3/#7/#8) ve tools.ts (#4/#9/#10) fix'leri electron-bağımlı DB
// katmanını gerektirdiğinden (test harness'ı yok) burada birim-test edilmiyor; kod-okuması +
// workflow 3-oy adversarial doğrulamasıyla teyit edildiler.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { buildFetXml } from '../electron/fet/xml-builder';
import { isInfeasibleFetOutput } from '../electron/fet/runner';
import type { SchoolBundle } from '../electron/fet/types';
import type { Constraint } from '../src/lib/types';

function bundle(opts: {
  constraints?: Constraint[];
  homeRoomId?: number | null;
  weeklyHours?: number;
  hours?: number;
  days?: number;
} = {}): SchoolBundle {
  const nDays = opts.days ?? 5;
  const nHours = opts.hours ?? 6;
  const dayNames = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
  return {
    institutionName: 'Tur8 Test',
    days: Array.from({ length: nDays }, (_, i) => ({ id: i + 1, name: dayNames[i]!, orderIndex: i })),
    hours: Array.from({ length: nHours }, (_, i) => ({
      id: i + 1, name: `${i + 1}. Ders`, orderIndex: i, startTime: null, endTime: null,
    })),
    subjects: [{ id: 1, name: 'Matematik', shortCode: 'MAT', color: null, notes: null }],
    teachers: [{ id: 1, name: 'Ahmet Yılmaz', weeklyTargetHours: 0, notes: null, subjectIds: [1] }],
    years: [{ id: 1, name: '9', orderIndex: 0 }],
    classes: [{ id: 1, yearId: 1, name: '9A', studentCount: 20, homeRoomId: opts.homeRoomId ?? null }],
    rooms: [
      { id: 1, name: '101', capacity: 40, building: null, notes: null },
      { id: 2, name: '102', capacity: 40, building: null, notes: null },
    ],
    activities: [
      { id: 1, classId: 1, subjectId: 1, teacherId: 1, weeklyHours: opts.weeklyHours ?? 4, blockDuration: 1, notes: null },
    ],
    constraints: opts.constraints ?? [],
  };
}

function mk(type: string, params: Record<string, unknown>): Constraint {
  return { id: 1, type: type as Constraint['type'], weight: 100, active: true, params, source: 'ai', aiMessageId: null, createdAt: '', notes: null };
}

function runFetRaw(xml: string, timeLimitSec = 6): { status: number | null; stdout: string } {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tur8-'));
  fs.writeFileSync(path.join(tmp, 'in.fet'), xml, 'utf-8');
  const outDir = path.join(tmp, 'out');
  fs.mkdirSync(outDir);
  const r = spawnSync('/usr/bin/fet-cl', [
    `--inputfile=${path.join(tmp, 'in.fet')}`,
    `--outputdir=${outDir}`,
    '--language=en_US',
    `--timelimitseconds=${timeLimitSec}`,
  ], { encoding: 'utf-8', timeout: (timeLimitSec + 30) * 1000 });
  return { status: r.status, stdout: r.stdout ?? '' };
}

// ===========================================================================
// #1 — Infeasibility sınıflandırması. NOT (dürüstlük): fet-cl 6.8.5'te denediğim TÜM
// infeasibility türleri (slot-yetmezliği, "data is wrong - aborting" precompute reddi) EXIT 1
// veriyor — bunları classifyError zaten yakalıyordu. Finder'ın "exit 0" iddiasını mevcut binary'de
// yeniden üretemedim. Yine de fix MEŞRU savunmacı sağlamlaştırma: (a) eski satır-158 regex'i
// classifyError'dan DAR idi ("cannot precompute/optimize", "not enough", "number of hours"
// kaçırıyordu) — paylaşılan INFEASIBLE_RE ile birleştirildi; (b) parse-fail + infeasible-metin
// artık PARSE_ERROR yerine NO_SOLUTION'a düşer. Testler bu sınıflandırmayı GERÇEK FET çıktısına
// karşı doğrular (exit koduna bağlanmadan).
// ===========================================================================
describe('#1 runner — infeasibility sınıflandırması (gerçek fet-cl)', () => {
  it('çözülemez veri (3 ders / 2 slot) infeasible olarak yakalanır', () => {
    // 1 gün × 2 saat = 2 slot; aynı sınıfa 3 saatlik ders → FET çözemez.
    const xml = buildFetXml(bundle({ days: 1, hours: 2, weeklyHours: 3 })).xml;
    const r = runFetRaw(xml);
    expect(r.stdout).not.toContain('Simulation successful');
    // Fix'in kalbi: çıktı (exit kodu ne olursa olsun) infeasible olarak sınıflanmalı → NO_SOLUTION.
    expect(isInfeasibleFetOutput(r.stdout)).toBe(true);
  }, 60_000);

  it('çözülebilir programın çıktısı infeasible olarak YANLIŞ sınıflanmaz', () => {
    const xml = buildFetXml(bundle({ days: 5, hours: 6, weeklyHours: 4 })).xml;
    const r = runFetRaw(xml);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Simulation successful');
    expect(isInfeasibleFetOutput(r.stdout)).toBe(false);
  }, 60_000);

  it('birleşik regex, eski dar regex\'in KAÇIRDIĞI kalıpları da yakalar', () => {
    // Eski satır-158 regex'i yalnız: could not generate|impossible|imkans|olanaks
    // Aşağıdakileri KAÇIRIYORDU (artık yakalanıyor):
    expect(isInfeasibleFetOutput('Cannot precompute - data is wrong - aborting')).toBe(true);
    expect(isInfeasibleFetOutput('the number of total hours for this subgroup is 3 and the number of available slots is 2')).toBe(true);
    expect(isInfeasibleFetOutput('Cannot optimize for subgroup')).toBe(true);
    // Başarı metni infeasible sayılmamalı:
    expect(isInfeasibleFetOutput('Starting timetable generation...\nSimulation successful')).toBe(false);
  });
});

// ===========================================================================
// #6 — homeRoomId + kullanıcı STUDENTS_SET_HOME_ROOMS verince, otomatik tek-oda kısıtı
// kullanıcının çok-odalı tercihini ezmemeli (auto kısıt bastırılmalı).
// ===========================================================================
describe('#6 xml-builder — auto home-room, STUDENTS_SET_HOME_ROOMS ile dedup edilir', () => {
  it('homeRoomId VAR + kullanıcı çok-odalı tercih → auto tek-oda kısıtı ÜRETİLMEZ', () => {
    const { xml } = buildFetXml(bundle({
      homeRoomId: 1,
      constraints: [mk('STUDENTS_SET_HOME_ROOMS', { class: '9A', rooms: ['101', '102'] })],
    }));
    // Kullanıcının çoklu-oda kısıtı var:
    expect(xml).toContain('<ConstraintStudentsSetHomeRooms>');
    // Auto tek-oda kısıtı (95 ağırlık, 'Ana derslik (auto)') BASTIRILMIŞ olmalı:
    expect(xml).not.toContain('Ana derslik (auto)');
  });

  it('kontrol: homeRoomId VAR ama kullanıcı kısıtı YOK → auto tek-oda kısıtı üretilir', () => {
    const { xml } = buildFetXml(bundle({ homeRoomId: 1 }));
    expect(xml).toContain('Ana derslik (auto)');
  });

  it('CLASS_HOME_ROOM (tek oda) de auto kısıtı bastırır (mevcut davranış korunur)', () => {
    const { xml } = buildFetXml(bundle({
      homeRoomId: 1,
      constraints: [mk('CLASS_HOME_ROOM', { class: '9A', room: '102' })],
    }));
    expect(xml).not.toContain('Ana derslik (auto)');
  });
});
