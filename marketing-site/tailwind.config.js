/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: '#1E3A8A', // Deep blue from your pitch deck
          green: '#10B981', // Success green
        }
      }
    },
  },
  plugins: [],
}