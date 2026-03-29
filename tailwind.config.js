/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "SF Pro Text",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Noto Sans SC",
          "PingFang SC",
          "Microsoft YaHei",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "Fira Code",
          "SF Mono",
          "Cascadia Code",
          "Source Code Pro",
          "Consolas",
          "monospace",
        ],
      },
      colors: {
        editor: {
          bg: "var(--editor-bg)",
          text: "var(--editor-text)",
          border: "var(--editor-border)",
        },
        sidebar: {
          bg: "var(--sidebar-bg)",
          text: "var(--sidebar-text)",
          border: "var(--sidebar-border)",
        },
        titlebar: {
          bg: "var(--titlebar-bg)",
          text: "var(--titlebar-text)",
        },
      },
      maxWidth: {
        editor: "var(--editor-max-width, 800px)",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    require("@tailwindcss/typography"),
  ],
};
