/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50:'#eef2ff',100:'#e0e7ff',200:'#c7d2fe',300:'#a5b4fc',400:'#818cf8',500:'#4f46e5',600:'#4338ca',700:'#3730a3',800:'#312e81',900:'#1e1b4b' },
        ink:   { 900:'#0b0f1a',800:'#0d1220',700:'#111827' }
      },
      fontFamily: {
        sans: ['Inter','ui-sans-serif','system-ui','-apple-system','Segoe UI','Roboto','Helvetica','Arial','sans-serif']
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)',
        soft: '0 4px 16px -2px rgba(16,24,40,.08), 0 2px 6px -2px rgba(16,24,40,.05)',
        pop:  '0 12px 32px -8px rgba(16,24,40,.14)',
      },
      borderRadius: { xl: '0.85rem', '2xl': '1.1rem' },
    }
  },
  plugins: []
}
