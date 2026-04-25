/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: 'rgb(var(--color-surface) / <alpha-value>)',
          raised: 'rgb(var(--color-surface-raised) / <alpha-value>)',
          border: 'rgb(var(--color-surface-border) / <alpha-value>)'
        },
        accent: {
          DEFAULT: '#6366f1',
          dim: '#4f46c4'
        }
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Inter', 'sans-serif']
      }
    }
  },
  plugins: []
}
