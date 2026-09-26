import type { Config } from "tailwindcss";

// Charte reprise de chef2box.com.
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        c2b: {
          green: "#1c2e1e",
          "green-mid": "#2a4030",
          gold: "#c9973a",
          "gold-light": "#e0aa48",
          // Fond et filets : blanc cassé frais et gris vert léger.
          cream: "#f4f6f3",
          "cream-2": "#e7ebe5",
          // Couleurs des macros (barres, repères).
          prot: "#3f8f5b",
          gluc: "#e0a33b",
          lip: "#e07a5f",
          text: "#1a1a1a",
          muted: "#6f7a72",
        },
      },
      fontFamily: {
        sans: ["'DM Sans'", "sans-serif"],
        serif: ["'DM Serif Display'", "serif"],
        display: ["'Bebas Neue'", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
