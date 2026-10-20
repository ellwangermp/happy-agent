import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        setupFiles: [
            "../../scripts/windowsSandboxTestSetup.ts",
            "../../scripts/isolateHappyTestEnvironment.ts",
            "../../scripts/exitOrphanedTestWorker.ts",
            "../../scripts/casaWindowsTestCleanup.ts",
            "tests/support/casaWindowsTestEnvironment.ts",
            "tests/support/casaWindowsSkips.ts",
        ],
        exclude: ["tests/**/*.live.test.ts"],
        include: ["tests/**/*.test.ts"],
        // Half the cores leaves room for the agents and daemons that run beside a suite.
        maxWorkers: "50%",
        // Casa fork (20/10/2026): Windows starts processes slower than the Linux runner upstream uses.
        ...(process.platform === "win32" ? { testTimeout: 30_000, hookTimeout: 30_000 } : {}),
    },
});
