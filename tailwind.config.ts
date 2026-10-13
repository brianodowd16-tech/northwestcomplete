import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          50: "#eef4fb",
          100: "#d6e3f3",
          200: "#adc6e6",
          300: "#7ea3d3",
          400: "#4f7cbc",
          500: "#2f5ea3",
          600: "#214a87",
          700: "#1b3b6d",
          800: "#152d52",
          900: "#0d1d36",
          950: "#081224",
        },
        sea: {
          50: "#ecfbf8",
          100: "#cff4ec",
          200: "#a0e8da",
          300: "#67d5c3",
          400: "#33bba8",
          500: "#179e8e",
          600: "#0f7f74",
          700: "#10665e",
          800: "#11514c",
          900: "#124440",
        },
        brass: {
          400: "#e7b85a",
          500: "#d69e2e",
          600: "#b07d1c",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
