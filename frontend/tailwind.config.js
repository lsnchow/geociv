/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Dark minimal palette
        civic: {
          bg: '#0a0a0b',
          surface: '#111113',
          elevated: '#18181b',
          border: '#27272a',
          muted: '#3f3f46',
          text: '#fafafa',
          'text-secondary': '#a1a1aa',
          accent: '#3b82f6',
          'accent-muted': '#1d4ed8',
          support: '#22c55e',
          'support-muted': '#15803d',
          oppose: '#ef4444',
          'oppose-muted': '#b91c1c',
          neutral: '#71717a',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}

