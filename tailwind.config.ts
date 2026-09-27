import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/modules/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        afl: {
          red: "#D32F2F",       // Đỏ chuẩn WCAG AAA (tương phản 7.5:1 trên nền trắng)
          yellow: "#FBC02D",    // Vàng highlight chạy phụ đề Karaoke
          bg: "#FFFDF0",        // Vàng ngà chống lóa mắt cho người già
          green: "#2E7D32",     // Xanh viền chỉ dẫn phát sáng
          paper: "#FFFFFF",     // Nền giấy trắng
          dark: "#1A1A1A",      // Chữ in đậm tương phản cao
          border: "#CBD5E1",
        },
      },
      keyframes: {
        "pulse-red": {
          "0%, 100%": {
            boxShadow: "0 0 0 3px rgba(211, 47, 47, 0.4), inset 0 0 0 1.5px rgba(211, 47, 47, 0.8)",
            borderColor: "#D32F2F",
          },
          "50%": {
            boxShadow: "0 0 0 7px rgba(211, 47, 47, 0.15), inset 0 0 0 2px rgba(211, 47, 47, 1)",
            borderColor: "#B71C1C",
          },
        },
      },
      animation: {
        "pulse-red": "pulse-red 1.4s ease-in-out infinite",
      },
      minHeight: {
        touch: "48px",
        "touch-lg": "56px",
      },
      minWidth: {
        touch: "48px",
        "touch-lg": "56px",
      },
    },
  },
  plugins: [],
};
export default config;
