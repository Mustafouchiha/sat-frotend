/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        card: 'var(--card)',
        text: 'var(--text)',
        hint: 'var(--hint)',
        accent: 'var(--accent)',
        'accent-text': 'var(--accent-text)',
        link: 'var(--link)',
        line: 'var(--line)',
        soft: 'var(--soft)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      keyframes: {
        pop: { '0%': { transform: 'scale(.6)', opacity: 0 }, '60%': { transform: 'scale(1.15)', opacity: 1 }, '100%': { transform: 'scale(1)' } },
        floatUp: { '0%': { transform: 'translateY(8px)', opacity: 0 }, '20%': { opacity: 1 }, '100%': { transform: 'translateY(-28px)', opacity: 0 } },
        slideUp: { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
      },
      animation: {
        pop: 'pop .35s ease-out',
        floatUp: 'floatUp 1.6s ease-out forwards',
        slideUp: 'slideUp .25s cubic-bezier(.32,.72,0,1)',
        fadeIn: 'fadeIn .2s ease-out',
      },
    },
  },
  plugins: [],
};
