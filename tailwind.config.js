/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#1B5E20',
        secondary: '#F9A825',
        highlight: '#A5D6A7',
        cream: '#FFF8E1',
        dark: '#424242',
        success: '#2E7D32',
      },
    },
  },
  plugins: [],
}
