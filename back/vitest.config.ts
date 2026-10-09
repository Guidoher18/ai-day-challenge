import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Forks (not threads) so tests can use process.chdir.
    pool: "forks",
    mockReset: true,
    restoreMocks: true,
    unstubEnvs: true,
  },
});
