/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0e0d0c', 900: '#0e0d0c', 800: '#151412', 700: '#1c1a17', 600: '#262420', 500: '#34312b' },
        paper: { DEFAULT: '#f4efe6', dim: '#a39c8f', mute: '#6f695f' },
        lime: { DEFAULT: '#d9ff3f', deep: '#b8e000' },
        coral: '#ff5a47',
      },
      fontFamily: {
        sans: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      letterSpacing: { tightest: '-0.06em' },
      transitionTimingFunction: {
        out: 'cubic-bezier(.2,.8,.2,1)',
        spring: 'cubic-bezier(.3,1.5,.5,1)',
      },
      keyframes: {
        marquee: { to: { transform: 'translateX(-50%)' } },
        spin: { to: { transform: 'rotate(360deg)' } },
        shimmer: { to: { backgroundPosition: '-200% 0' } },
        tick: { '50%': { transform: 'translateX(8px)' } },
      },
      animation: {
        marquee: 'marquee 22s linear infinite',
        disc: 'spin 5s linear infinite',
        shimmer: 'shimmer 1.4s linear infinite',
        tick: 'tick 1.2s steps(1) infinite',
      },
    },
  },
  plugins: [],
};
