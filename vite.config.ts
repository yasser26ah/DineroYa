import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    // La compilación de producción (Sites) usa el Worker + D1 y login de Freebuff.
    const sites = mode === 'sites';
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), tailwindcss()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        ...(sites ? {
          'import.meta.env.VITE_DATA_MODE': JSON.stringify('api'),
          'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(''),
          'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(''),
        } : {}),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        rollupOptions: {
          output: {
            // El bundle inicial no debe cargar gráficas ni el cliente de IA:
            // son pesados y solo se usan en pantallas concretas.
            manualChunks: (id) => {
              if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) return 'charts';
              if (id.includes('@google/genai')) return 'gemini';
              return undefined;
            },
          },
        },
      }
    };
});
