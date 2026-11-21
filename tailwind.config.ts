import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          50: "rgb(var(--navy-50) / <alpha-value>)",
          100: "rgb(var(--navy-100) / <alpha-value>)",
          200: "rgb(var(--navy-200) / <alpha-value>)",
          300: "rgb(var(--navy-300) / <alpha-value>)",
          400: "rgb(var(--navy-400) / <alpha-value>)",
          500: "rgb(var(--navy-500) / <alpha-value>)",
          600: "rgb(var(--navy-600) / <alpha-value>)",
          700: "rgb(var(--navy-700) / <alpha-value>)",
          800: "rgb(var(--navy-800) / <alpha-value>)",
          900: "rgb(var(--navy-900) / <alpha-value>)",
          950: "rgb(var(--navy-950) / <alpha-value>)",
        },
        sea: {
          50: "rgb(var(--sea-50) / <alpha-value>)",
          100: "rgb(var(--sea-100) / <alpha-value>)",
          200: "rgb(var(--sea-200) / <alpha-value>)",
          300: "rgb(var(--sea-300) / <alpha-value>)",
          400: "rgb(var(--sea-400) / <alpha-value>)",
          500: "rgb(var(--sea-500) / <alpha-value>)",
          600: "rgb(var(--sea-600) / <alpha-value>)",
          700: "rgb(var(--sea-700) / <alpha-value>)",
          800: "rgb(var(--sea-800) / <alpha-value>)",
          900: "rgb(var(--sea-900) / <alpha-value>)",
        },
        brass: {
          400: "rgb(var(--brass-400) / <alpha-value>)",
          500: "rgb(var(--brass-500) / <alpha-value>)",
          600: "rgb(var(--brass-600) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
