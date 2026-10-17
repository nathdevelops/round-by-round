import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// three.js makes one ~1.2 MB bundle; splitting it buys nothing for a single-page editor yet.
export default defineConfig({ plugins: [react()], base: './', build: { chunkSizeWarningLimit: 1600 } });
