import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* Deep navy / charcoal — administration chrome */
        navy: {
          50: '#eef2f7',
          100: '#d7dfec',
          200: '#aebfd6',
          300: '#7d94b6',
          400: '#4f6a92',
          500: '#2f4c74',
          600: '#1f3757',
          700: '#162944',
          800: '#0f1f35',
          900: '#0a1626',
          950: '#060f1b',
        },
        /* Warm neutral paper tones — public site + cards */
        sand: {
          50: '#fbfaf7',
          100: '#f6f3ed',
          200: '#ece7dd',
          300: '#ddd6c7',
          400: '#c4bba7',
          500: '#a89e88',
          600: '#8a8069',
          700: '#6b6352',
        },
        /* Muted gold — primary accent */
        gold: {
          50: '#fbf6e9',
          100: '#f4e8c9',
          200: '#e9d294',
          300: '#dcba63',
          400: '#cba33f',
          500: '#b58a2c',
          600: '#916d22',
          700: '#6d511b',
        },
        /* Teal — secondary accent */
        teal: {
          50: '#e9f5f3',
          100: '#c9e6e2',
          200: '#95cec8',
          300: '#5eb2aa',
          400: '#2f9189',
          500: '#1d756e',
          600: '#165d58',
          700: '#114643',
        },
        /* Brand slate, sampled from the Lemma Heights mark */
        lemma: '#6b7a91',
        /* Status colours used by calendar + badges */
        st: {
          available: '#2f7d5e',
          availableBg: '#e6f2ec',
          reserved: '#2563a6',
          reservedBg: '#e6effa',
          occupied: '#6747a3',
          occupiedBg: '#eee9f9',
          cleaning: '#c2701f',
          cleaningBg: '#fbefe0',
          cancelled: '#b0362c',
          cancelledBg: '#fbeae8',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.04em' }],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 31, 53, 0.04), 0 8px 24px -12px rgba(15, 31, 53, 0.10)',
        pop: '0 12px 40px -12px rgba(10, 22, 38, 0.28)',
        inset: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      borderRadius: {
        xl: '0.75rem',
        '2xl': '1rem',
      },
      maxWidth: {
        shell: '84rem',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
    },
  },
  plugins: [],
};

export default config;
