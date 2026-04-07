import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    allowedHosts: true,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari14',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    rollupOptions: {
      output: {
        manualChunks: {
          // React 核心
          'react-vendor': ['react', 'react-dom'],
          // Milkdown + CodeMirror 编辑器核心（合并避免循环依赖）
          editor: [
            '@milkdown/kit',
            '@milkdown/plugin-block',
            '@milkdown/plugin-slash',
            '@milkdown/plugin-upload',
            '@milkdown/react',
            '@milkdown/theme-nord',
            '@milkdown/utils',
            'codemirror',
            '@codemirror/commands',
            '@codemirror/lang-markdown',
            '@codemirror/language',
            '@codemirror/state',
            '@codemirror/theme-one-dark',
            '@codemirror/view',
            '@lezer/highlight',
          ],
          // Tauri API
          'tauri-vendor': [
            '@tauri-apps/api',
            '@tauri-apps/plugin-dialog',
            '@tauri-apps/plugin-fs',
            '@tauri-apps/plugin-notification',
            '@tauri-apps/plugin-os',
            '@tauri-apps/plugin-shell',
            '@tauri-apps/plugin-store',
          ],
          // 工具库
          utils: [
            'dompurify',
            'katex',
            'lucide-react',
            'react-icons',
            '@floating-ui/dom',
            'zustand',
            'clsx',
            'tailwind-merge',
          ],
        },
      },
    },
  },
});
