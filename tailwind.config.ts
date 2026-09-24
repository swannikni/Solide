import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        c2b: {
          green: "#1c2e1e",
          gold: "#c9973a",
          cream: "#f5f0e8",
        },
      },
      fontFamily: {
        hand: ["var(--font-hand)", "cursive"],
      },
    },
  },
  plugins: [],
};

export default config;
