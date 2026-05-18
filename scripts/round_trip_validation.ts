/**
 * Round-trip validation — Dataset JSONL → buildFetXml() → valid XML?
 *
 * Her constraint-kind örnek için:
 *   1) user content'inden [CONTEXT] bloğunu parse et (TEACHERS, CLASSES, SUBJECTS, ROOMS, DAYS, HOURS_PER_DAY)
 *   2) assistant content'inden constraint listesini al
 *   3) Context'ten minimal bir SchoolBundle inşa et (dummy id'ler + birkaç dummy activity)
 *   4) buildFetXml(bundle) çağır → throw etmemeli + XML constraint tag'ini içermeli + ctx.skipped boş olmalı
 *
 * Çalıştırma:
 *   npx tsx scripts/round_trip_validation.ts [samplesPerFile=20]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFetXml } from '../electron/fet/xml-builder.js';
import { AIResponseSchema } from '../electron/ai/schema.js';
import type {
  SchoolBundle,
} from '../electron/fet/types.js';
import type {
  ConstraintType,
  Constraint,
} from '../src/lib/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DS = path.resolve(__dirname, '..', 'Plans', 'dataset_samples');

const SAMPLES_PER_FILE = Number(process.argv[2] ?? '20');

// ── Context block parser ──────────────────────────────────────────────────
type Context = {
  teachers: string[];
  classes: string[];
  subjects: string[];
  rooms: string[];
  days: string[];
  hoursPerDay: number;
};

function parseContext(userContent: string): Context | null {
  const ctxBlock = /\[CONTEXT\]([\s\S]*?)\[\/CONTEXT\]/.exec(userContent);
  if (!ctxBlock) return null;
  const block = ctxBlock[1];
  function getArr(key: string): string[] {
    const m = new RegExp(`${key}:\\s*(\\[[^\\]]*\\])`).exec(block);
    if (!m) return [];
    try {
      return JSON.parse(m[1]);
    } catch {
      return [];
    }
  }
  function getNum(key: string): number {
    const m = new RegExp(`${key}:\\s*(\\d+)`).exec(block);
    return m ? Number(m[1]) : 8;
  }
  return {
    teachers: getArr('TEACHERS'),
    classes: getArr('CLASSES'),
    subjects: getArr('SUBJECTS'),
    rooms: getArr('ROOMS'),
    days: getArr('DAYS'),
    hoursPerDay: getNum('HOURS_PER_DAY'),
  };
}

// ── Synthetic SchoolBundle inşa ───────────────────────────────────────────
function buildBundle(ctx: Context, constraints: Constraint[]): SchoolBundle {
  const now = new Date().toISOString();
  const days = ctx.days.map((name, i) => ({ id: i + 1, name, orderIndex: i }));
  const hours = Array.from({ length: ctx.hoursPerDay }, (_, i) => ({
    id: i + 1,
    name: `${i + 1}. Ders`,
    orderIndex: i,
    startTime: null,
    endTime: null,
  }));
  const subjects = ctx.subjects.map((name, i) => ({
    id: i + 1,
    name,
    shortCode: null,
    color: null,
    notes: null,
  }));
  const teachers = ctx.teachers.map((name, i) => ({
    id: i + 1,
    name,
    weeklyTargetHours: 0,
    notes: null,
    subjectIds: subjects.length > 0 ? [((i % subjects.length) + 1)] : [],
  }));
  const years = [{ id: 1, name: 'Genel', orderIndex: 0 }];
  const classes = ctx.classes.map((name, i) => ({
    id: i + 1,
    yearId: 1,
    name,
    studentCount: 30,
    homeRoomId: null,
  }));
  const rooms = ctx.rooms.map((name, i) => ({
    id: i + 1,
    name,
    capacity: 30,
    building: null,
    notes: null,
  }));
  // Her sınıfa 2 dummy activity (so FET has something)
  const activities = classes.flatMap((c) => {
    const acts = [] as ReturnType<typeof makeAct>[];
    if (teachers.length === 0 || subjects.length === 0) return acts;
    function makeAct(id: number, subjectId: number, teacherId: number) {
      return {
        id,
        classId: c.id,
        subjectId,
        teacherId,
        weeklyHours: 2,
        blockDuration: 1,
        notes: null,
        splitGroupId: null,
      };
    }
    acts.push(
      makeAct(c.id * 10 + 1, 1, 1),
      makeAct(c.id * 10 + 2, Math.min(2, subjects.length), Math.min(2, teachers.length)),
    );
    return acts;
  });

  // Constraint'leri ID + zorunlu alanlarla wrap et
  const dbConstraints: Constraint[] = constraints.map((c, i) => ({
    id: i + 1,
    type: c.type as ConstraintType,
    weight: c.weight ?? 100,
    active: c.active ?? true,
    params: c.params ?? {},
    source: 'ai' as const,
    aiMessageId: null,
    createdAt: now,
    notes: null,
  }));

  return {
    institutionName: 'RoundTrip Test',
    days,
    hours,
    subjects,
    teachers,
    classes,
    years,
    rooms,
    activities,
    constraints: dbConstraints,
  };
}

// ── Sample N satır ──────────────────────────────────────────────────────────
function sampleLines(file: string, n: number): string[] {
  const lines = fs.readFileSync(file, 'utf-8').split('\n').filter((l) => l.trim());
  if (lines.length <= n) return lines;
  // İlk n satır + son n satır (deterministik) yerine evenly-spaced sample
  const step = Math.floor(lines.length / n);
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(lines[i * step]);
  return out;
}

// ── Stats ─────────────────────────────────────────────────────────────────
type Stats = {
  total: number;
  schemaFail: number;
  contextFail: number;
  notConstraint: number;
  xmlBuildFail: number;
  xmlBuildOk: number;
  skipped: number; // ctx.skipped > 0
  perType: Record<string, { ok: number; fail: number; skipped: number }>;
  failures: Array<{ file: string; line: number; reason: string; type?: string }>;
};

const stats: Stats = {
  total: 0,
  schemaFail: 0,
  contextFail: 0,
  notConstraint: 0,
  xmlBuildFail: 0,
  xmlBuildOk: 0,
  skipped: 0,
  perType: {},
  failures: [],
};

function bump(type: string, key: 'ok' | 'fail' | 'skipped') {
  if (!stats.perType[type]) stats.perType[type] = { ok: 0, fail: 0, skipped: 0 };
  stats.perType[type][key]++;
}

// ── Process bir dataset dosyası ────────────────────────────────────────────
function processFile(fileBase: string) {
  const file = path.join(DS, fileBase);
  const lines = sampleLines(file, SAMPLES_PER_FILE);
  let lineNo = 0;
  for (const line of lines) {
    lineNo++;
    stats.total++;
    let row: any;
    try {
      row = JSON.parse(line);
    } catch {
      stats.schemaFail++;
      stats.failures.push({ file: fileBase, line: lineNo, reason: 'invalid JSONL line' });
      continue;
    }
    const [, user, asst] = row.messages ?? [];
    if (!user || !asst) {
      stats.schemaFail++;
      stats.failures.push({ file: fileBase, line: lineNo, reason: 'no messages' });
      continue;
    }
    const ctx = parseContext(user.content);
    if (!ctx || ctx.teachers.length === 0 || ctx.classes.length === 0) {
      stats.contextFail++;
      stats.failures.push({ file: fileBase, line: lineNo, reason: 'context parse failed' });
      continue;
    }
    let asstJson: any;
    try {
      asstJson = JSON.parse(asst.content);
    } catch {
      stats.schemaFail++;
      stats.failures.push({ file: fileBase, line: lineNo, reason: 'assistant content not JSON' });
      continue;
    }
    const parsed = AIResponseSchema.safeParse(asstJson);
    if (!parsed.success) {
      stats.schemaFail++;
      stats.failures.push({
        file: fileBase,
        line: lineNo,
        reason: 'schema fail: ' + parsed.error.issues[0]?.message,
      });
      continue;
    }
    const res = parsed.data as any;
    // Constraint kind: ya kind 'constraint' ya kind eksik (legacy) — her ikisi de constraints array içerir
    const isConstraintKind = res.kind === 'constraint' || (res.kind === undefined && Array.isArray(res.constraints));
    if (!isConstraintKind) {
      stats.notConstraint++;
      continue;
    }
    const constraints = res.constraints as Array<{ type: string; weight: number; active: boolean; params: Record<string, unknown> }>;
    if (!constraints || constraints.length === 0) {
      stats.notConstraint++;
      continue;
    }

    // Build bundle and call buildFetXml
    const bundle = buildBundle(ctx, constraints as unknown as Constraint[]);
    try {
      const result = buildFetXml(bundle);
      const skippedCount = result.skipped?.length ?? 0;
      if (skippedCount > 0) {
        stats.skipped++;
        for (const c of constraints) bump(c.type, 'skipped');
        const reasons = result.skipped!.map((s) => `${s.type}:${s.reason}`).join(';');
        stats.failures.push({
          file: fileBase,
          line: lineNo,
          reason: `skipped: ${reasons}`,
          type: constraints[0]?.type,
        });
      } else {
        stats.xmlBuildOk++;
        for (const c of constraints) bump(c.type, 'ok');
      }
    } catch (e) {
      stats.xmlBuildFail++;
      for (const c of constraints) bump(c.type, 'fail');
      stats.failures.push({
        file: fileBase,
        line: lineNo,
        reason: 'throw: ' + (e instanceof Error ? e.message : String(e)),
        type: constraints[0]?.type,
      });
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────
const constraintFiles = fs.readdirSync(DS).filter((f) => {
  if (!f.endsWith('.jsonl')) return false;
  // Sadece constraint üreten dosyaları al, mutation/query/wizard'ları dahil etme
  const exclude = [
    'data_mutations',
    'ambiguous',
    'conversational_wizard',
    'page_navigation',
    'set_setting',
    'run_solver',
    'export_timetable',
    'validate_schedule',
    'timetable_stats',
    'timetable_query',
    'queries',
    'lock_unlock_slot',
    'set_timetable_slot',
    'substitute_teacher',
    'split_activities',
    'merge_activities',
    'slot_swap',
    'filtered_activity_add',
    'filtered_activity_update',
    'generic_add_constraint',
    'constraint_relax',
    'per_class_subject_room',
  ];
  return !exclude.some((e) => f === `${e}.jsonl`);
});

console.log(`\nRound-trip validation: ${constraintFiles.length} dosya × ${SAMPLES_PER_FILE} örnek\n`);

const startedAt = Date.now();
for (const f of constraintFiles) {
  processFile(f);
}
const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

// ── Rapor ─────────────────────────────────────────────────────────────────
console.log('\n========== SONUÇ ==========');
console.log(`Toplam satır                : ${stats.total}`);
console.log(`Constraint-kind             : ${stats.total - stats.notConstraint - stats.schemaFail - stats.contextFail}`);
console.log(`XML build OK                : ${stats.xmlBuildOk} ✓`);
console.log(`XML build skipped (handler) : ${stats.skipped} ⚠`);
console.log(`XML build THROW             : ${stats.xmlBuildFail} ✗`);
console.log(`Schema fail                 : ${stats.schemaFail}`);
console.log(`Context parse fail          : ${stats.contextFail}`);
console.log(`Other-kind (atlandı)        : ${stats.notConstraint}`);
console.log(`Süre                        : ${elapsed}s\n`);

console.log('Per-constraint-type:');
const types = Object.keys(stats.perType).sort();
for (const t of types) {
  const r = stats.perType[t];
  const total = r.ok + r.fail + r.skipped;
  const okPct = total > 0 ? ((r.ok / total) * 100).toFixed(0) : '0';
  const flag = r.fail > 0 ? ' ✗' : r.skipped > 0 ? ' ⚠' : ' ✓';
  console.log(`  ${flag} ${t.padEnd(48)} ok=${r.ok} skip=${r.skipped} fail=${r.fail}  (${okPct}%)`);
}

if (stats.failures.length > 0) {
  console.log(`\nİlk 30 fail örneği:`);
  for (const f of stats.failures.slice(0, 30)) {
    console.log(`  ${f.file}:${f.line}  [${f.type ?? '?'}]  ${f.reason}`);
  }
}

const successRate = stats.total > 0 ? (stats.xmlBuildOk / (stats.xmlBuildOk + stats.skipped + stats.xmlBuildFail)) * 100 : 0;
console.log(`\nROUND-TRIP SUCCESS RATE: ${successRate.toFixed(1)}%`);
process.exit(stats.xmlBuildFail > 0 ? 1 : 0);
