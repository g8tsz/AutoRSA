/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0f0f12',
          raised: '#16161c',
          border: '#2a2a32'
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
