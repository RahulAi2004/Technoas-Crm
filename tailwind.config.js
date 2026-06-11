/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50:'#eef2ff',100:'#e0e7ff',500:'#4f46e5',600:'#4338ca',700:'#3730a3' },
        ink:   { 900:'#0b0f1a',800:'#0d1220',700:'#111827' }
      },
      fontFamily: {
        sans: ['Inter','ui-sans-serif','system-ui','-apple-system','Segoe UI','Roboto','Helvetica','Arial','sans-serif']
      }
    }
  },
  plugins: []
}
