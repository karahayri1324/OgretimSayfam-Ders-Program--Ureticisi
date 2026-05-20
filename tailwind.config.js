/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        // "Defter" palette — CSS değişkenlerine bağlı (açık/koyu tema otomatik).
        paper: 'rgb(var(--paper) / <alpha-value>)',
        paper2: 'rgb(var(--paper2) / <alpha-value>)',
        card: 'rgb(var(--card) / <alpha-value>)',
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          400: 'rgb(var(--ink-400) / <alpha-value>)',
          500: 'rgb(var(--ink-400) / <alpha-value>)',
          600: 'rgb(var(--ink-400) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          800: 'rgb(var(--ink) / <alpha-value>)',
          900: 'rgb(var(--ink) / <alpha-value>)',
        },
        muted: 'rgb(var(--muted) / <alpha-value>)',
        mutedDeep: 'rgb(var(--mutedDeep) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        rule: 'rgb(var(--rule) / <alpha-value>)',
        cardBorder: 'rgb(var(--cardBorder) / <alpha-value>)',

        // "primary" — marka mavisi. Açık-tonlu (50/100/soft) değişkene bağlı,
        // gerisi sabit (mavi her iki temada da çalışır).
        primary: {
          DEFAULT: '#1E3FAE',
          50: 'rgb(var(--primary-50) / <alpha-value>)',
          100: 'rgb(var(--primary-100) / <alpha-value>)',
          200: '#BDCBED',
          300: '#8FA4DD',
          400: '#5072C8',
          500: '#1E3FAE',
          600: '#1A38A0',
          700: '#173292',
          800: '#142A80',
          900: '#0F2266',
          soft: 'rgb(var(--primary-soft) / <alpha-value>)',
          ink: '#FFFFFF',
        },

        // "surface" — kağıt/yüzey tonları (değişkene bağlı).
        surface: {
          0: 'rgb(var(--surface-0) / <alpha-value>)',
          50: 'rgb(var(--surface-50) / <alpha-value>)',
          100: 'rgb(var(--surface-100) / <alpha-value>)',
          200: 'rgb(var(--surface-200) / <alpha-value>)',
          300: 'rgb(var(--surface-300) / <alpha-value>)',
        },

        // Accent renkleri — defter sıcak tonları
        accent: {
          ok: '#5C7A4A',
          warn: '#D89B2A',
          err: '#C0392B',
          red: '#C0392B',
          amber: '#D89B2A',
          leaf: '#5C7A4A',
          purple: '#7C5BD8',
          teal: '#1F8C8C',
          cyan: '#2090A8',
          pink: '#B83A7A',
          orange: '#C9621C',
        },
      },
      fontFamily: {
        sans: [
          'Instrument Sans',
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif',
        ],
        serif: [
          'Instrument Serif',
          'ui-serif',
          'Georgia',
          'Cambria',
          'Times New Roman',
          'serif',
        ],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(60,50,40,0.04), 0 1px 3px rgba(60,50,40,0.06)',
        card: '0 1px 0 rgba(0,0,0,0.02), 0 8px 24px -12px rgba(30,63,174,0.18)',
        elevated:
          '0 10px 25px -10px rgba(30,63,174,0.25), 0 4px 10px rgba(60,50,40,0.06)',
        tape: '0 1px 2px rgba(0,0,0,0.08)',
        primary: '0 8px 20px -10px rgba(30,63,174,0.6)',
      },
      borderRadius: {
        xl: '0.75rem',
        '2xl': '1rem',
      },
      backgroundImage: {
        'paper-lines':
          'repeating-linear-gradient(to bottom, transparent 0, transparent 31px, #E6DFCE 31px, #E6DFCE 32px)',
      },
    },
  },
  plugins: [],
};
