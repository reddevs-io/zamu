import { defineConfig } from 'tsdown';

// The published CLI bundles the workspace packages it uses (they ship as TypeScript source) and imports
// its npm dependencies at runtime.
export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  clean: true,
  dts: false,
  // package.json has "type": "module", so emit dist/index.js (the bin path) instead of .mjs.
  fixedExtension: false,
  deps: {
    alwaysBundle: [/^@zamu\//],
  },
});
