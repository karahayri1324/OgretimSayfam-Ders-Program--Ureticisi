# Sistem Mimarisi

## Yüksek Seviye Diyagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    ELECTRON APP (Single Process Tree)            │
│                                                                  │
│  ┌────────────────────────────┐    ┌─────────────────────────┐  │
│  │   RENDERER (React + Vite)  │    │   MAIN PROCESS (Node)   │  │
│  │                            │    │                         │  │
│  │  - Pages (Cursor-style)    │◄──►│  - Window mgmt          │  │
│  │  - AI Chat sidebar         │IPC │  - SQLite (sqlite.ts)   │  │
│  │  - Forms (CRUD)            │    │  - FET runner (fet.ts)  │  │
│  │  - Timetable viewer        │    │  - AI client (ai.ts)    │  │
│  │  - Settings                │    │  - File export (pdf,xls)│  │
│  │                            │    │                         │  │
│  │  state: zustand            │    │  Tools: child_process,  │  │
│  │  styling: TailwindCSS      │    │         better-sqlite3, │  │
│  │                            │    │         axios, xml2js   │  │
│  └────────────────────────────┘    └───────────┬─────────────┘  │
│                                                 │                │
└─────────────────────────────────────────────────┼────────────────┘
                                                  │
                          ┌───────────────────────┼───────────────────────┐
                          │                       │                       │
                          ▼                       ▼                       ▼
                  ┌──────────────┐       ┌──────────────┐       ┌──────────────┐
                  │  fet-cl      │       │  AI Server   │       │  SQLite file │
                  │  (subprocess)│       │  (HTTP/HTTPS)│       │  (~/.config) │
                  └──────────────┘       └──────────────┘       └──────────────┘
                  bundled binary         user-configured        local file
```

## Klasör Yapısı

```
ders-program-olusturucu/
├── package.json
├── electron-builder.yml
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── index.html
├── electron/
│   ├── main.ts              # Electron entry, window creation
│   ├── preload.ts           # contextBridge API
│   ├── ipc/
│   │   ├── teachers.ts
│   │   ├── classes.ts
│   │   ├── rooms.ts
│   │   ├── subjects.ts
│   │   ├── activities.ts
│   │   ├── constraints.ts
│   │   ├── generate.ts      # FET runner IPC
│   │   ├── ai.ts            # AI chat IPC
│   │   └── settings.ts
│   ├── db/
│   │   ├── connection.ts    # better-sqlite3 setup
│   │   ├── schema.sql       # CREATE TABLE statements
│   │   ├── migrations.ts    # version-based migrations
│   │   └── repositories/    # data access per entity
│   ├── fet/
│   │   ├── xml-builder.ts   # JS objects → FET XML
│   │   ├── xml-parser.ts    # FET output XML → JS
│   │   ├── runner.ts        # child_process wrapper
│   │   ├── constraints/     # her constraint tipi için builder
│   │   └── binary-path.ts   # platform-specific fet-cl path
│   ├── ai/
│   │   ├── client.ts        # HTTP client
│   │   ├── mock-server.ts   # local fallback
│   │   ├── schema.ts        # AI output zod schemas
│   │   └── constraint-mapper.ts  # AI JSON → FET constraint
│   └── utils/
│       ├── paths.ts
│       └── logger.ts
├── src/                     # React app
│   ├── main.tsx
│   ├── App.tsx
│   ├── pages/
│   │   ├── Welcome.tsx
│   │   ├── Teachers.tsx
│   │   ├── Classes.tsx
│   │   ├── Rooms.tsx
│   │   ├── Subjects.tsx
│   │   ├── Activities.tsx
│   │   ├── Schedule.tsx     # gün/saat ayarı
│   │   ├── Generate.tsx     # üretim butonu + log
│   │   ├── Timetable.tsx    # sonuç tablo
│   │   └── Settings.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── AIPanel.tsx
│   │   │   └── StatusBar.tsx
│   │   ├── ui/              # button, input, table, dialog, etc.
│   │   └── timetable/
│   │       ├── GridView.tsx
│   │       ├── TeacherView.tsx
│   │       └── ClassView.tsx
│   ├── lib/
│   │   ├── ipc.ts           # window.api wrapper
│   │   └── i18n.ts          # Türkçe stringler
│   ├── store/
│   │   ├── teachers.ts      # zustand stores
│   │   └── ai-chat.ts
│   └── styles/
│       └── globals.css
├── resources/
│   ├── bin/
│   │   ├── linux/fet-cl
│   │   ├── win/fet-cl.exe
│   │   └── mac/fet-cl
│   └── icon.png
└── Plans/                   # bu klasör
```

## Data Flow

### Manuel veri girişi
```
User → Form → window.api.teachers.create(...)
            → IPC (preload contextBridge)
            → main process: ipc/teachers.ts
            → db/repositories/teachers.ts
            → SQLite INSERT
            → response
            → renderer state update (zustand)
            → UI refresh
```

### AI kısıtlama akışı
```
User types "Cuma matematik olmasın 10F için"
  → AIPanel state
  → window.api.ai.parse({text, context})
  → main: ai/client.ts → HTTP POST → AI server (or mock)
  → response: {constraints: [...], confidence: 0.92}
  → renderer: preview constraint card
  → user clicks "Ekle"
  → window.api.constraints.add(...)
  → db/repositories/constraints.ts
  → SQLite INSERT
```

### Program üretimi
```
User clicks "Programı Üret"
  → window.api.generate.run()
  → main: fet/xml-builder.ts builds .fet file from DB
  → writes to temp dir: /tmp/dpo-{uuid}/input.fet
  → spawns: fet-cl --inputfile=input.fet --outputdir=/tmp/dpo-{uuid}/out --language=tr
  → streams stdout to renderer as progress events
  → on exit code 0:
    → fet/xml-parser.ts reads /tmp/dpo-{uuid}/out/timetable_*.xml
    → returns structured timetable JSON
  → on non-zero exit:
    → reads /tmp/dpo-{uuid}/out/*-error.txt
    → returns Turkish error message
  → renderer: navigate to Timetable page with result
```

## IPC Kontratı

`window.api` namespace (preload.ts'de tanımlı):

```typescript
type API = {
  teachers: { list, create, update, delete }
  classes: { list, create, update, delete }
  rooms: { list, create, update, delete }
  subjects: { list, create, update, delete }
  activities: { list, create, update, delete }   // hangi sınıf hangi dersten kaç saat
  constraints: { list, add, delete, toggle }
  schedule: { getDays, getHours, setDays, setHours }
  ai: { parse, history }
  generate: { run, cancel }
  settings: { get, set }
  app: { version, openFETSource }
}
```

Tüm IPC handler'ları `{ ok: boolean, data?, error? }` formatında döner.

## Tema Token'ları (Tailwind)

```js
colors: {
  primary: { 50: '#eff6ff', 100: '#dbeafe', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8' },
  surface: { 0: '#ffffff', 50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0' },
  ink:     { 700: '#334155', 800: '#1e293b', 900: '#0f172a' },
  accent:  { ok: '#10b981', warn: '#f59e0b', err: '#ef4444' }
}
```

## Bağımlılıklar

```
runtime:    electron, react, react-dom, react-router-dom, zustand,
            better-sqlite3, axios, xml2js, fast-xml-parser,
            uuid, dayjs, clsx, lucide-react
dev:        typescript, vite, @vitejs/plugin-react, electron-builder,
            electron-vite, tailwindcss, postcss, autoprefixer,
            @types/*, zod, vitest, @testing-library/react
```
