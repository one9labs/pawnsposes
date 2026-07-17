/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#091224',
          900: '#0f172a',
          700: '#334155',
          500: '#64748b',
          200: '#cbd5e1',
          100: '#e2e8f0',
          50: '#f8fafc',
        },
        accent: {
          50: '#fffaf0',
          100: '#feefc7',
          200: '#fcd77f',
          300: '#f9c84f',
          400: '#f4b221',
          500: '#d49514',
          600: '#a97010',
        },
        primary: {
          50: '#eef8f1',
          100: '#d7efe0',
          200: '#b2dec4',
          300: '#82c69e',
          400: '#4ca870',
          500: '#2c8a55',
          600: '#1f6d43',
          700: '#185637',
          800: '#17462f',
          900: '#123826',
        },
        gold: {
          50: '#fff8e1',
          100: '#ffefb5',
          200: '#ffe27f',
          300: '#f8cc47',
          400: '#e6ad20',
          500: '#c99012',
          600: '#a56f0c',
          700: '#83540f',
          800: '#6d4413',
          900: '#5d3915',
        },
        chess: {
          light: '#f0d9b5',
          dark: '#b58863',
          highlight: '#ffff00',
          move: '#9bc53d',
        },
        background: '#ffffff',
        foreground: '#0f172a',
        border: '#e2e8f0',
        ring: '#c99012',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 8px 24px rgba(15, 23, 42, 0.08)',
        elevated: '0 18px 48px rgba(15, 23, 42, 0.14)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
}
