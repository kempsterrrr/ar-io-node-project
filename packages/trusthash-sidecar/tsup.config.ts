import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/migrate.ts'],
  format: ['esm'],
  platform: 'node',
  noExternal: ['@ar-io/c2pa-protocol'],
});
