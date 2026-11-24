import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// which build a session ran on (a Clarity tag, docs/test-data.md §Clarity): the build's UTC minute, so sessions before and after
// a change can be told apart and sorted
const BUILD = `b${new Date().toISOString().slice(2, 16).replace(/[-T:]/g, '')}`;

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    define: { 'import.meta.env.VITE_MABDA_BUILD': JSON.stringify(BUILD) },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
