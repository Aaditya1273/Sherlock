import { defineConfig } from 'vitest/config';

// Only Sherlock's own tests. The reference clone under refrance/ carries its
// own suites, and node_modules never runs.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'refrance', '.next', 'out'],
  },
});
