import type { AIContext } from './mock-server.js';
import { teachersRepo } from '../db/repositories/teachers.js';
import { classesRepo } from '../db/repositories/classes.js';
import { subjectsRepo } from '../db/repositories/subjects.js';
import { roomsRepo } from '../db/repositories/rooms.js';
import { daysRepo } from '../db/repositories/days.js';
import { hoursRepo } from '../db/repositories/hours.js';
import { constraintsRepo } from '../db/repositories/constraints.js';

export function buildAIContext(): AIContext {
  const teachers = teachersRepo.list().map((t) => t.name);
  const classes = classesRepo.list().map((c) => c.name);
  const subjects = subjectsRepo.list().map((s) => s.name);
  const rooms = roomsRepo.list().map((r) => r.name);
  const days = daysRepo.list().map((d) => d.name);
  const hours = hoursRepo.list();
  const hoursPerDay = hours.length || 8;

  const constraints = constraintsRepo.list().map((c) => ({
    id: c.id,
    type: c.type,
    weight: c.weight,
    active: c.active,
    description: describeConstraint(c),
  }));

  return { teachers, classes, subjects, rooms, days, hoursPerDay, constraints };
}

function describeConstraint(c: {
  type: string;
  params: Record<string, unknown>;
}): string {
  const p = c.params ?? {};
  const teacher = typeof p.teacher === 'string' ? p.teacher : null;
  const cls = typeof p.class === 'string' ? p.class : null;
  const subject = typeof p.subject === 'string' ? p.subject : null;
  const room = typeof p.room === 'string' ? p.room : null;
  const max = typeof p.maxHours === 'number' || typeof p.maxDays === 'number'
    ? Number(p.maxHours ?? p.maxDays)
    : null;
  const who = teacher || cls || subject || room || '';
  const base = c.type.toLowerCase().replace(/_/g, ' ');
  return [who, base, max !== null ? `(${max})` : ''].filter(Boolean).join(' ');
}
