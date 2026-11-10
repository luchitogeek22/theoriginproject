/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        abyss: "#04070f",
        deep: "#0a1122",
        panel: "#0d1528",
        line: "#1c2946",
        starlight: "#e8eefc",
        mutedstar: "#93a1c0",
        pulse: "#46d8ff",
        gold: "#c8a45c",
      },
      fontFamily: {
        sans: ["'Segoe UI'", "system-ui", "-apple-system", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
