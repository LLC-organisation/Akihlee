import type { Config } from "tailwindcss";

const config: Config = {
  // Toggled by adding/removing "dark" on <html> (see ThemeProvider), not by
  // system preference — matches the earlier decision to make the theme an
  // explicit user choice rather than automatic.
  darkMode: 'class',
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Fintech navy/steel-blue theme. 500-600 are the vivid interactive
        // accent (buttons, links, focus); 700-900 are the deep navy tones
        // used for emphasis/headings; contrast with white text verified
        // >=4.5:1 from 500 down.
        primary: {
          50: '#eaf2fb',
          100: '#cfe3f7',
          200: '#9fc7ef',
          300: '#6fa7e4',
          400: '#3684d6',
          500: '#0466c8', // Smart Blue
          600: '#0353a4', // Steel Azure
          700: '#023e7d', // Regal Navy
          800: '#002855', // Prussian Blue
          900: '#001233', // Prussian Blue (deepest)
        },
        // Cool blue-gray neutral scale, replacing default gray for surfaces,
        // borders, and secondary text — keeps the whole UI in one palette
        // family instead of mixing a warm gray with the blue accent.
        slate: {
          50: '#f6f7f9',
          100: '#eceef2',
          200: '#dde1e7',
          300: '#c3c9d4',
          400: '#979dac', // Cool Steel
          500: '#7d8597', // Slate Grey
          600: '#5c677d', // Blue Slate
          700: '#33415c', // Twilight Indigo
          800: '#232d40',
          900: '#161c29',
        },
      },
    },
  },
  plugins: [],
};

export default config;
