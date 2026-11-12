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
        void: "#05060A",
        ink: "#0B1020",
        signal: "#4263FF",
        ion: "#42D9F5",
        nebula: "#9675FF",
        stellar: "#F4F6FC",
      },
      fontFamily: {
        sans: ["'Segoe UI'", "system-ui", "-apple-system", "Roboto", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
