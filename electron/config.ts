const DEFAULT_API_BASE = 'https://api4.ogretimsayfam.com';

export const API_BASE: string = (() => {
  const raw = process.env.OSF_API_BASE;
  const v = typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : '';
  return v || DEFAULT_API_BASE;
})();
