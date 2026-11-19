/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontSize: {
        // Fluid typography scale strictly using rem + vw inside clamp()
        // Guarantees clean legibility from 320px viewports up to desktop AND respects 200% OS/browser font scaling
        'fluid-2xs': ['clamp(0.6875rem, 0.65rem + 0.15vw, 0.75rem)', { lineHeight: '1.4' }],
        'fluid-xs': ['clamp(0.75rem, 0.71rem + 0.2vw, 0.8125rem)', { lineHeight: '1.45' }],
        'fluid-sm': ['clamp(0.8125rem, 0.77rem + 0.25vw, 0.9375rem)', { lineHeight: '1.5' }],
        'fluid-base': ['clamp(0.875rem, 0.82rem + 0.3vw, 1rem)', { lineHeight: '1.55' }],
        'fluid-lg': ['clamp(1rem, 0.92rem + 0.45vw, 1.1875rem)', { lineHeight: '1.4' }],
        'fluid-xl': ['clamp(1.125rem, 1rem + 0.7vw, 1.5rem)', { lineHeight: '1.3' }],
        'fluid-2xl': ['clamp(1.25rem, 1.05rem + 1vw, 1.875rem)', { lineHeight: '1.22' }],
        'fluid-3xl': ['clamp(1.5rem, 1.2rem + 1.5vw, 2.25rem)', { lineHeight: '1.15' }],
      },
      screens: {
        xs: '360px',
      },
    },
  },
  plugins: [],
}