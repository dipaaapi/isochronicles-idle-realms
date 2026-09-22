/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        aether: {
          blue: '#38bdf8',
          cyan: '#06b6d4',
          dark: '#0f172a',
          deep: '#020617',
          amber: '#f59e0b',
          emerald: '#10b981',
          purple: '#a855f7',
          rose: '#f43f5e',
        }
      },
      fontFamily: {
        fantasy: ['Cinzel', 'Trajan Pro', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 4s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        }
      }
    },
  },
  plugins: [
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('daisyui'),
  ],
  daisyui: {
    themes: [
      {
        aetherpunk: {
          "primary": "#38bdf8",
          "secondary": "#a855f7",
          "accent": "#f59e0b",
          "neutral": "#1e293b",
          "base-100": "#0f172a",
          "base-200": "#090d16",
          "base-300": "#04070d",
          "info": "#0284c7",
          "success": "#10b981",
          "warning": "#f59e0b",
          "error": "#f43f5e",
        },
      },
      "dark",
    ],
  },
}
