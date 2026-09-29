import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { host: '127.0.0.1', port: 5173 },
  // One shared three.js instance for the app, 3d-tiles-renderer and three-mesh-bvh.
  resolve: { dedupe: ['three'] },
  build: { target: 'es2022', sourcemap: true },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
