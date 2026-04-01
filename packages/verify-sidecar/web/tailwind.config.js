/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ario: {
          primary: '#5427C8',
          lavender: '#DFD6F7',
          black: '#23232D',
          white: '#FFFFFF',
          card: '#F0F0F0',
          border: 'rgba(35, 35, 45, 0.12)',
        },
      },
      fontFamily: {
        heading: ['Besley', 'Georgia', 'serif'],
        body: ['Plus Jakarta Sans', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
