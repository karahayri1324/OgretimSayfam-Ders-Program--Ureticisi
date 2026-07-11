// Uygulamadaki gezilebilir sayfa slug'ları — TEK KAYNAK. Hem AI navigate_to executor'ı
// (electron/ai/mutation-executor.ts) hem renderer navigasyonu (AIPanel) hem router (App.tsx)
// buradan beslenir ki AI'ın ürettiği geçersiz bir sayfa adı boş ekran/takılma yaratmasın.
export const VALID_PAGE_SLUGS = [
  'welcome',
  'subjects',
  'classes',
  'rooms',
  'teachers',
  'activities',
  'schedule',
  'constraints',
  'generate',
  'timetable',
  'advanced',
  'settings',
] as const;

export type PageSlug = (typeof VALID_PAGE_SLUGS)[number];

/** Ham sayfa girdisini ('/Timetable', 'timetable', 'TIMETABLE') güvenli bir '/slug' rotasına
 *  çevirir. Bilinmeyen sayfa için null döner (çağıran navigate etmemeli). */
export function normalizePageRoute(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let slug = raw.trim().toLowerCase();
  if (slug.startsWith('/')) slug = slug.slice(1);
  return (VALID_PAGE_SLUGS as readonly string[]).includes(slug) ? `/${slug}` : null;
}
