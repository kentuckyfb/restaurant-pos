const colors = require('tailwindcss/colors');

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Change this one line to re-theme the whole app
        brand: colors.orange,
      },
    },
  },
  plugins: [
    require('tailwind-scrollbar-hide')
  ],
}
