/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Rubik', 'sans-serif'],
      },
      colors: {
        ario: {
          bg: '#0E0E0F',
          'bg-deep': '#050505',
          surface: '#1E1E24',
          'surface-hover': '#262629',
          divider: '#232329',
          'text-high': '#CACAD6',
          'text-mid': '#A3A3AD',
          'text-low': '#7F7F87',
          success: '#349FA8',
          error: '#DB4354',
          warning: '#FFB938',
          'stroke-low': 'rgba(202, 202, 214, 0.08)',
          'stroke-mid': 'rgba(202, 202, 214, 0.16)',
        },
      },
    },
  },
  plugins: [],
};
