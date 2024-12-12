import { defineConfig } from 'vite';


export default defineConfig({
    base: '/',
    build: {
        rollupOptions: {
            external: [],
        },
    },
    resolve: {
        alias: {
            // Add aliases if needed
        },
    },
});
