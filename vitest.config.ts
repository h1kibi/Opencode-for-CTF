import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["node_modules"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "tools/lib/**/*.ts"],
      exclude: ["src/types.ts", "src/sdk.ts", "src/asset-paths.ts"],
      reporter: ["text", "lcov"],
      thresholds: {
        lines: 44,
        functions: 60,
        branches: 75,
        statements: 44,
      },
    },
  },
})
