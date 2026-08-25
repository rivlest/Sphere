/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}', './test/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        night: '#070b14',
        panel: '#10182a',
        ink: '#d7e3f4',
        mute: '#8aa0bd',
        orb: '#5eead4',
        ring: '#818cf8',
        warn: '#fbbf24',
        danger: '#fb7185',
      },
      fontFamily: {
        sans: ['Outfit', 'Segoe UI', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 40px rgba(94, 234, 212, 0.18)',
      },
    },
  },
  plugins: [],
};
