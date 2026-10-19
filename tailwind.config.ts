import type { Config } from 'tailwindcss'

export default {
  content: [
    './app/**/*.{vue,js,ts}',
    './app/**/*.ts',
    './app/app.vue',
    './app/layouts/**/*.{vue,js,ts}',
    './app/components/**/*.{vue,js,ts}',
    './app/pages/**/*.{vue,js,ts}',
  ],
  safelist: [
    'bg-primary', 'bg-secondary', 'bg-error', 'bg-surface-container-low',
    'text-primary', 'text-secondary', 'text-error',
    'bg-secondary-container', 'bg-error-container',
    'text-muted', 'text-outline', 'bg-muted',
    'placeholder:text-muted', 'placeholder-muted',
  ],
  theme: {
    extend: {
      colors: {
        // AGENTS.md WAJIB tokens
        primary: '#28B446',
        secondary: '#1A5D2C',
        tertiary: '#E9F7EF',
        neutral: '#F8F9FA',
        // Extended fidelity tokens from design-reference (hex asli HTML)
        'primary-dark': '#006E22',
        'primary-container': '#28B446',
        'primary-fixed': '#7AFD85',
        'secondary-light': '#2A6B38',
        'secondary-container': '#AAF0B0',
        'secondary-fixed': '#ADF3B3',
        'surface-container-lowest': '#FFFFFF',
        'surface-container-low': '#EFF4FF',
        'surface-container': '#E6EEFF',
        'surface-dim': '#D0DBED',
        'on-surface': '#121C2A',
        'on-surface-variant': '#3E4A3C',
        'error': '#BA1A1A',
        'error-container': '#FFDAD6',
        'outline': '#6D7B6A',
        'muted': '#475569',
        'muted-foreground': '#334155',
        'inverse-surface': '#27313F',
        background: '#F8F9FF',
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      },
      spacing: {
        'space-xs': '4px',
        'space-sm': '8px',
        'space-md': '16px',
        'space-lg': '24px',
        'space-xl': '32px',
        'space-2xl': '48px',
      },
      borderRadius: {
        'xs': '8px',
        'sm': '12px',
        'md': '16px',
        'lg': '20px',
        'xl': '24px',
        '2xl': '28px',
      },
    },
  },
  plugins: [],
} satisfies Config
