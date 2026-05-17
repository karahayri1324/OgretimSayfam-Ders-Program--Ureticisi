import type { BrowserWindow } from 'electron';
import { registerTeachersHandlers } from './teachers.js';
import { registerClassesHandlers } from './classes.js';
import { registerRoomsHandlers } from './rooms.js';
import { registerSubjectsHandlers } from './subjects.js';
import { registerActivitiesHandlers } from './activities.js';
import { registerConstraintsHandlers } from './constraints.js';
import { registerScheduleHandlers } from './schedule.js';
import { registerAiHandlers } from './ai.js';
import { registerGenerateHandlers } from './generate.js';
import { registerSettingsHandlers } from './settings.js';
import { registerAppHandlers } from './app.js';
import { log } from '../utils/logger.js';

/**
 * Tüm IPC handler'larını tek bir çağrıda kayıt eder.
 * main.ts uygulama hazır olduğunda bunu çağırır.
 *
 * @param getWindow Aktif BrowserWindow'u veren callback. Generate handler'ı
 *   ilerleme event'lerini bu pencereye gönderir.
 */
export function registerAllHandlers(getWindow: () => BrowserWindow): void {
  log.info('IPC handler\'ları kayıt ediliyor');
  registerTeachersHandlers();
  registerClassesHandlers();
  registerRoomsHandlers();
  registerSubjectsHandlers();
  registerActivitiesHandlers();
  registerConstraintsHandlers();
  registerScheduleHandlers();
  registerAiHandlers();
  registerGenerateHandlers(getWindow);
  registerSettingsHandlers();
  registerAppHandlers();
  log.info('IPC handler\'ları kayıt edildi');
}
