/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        night: {
          900: '#06080f',
          800: '#0b1020',
          700: '#11182d'
        },
        aurora: {
          400: '#7dd3fc',
          500: '#38bdf8',
          600: '#0ea5e9'
        },
        nebula: {
          400: '#c4b5fd',
          500: '#a78bfa',
          600: '#8b5cf6'
        },
        solar: {
          500: '#f59e0b'
        }
      },
      boxShadow: {
        glow: '0 0 30px rgba(56, 189, 248, 0.15)',
        neon: '0 0 40px rgba(167, 139, 250, 0.2)'
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular']
      }
    }
  },
  plugins: []
};
