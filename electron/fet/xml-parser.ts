
import fs from 'node:fs';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import type { TimetableSlot } from '../../src/lib/types.js';
import type { SchoolBundle } from './types.js';

export type ParseContext = {
  bundle: SchoolBundle;
  fetActivityIdsByActivity: Map<number, number[]>;
  dbActivityIdByFetId?: Map<number, number>;
};

export async function parseTimetable(
  outputDir: string,
  ctx: ParseContext,
): Promise<TimetableSlot[]> {
  const activitiesXmlPath = await findActivitiesXml(outputDir);
  if (!activitiesXmlPath) {
    throw new Error('FET çıktısında activities.xml bulunamadı');
  }
  const xml = await fs.promises.readFile(activitiesXmlPath, 'utf-8');

  const parser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false,
    trimValues: true,
  });
  const parsed = parser.parse(xml) as {
    Activities_Timetable?: { Activity?: unknown };
  };
  const root = parsed.Activities_Timetable;
  if (!root) throw new Error('activities.xml boş veya beklenenden farklı');

  const rawActs = toArray<RawActivity>(root.Activity);
  return mapActivities(rawActs, ctx);
}

type RawActivity = {
  Id?: string | number;
  Day?: string;
  Hour?: string;
  Room?: string;
};

function mapActivities(rawActs: RawActivity[], ctx: ParseContext): TimetableSlot[] {
  const { bundle } = ctx;
  const dayIndexByName = new Map<string, number>();
  bundle.days
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .forEach((d, i) => dayIndexByName.set(d.name, i));

  const hourIndexByName = new Map<string, number>();
  bundle.hours
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .forEach((h, i) => hourIndexByName.set(h.name, i));

  const dbIdByFetId = ctx.dbActivityIdByFetId
    ?? invertFetIdMap(ctx.fetActivityIdsByActivity);

  const dbActivityById = new Map(bundle.activities.map(a => [a.id, a]));
  const subjectById = new Map(bundle.subjects.map(s => [s.id, s]));
  const teacherById = new Map(bundle.teachers.map(t => [t.id, t]));
  const classById = new Map(bundle.classes.map(c => [c.id, c]));
  const roomByName = new Map(bundle.rooms.map(r => [r.name, r]));

  const slots: TimetableSlot[] = [];

  for (const raw of rawActs) {
    const fetId = typeof raw.Id === 'string' ? parseInt(raw.Id, 10) : raw.Id;
    if (typeof fetId !== 'number' || !Number.isFinite(fetId)) continue;
    const dbId = dbIdByFetId.get(fetId);
    if (dbId === undefined) continue;
    const act = dbActivityById.get(dbId);
    if (!act) continue;

    const dayName = (raw.Day ?? '').toString();
    const hourName = (raw.Hour ?? '').toString();
    const dayIndex = dayIndexByName.get(dayName);
    const hourIndex = hourIndexByName.get(hourName);
    if (dayIndex === undefined || hourIndex === undefined) continue;

    const subj = subjectById.get(act.subjectId);
    const teacher = act.teacherId != null ? teacherById.get(act.teacherId) : null;
    const cls = classById.get(act.classId);
    const roomName = (raw.Room ?? '').toString().trim();
    const room = roomName ? roomByName.get(roomName) : null;

    const block = Math.max(1, act.blockDuration || 1);
    for (let i = 0; i < block; i++) {
      slots.push({
        activityId: fetId,
        dayIndex,
        hourIndex: hourIndex + i,
        classId: cls?.id ?? null,
        className: cls?.name ?? '',
        teacherId: teacher?.id ?? null,
        teacherName: teacher?.name ?? '',
        subjectId: subj?.id ?? null,
        subjectName: subj?.name ?? '',
        roomId: room?.id ?? null,
        roomName: roomName || null,
      });
    }
  }

  return slots;
}

function invertFetIdMap(map: Map<number, number[]>): Map<number, number> {
  const inv = new Map<number, number>();
  for (const [dbId, fetIds] of map) {
    for (const f of fetIds) inv.set(f, dbId);
  }
  return inv;
}

function toArray<T>(value: unknown): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? (value as T[]) : [value as T];
}

async function findActivitiesXml(outputDir: string): Promise<string | null> {
  const ttDir = path.join(outputDir, 'timetables');
  if (!(await exists(ttDir))) return null;
  const entries = await fs.promises.readdir(ttDir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const candidate = path.join(ttDir, e.name, `${e.name}_activities.xml`);
    if (await exists(candidate)) return candidate;
    const sub = await fs.promises.readdir(path.join(ttDir, e.name));
    const match = sub.find(f => f.endsWith('_activities.xml'));
    if (match) return path.join(ttDir, e.name, match);
  }
  return null;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.promises.access(p);
    return true;
  } catch {
    return false;
  }
}
