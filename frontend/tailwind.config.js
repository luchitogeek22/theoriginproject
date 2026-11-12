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
      // The approved "cobalto noche" system has three roles. `colors.pulse` (#2456b8) stays the
      // fill (bg-pulse, gradients); as text or a border it would only reach ~2.8:1 on the dark
      // panels, so those utilities get their own shade of the same blue.
      textColor: { pulse: "#6f9be8" }, // ~7:1 on abyss/deep/panel
      borderColor: { pulse: "#2f62c6" }, // ≥3:1 non-text contrast for focus/hover borders
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
