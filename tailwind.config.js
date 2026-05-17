/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        // Yeni "Defter" palette — düz anahtarlar (yeni sayfa kodları için)
        paper: '#FAF6EC',
        paper2: '#F4EFE2',
        card: '#FFFDF8',
        ink: {
          DEFAULT: '#1A1A1A',
          400: '#6B6258',
          500: '#6B6258',
          600: '#6B6258',
          700: '#3F3A33',
          800: '#1A1A1A',
          900: '#1A1A1A',
        },
        muted: '#6B6258',
        mutedDeep: '#3F3A33',
        line: '#D9D1BC',
        rule: '#E6DFCE',
        cardBorder: '#E8E0CB',

        // Eski "primary" scale — defter mavisine remap edildi (geriye uyum için)
        primary: {
          DEFAULT: '#1E3FAE',
          50: '#E7ECFA',
          100: '#DBE3F5',
          200: '#BDCBED',
          300: '#8FA4DD',
          400: '#5072C8',
          500: '#1E3FAE',
          600: '#1A38A0',
          700: '#173292',
          800: '#142A80',
          900: '#0F2266',
          soft: '#E7ECFA',
          ink: '#FFFFFF',
        },

        // Eski "surface" scale — defter kağıt tonlarına remap (geriye uyum için)
        surface: {
          0: '#FFFFFF',
          50: '#FAF6EC',
          100: '#F4EFE2',
          200: '#E8E0CB',
          300: '#D9D1BC',
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
