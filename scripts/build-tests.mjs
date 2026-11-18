// Empaqueta los módulos puros que consumen las pruebas. Sin dependencias
// nuevas: usa el esbuild que ya trae el proyecto.
import { build } from 'esbuild';

await build({
  entryPoints: ['tests/support/modules.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: '.local/test-build/modules.mjs',
  logLevel: 'silent',
});
