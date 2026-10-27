/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Schibsted Grotesk"', 'system-ui', 'sans-serif'] },
      colors: {
        ink: { 950: '#101B22', 900: '#162630', 800: '#1F3440', 600: '#46606E', 400: '#8399A4', 200: '#CBD6DB', 100: '#E6ECEE' },
        paper: '#F5F7F7',
        teal: { 500: '#0E8C87', 600: '#0B726E', 700: '#095956' },
        signal: '#F0A030',
      },
    },
  },
  plugins: [],
};
