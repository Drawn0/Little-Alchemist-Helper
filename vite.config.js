import { defineConfig } from 'vite';

export default defineConfig({
    base: '/Little-Alchemist-Helper/',
    root: 'app',
    build: {
        outDir: '../dist',
        emptyOutDir: true,
    },
});
