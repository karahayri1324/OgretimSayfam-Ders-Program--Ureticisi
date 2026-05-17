# Backend API (Electron Main Process) — FİNAL DURUM

## IPC Mimarisi

Renderer doğrudan Node API'lerine erişemez. Tüm sistem çağrıları **preload script** üzerinden `window.api` namespace'i ile yapılır.

## Preload API Yüzeyi

```typescript
window.api = {
  teachers:    { list, create, update, delete }
  classes:     { list, create, update, delete }    // kind: 'year'|'class' dual mode
  rooms:       { list, create, update, delete }
  subjects:    { list, create, update, delete }
  activities:  { list, upsert, delete, setSplit, clearSplit }
  constraints: { list, add, delete, toggle, setWeight }       // setWeight (yeni)
  schedule:    { get, setDays, setHours, setDayHours, clearDayHours, bulkAdjustBreaks }
  ai: {
    parse,                  // kullanıcı mesajı → AIResponse
    history,                // chat geçmişi
    clearHistory,
    applyMutations,         // data_mutation onayında CRUD
    applyScheduleUpdate,    // schedule_update onayında DB güncelleme (yeni)
  }
  generate:    { run, cancel, latest, onProgress }
  settings:    { get, set }
  app:         { version, checkFet, openFETSource, openLogs, exportPdf }   // exportPdf (yeni)
}
```

## Response Şekli (uniform)

```typescript
type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: { code: string; message: string; details?: any } };
```

## Yeni IPC Handler'lar (son turda eklenenler)

### `constraints:setWeight`
Mevcut constraint'in `weight`'ini günceller (slider için). Eskiden her hareket yeni satır yaratıyordu — bug fix.

```typescript
ipcMain.handle('constraints:setWeight', (_e, id: number, weight: number) => {
  if (weight < 0 || weight > 100) return err('VALIDATION', '...');
  return safeHandler(() => {
    constraintsRepo.setWeight(id, weight);
    return { id, weight };
  });
});
```

### `ai:applyMutations`
data_mutation kind'ında kullanıcı onayladıktan sonra çağrılır. 23 op için `mutation-executor.ts` çalıştırır. Tek transaction değil — kısmen başarı modeli.

```typescript
ipcMain.handle('ai:applyMutations', (_e, actions: DataMutationAction[]) => {
  return executor.applyMutations(actions);
  // → { applied: 3, errors: [{action, message}] }
});
```

### `ai:applyScheduleUpdate`
schedule_update kind'ında kullanıcı onayladıktan sonra. 5 action: extend_breaks, add_hours_to_day, set_hours_per_day, remove_day, add_day. `schedule-executor.ts` çalıştırır. Days/hours/dayHours tabloları gerçekten güncellenir.

### `app:exportPdf`
Timetable PDF export. Save dialog → hidden BrowserWindow → printToPDF → fs.writeFile.

```typescript
ipcMain.handle('app:exportPdf', async (_e, html: string, defaultFilename: string) => {
  const { filePath, canceled } = await dialog.showSaveDialog({ defaultPath: defaultFilename });
  if (canceled || !filePath) return ok({ cancelled: true });
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  await win.loadURL('data:text/html,' + encodeURIComponent(html));
  const buf = await win.webContents.printToPDF({ landscape: true, pageSize: 'A4' });
  await fs.writeFile(filePath, buf);
  win.destroy();
  return ok({ filePath });
});
```

### `app:checkFet`
fet-cl binary mevcut mu kontrol (StatusBar için).

### `schedule:setDayHours` / `schedule:clearDayHours` / `schedule:bulkAdjustBreaks`
Per-day hours yönetimi:
- setDayHours(dayId, entries) — o güne özel saatler
- clearDayHours(dayId) — özel saatleri sil (global hours fallback)
- bulkAdjustBreaks(payload) — teneffüsleri toplu uzat (start, end, break modlarında)

### `activities:setSplit` / `activities:clearSplit`
Split activities (aynı saat, farklı oda).
- setSplit(activityIds[]) — aynı `split_group_id` ata
- clearSplit(id) — gruptan çıkar

## Schema Validation

Her IPC handler input'unu Zod ile doğrular. `electron/ipc/_schemas.ts` tüm schema'ları içerir.

**Yeni schema'lar:**
- `DataMutationActionSchema` — 23 op'a göre discriminated union
- `ScheduleUpdateApplySchema` — 5 action
- `SetSplitSchema` — number[] activity IDs
- `SetDayHoursSchema` — { dayId, entries[] }
- `BulkAdjustBreaksSchema` — { mode, delta, dayIds? }

## Klasör Yapısı (final)

```
electron/
├── main.ts                          # window + lifecycle
├── preload.ts                       # contextBridge API
├── ipc/
│   ├── index.ts                     # registerAllHandlers
│   ├── _common.ts                   # safeHandler, validate
│   ├── _schemas.ts                  # tüm Zod schemas
│   ├── teachers.ts, classes.ts, rooms.ts, subjects.ts, activities.ts
│   ├── constraints.ts, schedule.ts, settings.ts, app.ts
│   ├── ai.ts                        # parse, applyMutations, applyScheduleUpdate
│   └── generate.ts                  # FET runner
├── db/
│   ├── connection.ts                # init + legacy migration
│   ├── schema.ts                    # v1+v2 migrations
│   ├── aggregators.ts               # gatherSchoolData, buildAIContext
│   └── repositories/
│       └── (14 repo)
├── fet/
│   ├── xml-builder.ts, xml-parser.ts, runner.ts, binary-path.ts, types.ts
│   └── constraints/
│       ├── index.ts                 # buildAllConstraints
│       └── handlers.ts              # 60 constraint handler
├── ai/
│   ├── schema.ts                    # AIResponseSchema (5 kind discriminated union)
│   ├── client.ts                    # parseWithTools (axios + iteratif)
│   ├── mock-server.ts               # 70+ pattern
│   ├── context-builder.ts           # DB → AIContext
│   ├── constraint-mapper.ts         # AI JSON → ConstraintInput
│   ├── mutation-executor.ts         # 23 op → DB CRUD
│   ├── schedule-executor.ts         # 5 action → schedule DB
│   └── tools.ts                     # 9 read-only tool
└── utils/
    ├── paths.ts                     # dbPath, logsDir, fetBinaryPath, appDataDir
    └── logger.ts
```

## Hata Kodları

| Code | Anlam |
|---|---|
| VALIDATION | Input schema ihlali (zod) |
| DB_ERROR | SQLite hata |
| NOT_FOUND | Kayıt bulunamadı |
| CONFLICT | Unique constraint vs |
| FET_FAILED | fet-cl başarısız |
| FET_NOT_FOUND | Binary yok |
| NO_TEACHERS / NO_CLASSES / NO_ACTIVITIES | Generate önkoşul (yeni) |
| AI_ERROR / AI_TIMEOUT / AI_INVALID_RESPONSE | AI client |
| BUSY | Eşzamanlı çağrı |
