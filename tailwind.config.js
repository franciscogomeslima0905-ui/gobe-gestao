/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cereja: { DEFAULT: '#CE0D32', 50: '#FDE8EC', 100: '#F9C6D0', 600: '#B50B2C', 700: '#9A0925' },
        bordo: { DEFAULT: '#581D29', 50: '#F4E9EB', 100: '#E6CED3', 400: '#8A4352', 600: '#4A1822', 700: '#3B131B' },
        rosa: { DEFAULT: '#F3B4D0', 50: '#FDF2F7', 100: '#FAE0EC', 300: '#F3B4D0', 500: '#E27FAB' },
        creme: { DEFAULT: '#F6EFE5', 50: '#FBF8F3', 200: '#EFE3D2', 300: '#E5D4BC' },
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Nunito', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 2px 10px -2px rgba(88, 29, 41, 0.08), 0 8px 24px -8px rgba(88, 29, 41, 0.10)',
        lift: '0 10px 30px -10px rgba(88, 29, 41, 0.25)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        'scale-in': { from: { opacity: '0', transform: 'scale(.96)' }, to: { opacity: '1', transform: 'none' } },
        'slide-in': { from: { opacity: '0', transform: 'translateX(24px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        'fade-in': 'fade-in .35s ease-out both',
        'scale-in': 'scale-in .2s ease-out both',
        'slide-in': 'slide-in .3s ease-out both',
      },
    },
  },
  plugins: [],
};
