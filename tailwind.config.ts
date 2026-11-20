import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          yellow: "#FFD700",
          "yellow-bright": "#FFDE00",
          "yellow-hover": "#F2C900",
          black: "#111111",
          surface: "#F8F9FA",
          green: "#009C3B",
          amber: "#D97706",
          red: "#DC2626",
        },
      },
      fontFamily: {
        sans: [
          '"Plus Jakarta Sans"',
          '"Nunito"',
          '"Inter"',
          '"Segoe UI"',
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
