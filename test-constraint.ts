import { buildFetXml } from './electron/fet/xml-builder.js';

const bundle = {
  institutionName: 'Test School',
  days: [{ id: 1, name: 'Monday', orderIndex: 0 }],
  hours: [
    { id: 1, name: '1st Hour', orderIndex: 0, startTime: null, endTime: null },
    { id: 2, name: '2nd Hour', orderIndex: 1, startTime: null, endTime: null },
  ],
  subjects: [{ id: 1, name: 'Math', shortCode: 'M', color: null, notes: null }],
  teachers: [
    { id: 1, name: 'Teacher A', weeklyTargetHours: 0, notes: null, subjectIds: [1] },
  ],
  classes: [{ id: 1, yearId: 1, name: '9A', studentCount: 30, homeRoomId: null }],
  years: [{ id: 1, name: '9', orderIndex: 0 }],
  rooms: [{ id: 1, name: '101', capacity: 30, building: null, notes: null }],
  activities: [
    {
      id: 1,
      classId: 1,
      subjectId: 1,
      teacherId: 1,
      weeklyHours: 2,
      blockDuration: 1,
      notes: null,
    },
  ],
  constraints: [
    {
      id: 100,
      type: 'TEACHER_NOT_AVAILABLE' as const,
      weight: 100,
      active: true,
      source: 'manual' as const,
      aiMessageId: null,
      createdAt: '',
      notes: null,
      params: {
        teacher: 'Teacher A',
        slots: [{ day: 'Monday', hour: 1 }],
      },
    },
  ],
};

const result = buildFetXml(bundle as any);
console.log('=== Generated XML ===');
const lines = result.xml.split('\n');
let inConstraint = false;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('ConstraintTeacherNotAvailableTimes')) {
    inConstraint = true;
  }
  if (inConstraint) {
    console.log(lines[i]);
    if (lines[i].includes('</ConstraintTeacherNotAvailableTimes>')) {
      break;
    }
  }
}
