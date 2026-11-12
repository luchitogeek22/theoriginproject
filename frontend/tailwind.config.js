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
        // Single brand accent ("cobalto noche"): bright enough to keep bg-pulse/text-abyss
        // buttons legible app-wide (AA, ~6:1), while reading as cobalt rather than cyan.
        pulse: "#5a8fe0",
        gold: "#c8a45c",
        void: "#05060A",
        ink: "#0B1020",
        signal: "#4263FF",
        ion: "#42D9F5",
        nebula: "#9675FF",
        stellar: "#F4F6FC",
      },
      fontFamily: {
        // IBM Plex Sans everywhere, loaded via next/font in app/[locale]/layout.tsx.
        sans: ["var(--font-sans)", "'IBM Plex Sans'", "system-ui", "-apple-system", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
