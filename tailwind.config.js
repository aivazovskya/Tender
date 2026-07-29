/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--color-canvas)',
        paper: 'var(--color-paper)',
        'surface-alt': 'var(--color-surface-alt)',
        ink: 'var(--color-ink)',
        'ink-soft': 'var(--color-ink-soft)',
        'mid-gray': 'var(--color-mid-gray)',
        hairline: 'var(--color-hairline)',
        ember: 'var(--color-ember)',
        primary: {
          DEFAULT: '#0a0a0a',
          foreground: '#ffffff',
          50: '#f5f5f5',
          100: '#e5e5e5',
          500: '#171717',
          600: '#0a0a0a',
          700: '#000000',
        },
      },
      fontFamily: {
        geist: ['Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '3xl': '24px',
        '2xl': '18px',
        'xl': '14px',
        'lg': '10px',
        'md': '6px',
        'sm': '4px',
      },
      boxShadow: {
        subtle: 'var(--shadow-subtle)',
        elevated: 'var(--shadow-elevated)',
      },
    },
  },
  plugins: [],
}

