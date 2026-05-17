# Code Implementer Agent Şablonu

## Amaç

Belirli bir modülü/komponenti baştan sona implement etmek. Bağımsız parçalar paralel yazılır.

## Çağrı Şablonu

```
description: Implement {module_name}
subagent_type: general-purpose
prompt: |
  Sen bir TypeScript/React/Electron geliştiricisisin. Görevin: "{module_name}"
  modülünü baştan sona yazmak.

  ## Proje
  Ders Program Oluşturucu — ÖğretimSayfam şirketi için Electron app.
  Kullanıcı doğal dil ile kısıtlama yazıyor, AI parse ediyor, FET çözüyor.

  ## Spec
  Plans/{ilgili_doküman}.md dosyasını oku.

  ## Bağlam dosyaları
  - Plans/01_ARCHITECTURE.md — genel mimari
  - Plans/07_BACKEND_API.md — IPC kontrat
  - Plans/08_DATABASE_SCHEMA.md — DB
  - Plans/06_FRONTEND_UI.md — UI tema/komponentler

  ## Kurallar
  - TypeScript strict mode
  - Tailwind only (no inline styles, no other CSS-in-JS)
  - Tema renkleri: primary, surface, ink, accent (Plans/06)
  - Türkçe string'ler i18n.ts üzerinden
  - Error handling: try/catch + Türkçe error message
  - Yorum yazma, isimlendirme açıklayıcı olsun
  - Test edilebilir: pure function'lar tercih, dependency injection
  - Path: {hedef_yol}

  ## Çıktı
  1. Dosyayı yaz: {hedef_yol}
  2. Eğer yan dosyalar gerekiyorsa onları da yaz
  3. Type definition'ları types.ts'e ekle (varsa)
  4. Rapor: hangi dosyalar yazıldı, hangi public export'lar var

  Test yazma şu an, sadece implementation.
```

## Örnekler

### electron/db/connection.ts için çağrı
```
Implement electron/db/connection.ts
  - better-sqlite3 ile DB açma
  - userData/data.db path
  - PRAGMA foreign_keys = ON
  - migrations runner çağrısı
  - export db instance
  - graceful close hook
```

### src/components/ui/Button.tsx için çağrı
```
Implement src/components/ui/Button.tsx
  - variants: primary, secondary, ghost, destructive
  - sizes: sm, md, lg
  - asChild (Slot pattern) opsiyonel
  - Tailwind primary-500, hover:primary-600
  - disabled state
  - Türkçe accessible
```

## Paralel Implementation

Bağımsız modüller paralel yazılır:
- Repository dosyaları (her tablo ayrı agent)
- IPC handler dosyaları (her domain ayrı)
- UI ekranları (her sayfa ayrı)
- FET constraint builder'ları (her tip ayrı)

Bağımlılık olanlar sequential:
- DB connection → repositories → IPC handlers
- xml-builder iskeleti → constraint builder'lar
- AppShell → Page komponentleri
