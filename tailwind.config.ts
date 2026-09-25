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
          cream: "#f7f3ec",
          "cream-2": "#efe9de",
          text: "#1a1a1a",
          muted: "#777777",
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
