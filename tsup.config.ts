import { writeFile } from 'node:fs/promises';
import { defineConfig } from 'tsup';

// Two passes into dist/cjs and dist/esm (rather than tsup's default flat
// dist/index.js + dist/index.mjs) to keep package.json's main/module/types/
// exports fields — and the dist/-rooted publish flow in prepare-package.ts —
// unchanged. Only the build tool is being swapped here, not the output shape.
export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['cjs'],
    outDir: 'dist/cjs',
    target: 'es2019',
    dts: true,
    sourcemap: true,
    clean: true,
    onSuccess: async () => {
      // Without this, dist/cjs/*.js has no package.json declaring its module
      // type, so Node has to sniff file content to tell CJS from ESM.
      await writeFile('dist/cjs/package.json', JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');
    },
  },
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    outDir: 'dist/esm',
    target: 'es2019',
    dts: false, // `types` in package.json points at dist/cjs/index.d.ts; no need to duplicate it
    sourcemap: true,
    clean: true,
    outExtension: () => ({ js: '.js' }),
    onSuccess: async () => {
      await writeFile('dist/esm/package.json', JSON.stringify({ type: 'module' }, null, 2) + '\n');
    },
  },
]);
