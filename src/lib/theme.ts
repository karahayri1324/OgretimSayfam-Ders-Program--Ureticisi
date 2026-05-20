/**
 * Tema uygulama: <html> elementine `.dark` sınıfını ekler/çıkarır.
 * Renkler globals.css'te CSS değişkenleriyle tanımlı; .dark sınıfı paleti değiştirir.
 */
export type Theme = 'light' | 'dark';

export function applyTheme(theme: Theme | string): void {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}
