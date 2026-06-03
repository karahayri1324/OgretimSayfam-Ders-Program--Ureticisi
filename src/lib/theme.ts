export type Theme = 'light' | 'dark';

export function applyTheme(theme: Theme | string): void {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}
