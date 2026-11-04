import type { Config } from 'tailwindcss';

/**
 * Lemma Heights Apartments — Hospitality & Operations Design System
 *
 * Balances the architectural slate of the Lemma emblem (#707E91 / #4A586B)
 * with warm stone/linen surfaces (`sand`) and restrained warm brass (`gold`),
 * so public guest pages feel welcoming and human while operational screens
 * remain crisp and high-contrast.
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
          500: '#707E91',
          600: '#526073',
          700: '#3D4959',
          800: '#2B3441',
          900: '#1D242E',
          950: '#12171E',
        },
        charcoal: {
          50: '#F7F7F6',
          100: '#ECECE9',
          200: '#D8D8D2',
          300: '#B6B8B2',
          400: '#888D88',
          500: '#5F6664',
          600: '#454C4E',
          700: '#30363A',
          800: '#20262B',
          900: '#161B20',
          950: '#0E1216',
        },
        navy: {
          50: '#F5F6F8',
          100: '#EAECEF',
          200: '#D2D7DF',
          300: '#9DA6B4',
          400: '#6F7C8E',
          500: '#536071',
          600: '#3E4958',
          700: '#2C3542',
          800: '#1D242E',
          900: '#151B23',
          950: '#0D1117',
        },
        /* Warm natural stone & linen surfaces instead of cold clinical grey */
        sand: {
          50: '#FAF8F5',
          100: '#F3EFE9',
          200: '#E5DFD5',
          300: '#D4CCC0',
          400: '#B5ACA0',
          500: '#8B8276',
          600: '#675F55',
          700: '#4A443C',
        },
        /* Warm brass / ochre accents */
        gold: {
          50: '#FCF8F0',
          100: '#F5EBCE',
          200: '#E7D39C',
          300: '#D3B269',
          400: '#BC9343',
          500: '#9B752C',
          600: '#7B5B20',
          700: '#5C4318',
        },
        teal: {
          50: '#F3F6F8',
          100: '#E5EBF0',
          200: '#C8D3DF',
          300: '#9BA9BA',
          400: '#707E91',
          500: '#526073',
          600: '#3D4959',
          700: '#2B3441',
        },
        lemma: {
          DEFAULT: '#707E91',
          dark: '#485669',
          light: '#AEBAC8',
        },
        /* Semantic operational statuses */
        st: {
          available: '#21684B',
          availableBg: '#E9F4EE',
          paid: '#21684B',
          paidBg: '#E9F4EE',
          reserved: '#3A5878',
          reservedBg: '#EBF1F7',
          occupied: '#2C3542',
          occupiedBg: '#E8ECF1',
          cleaning: '#965818',
          cleaningBg: '#FAF0E4',
          cancelled: '#A43129',
          cancelledBg: '#FAECEB',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'Cambria', 'Times New Roman', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.04em' }],
      },
      boxShadow: {
        card: '0 1px 3px rgba(24, 22, 19, 0.04), 0 1px 2px rgba(24, 22, 19, 0.03)',
        pop: '0 14px 34px -10px rgba(20, 22, 26, 0.14), 0 3px 8px rgba(20, 22, 26, 0.05)',
        inset: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      borderRadius: {
        lg: '0.5rem',
        xl: '0.625rem',
        '2xl': '0.75rem',
      },
      maxWidth: {
        shell: '84rem',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
        entrance: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translate3d(0, 14px, 0)' },
          to: { opacity: '1', transform: 'translate3d(0, 0, 0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-down': {
          from: { opacity: '0', transform: 'translate3d(0, -10px, 0)' },
          to: { opacity: '1', transform: 'translate3d(0, 0, 0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translate3d(20px, 0, 0)' },
          to: { opacity: '1', transform: 'translate3d(0, 0, 0)' },
        },
        'hero-pan': {
          '0%': { transform: 'scale(1.05) translate3d(0, 0, 0)' },
          '100%': { transform: 'scale(1) translate3d(0, 0, 0)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '70%': { transform: 'scale(1.5)', opacity: '0' },
          '100%': { transform: 'scale(1.5)', opacity: '0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.55s cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in': 'fade-in 0.45s ease-out both',
        'fade-down': 'fade-down 0.45s cubic-bezier(0.16, 1, 0.3, 1) both',
        'scale-in': 'scale-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-in-right': 'slide-in-right 0.45s cubic-bezier(0.16, 1, 0.3, 1) both',
        'hero-pan': 'hero-pan 14s ease-out both',
        'pulse-ring': 'pulse-ring 2.4s cubic-bezier(0.24, 0, 0.38, 1) infinite',
      },
    },
  },
  plugins: [],
};

export default config;
