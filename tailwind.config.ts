import type { Config } from 'tailwindcss';

/**
 * Lemma Heights Apartments — Brand Design System
 *
 * Extracted directly from logo.jpg:
 *   Primary brand slate:   #707E91 (500) with high-contrast #4E5B6E (600) & #394454 (700)
 *   Secondary slate-silver:#969FA9 / #BCC3CC (used sparingly for borders, dividers & muted marks)
 *   Charcoal darks:        #181E27 / #11161D (sidebars, primary typography, high-contrast actions)
 *   Neutral surfaces:      #FFFFFF, #F7F8FA, #EFF2F6, #E2E6EC
 *
 * Note: legacy token names (`navy`, `sand`, `gold`, `teal`) are mapped onto the exact
 * Lemma Slate + Charcoal + Neutral palette so all existing and new screens share one
 * restrained, cohesive hospitality visual language without extraneous colours.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#F4F6F8',
          100: '#E8ECF1',
          200: '#CFD6E0',
          300: '#B4BBC5',
          400: '#969FA9',
          500: '#707E91', // Exact dominant colour extracted from logo.jpg
          600: '#566476',
          700: '#414D5C',
          800: '#2E3744',
          900: '#1E2530',
          950: '#12171E',
        },
        charcoal: {
          50: '#F6F7F9',
          100: '#ECEEF2',
          200: '#D6DBE3',
          300: '#B2BAC7',
          400: '#8490A2',
          500: '#5E6B7E',
          600: '#455061',
          700: '#313A47',
          800: '#212832',
          900: '#161B22',
          950: '#0E1217',
        },
        /* Mapped tokens for seamless continuity across administration & public components */
        navy: {
          50: '#F4F6F8',
          100: '#E8ECF1',
          200: '#CFD6E0',
          300: '#9AA5B4',
          400: '#707E91',
          500: '#566476',
          600: '#414D5C',
          700: '#2E3744',
          800: '#1E2530',
          900: '#161B22',
          950: '#0E1217',
        },
        sand: {
          50: '#F7F8FA',
          100: '#F0F2F5',
          200: '#E3E7ED',
          300: '#D1D7E0',
          400: '#B4BBC5',
          500: '#8E98A6',
          600: '#68717D',
          700: '#4B535E',
        },
        gold: {
          50: '#F4F6F8',
          100: '#E8ECF1',
          200: '#CFD6E0',
          300: '#969FA9',
          400: '#707E91',
          500: '#566476',
          600: '#414D5C',
          700: '#2E3744',
        },
        teal: {
          50: '#F4F6F8',
          100: '#E6EBF1',
          200: '#C8D2DE',
          300: '#9AA8BA',
          400: '#707E91',
          500: '#566476',
          600: '#414D5C',
          700: '#2E3744',
        },
        lemma: '#707E91',
        /* Semantic operational statuses (restrained, legible, accessible) */
        st: {
          available: '#236B4E',
          availableBg: '#EAF4F0',
          reserved: '#3E5A7A',
          reservedBg: '#EBF0F6',
          occupied: '#2E3744',
          occupiedBg: '#E7EBF0',
          cleaning: '#9A5B1A',
          cleaningBg: '#F9F0E6',
          cancelled: '#A6322A',
          cancelledBg: '#FAECEB',
        },
      },
      fontFamily: {
        sans: ['Inter', 'DM Sans', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Inter', 'DM Sans', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.04em' }],
      },
      boxShadow: {
        card: '0 1px 2px rgba(22, 27, 34, 0.04)',
        pop: '0 10px 30px -8px rgba(14, 18, 23, 0.18), 0 2px 6px rgba(14, 18, 23, 0.06)',
        inset: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      borderRadius: {
        lg: '0.375rem',
        xl: '0.375rem',
        '2xl': '0.5rem',
      },
      maxWidth: {
        shell: '84rem',
      },
      transitionDuration: {
        DEFAULT: '140ms',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
        entrance: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translate3d(0, 18px, 0)' },
          to: { opacity: '1', transform: 'translate3d(0, 0, 0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-down': {
          from: { opacity: '0', transform: 'translate3d(0, -12px, 0)' },
          to: { opacity: '1', transform: 'translate3d(0, 0, 0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translate3d(24px, 0, 0)' },
          to: { opacity: '1', transform: 'translate3d(0, 0, 0)' },
        },
        'hero-pan': {
          '0%': { transform: 'scale(1.06) translate3d(0, 0, 0)' },
          '100%': { transform: 'scale(1) translate3d(0, 0, 0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '70%': { transform: 'scale(1.5)', opacity: '0' },
          '100%': { transform: 'scale(1.5)', opacity: '0' },
        },
        'marquee-slow': {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in': 'fade-in 0.6s ease-out both',
        'fade-down': 'fade-down 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
        'scale-in': 'scale-in 0.45s cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-in-right': 'slide-in-right 0.55s cubic-bezier(0.16, 1, 0.3, 1) both',
        'hero-pan': 'hero-pan 14s ease-out both',
        shimmer: 'shimmer 1.8s infinite',
        'pulse-ring': 'pulse-ring 2.4s cubic-bezier(0.24, 0, 0.38, 1) infinite',
        'marquee-slow': 'marquee-slow 44s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
