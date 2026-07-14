/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

const root = process.cwd();

export default defineConfig({
    root: root,
    plugins: [react()],
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: [path.resolve(root, './src/setupTests.ts')],
        include: ['src/**/*.{test,spec}.{ts,tsx}'],
        exclude: ['src/**/*.native.test.{ts,tsx}', 'node_modules', 'dist'],
    },
    define: {
        'import.meta.env.VITE_API_URL': JSON.stringify('http://localhost:3000/api'),
    },
    resolve: {
        preserveSymlinks: true,
        alias: {
            '@': path.resolve(root, './src'),
        },
    },
});
