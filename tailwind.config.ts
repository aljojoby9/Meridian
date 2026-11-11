import type { Config } from "tailwindcss";
import { mapColors } from "./src/lib/show-visuals";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#07080b",
        panel: "#10131a",
        panel2: "#151923",
        border: "#232938",
        text: "#eef2ff",
        muted: "#9aa4bf",
        gold: "#d6b25e",
        gold2: "#b9923f",
        available: mapColors.available,
        aperture: mapColors.aperture,
        taken: mapColors.taken,
        recliner: "#24364a",
        selected: mapColors.selected,
        held: mapColors.held,
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(214,178,94,0.25), 0 10px 40px rgba(0,0,0,0.45)",
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
