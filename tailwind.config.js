/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'SF Pro Text',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Noto Sans SC',
          'PingFang SC',
          'Microsoft YaHei',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'Fira Code',
          'SF Mono',
          'Cascadia Code',
          'Source Code Pro',
          'Consolas',
          'monospace',
        ],
      },
      colors: {
        editor: {
          bg: 'var(--lanismd-editor-bg)',
          text: 'var(--lanismd-editor-text)',
          border: 'var(--lanismd-editor-border)',
        },
        sidebar: {
          bg: 'var(--lanismd-sidebar-bg)',
          text: 'var(--lanismd-sidebar-text)',
          border: 'var(--lanismd-sidebar-border)',
        },
        titlebar: {
          bg: 'var(--lanismd-titlebar-bg)',
          text: 'var(--lanismd-titlebar-text)',
        },
      },
      maxWidth: {
        editor: 'var(--lanismd-editor-max-width, 800px)',
      },
    },
  },
  plugins: [require('tailwindcss-animate'), require('@tailwindcss/typography')],
};
