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
        // Single brand accent ("cobalto noche"), exact approved hex. It's too dark to pair
        // with dark text (bg-pulse buttons use text-starlight now, not text-abyss — see
        // the `text-abyss` → `text-starlight` swap below).
        pulse: "#2456b8",
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
