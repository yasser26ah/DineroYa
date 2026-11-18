// Empaqueta worker/index.ts en un único módulo ESM para Sites.
import { build } from 'esbuild';

await build({
  entryPoints: ['worker/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  outfile: 'freebuff-sites-build/worker.js',
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': '"production"' },
});
