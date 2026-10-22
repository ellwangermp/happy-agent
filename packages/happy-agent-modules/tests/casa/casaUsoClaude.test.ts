import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRootContext } from "@steve.kite/stdlib";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfigModule } from "../../sources/config/index.js";
import { ProviderUsageModule } from "../../sources/providerUsage/index.js";

const directories: string[] = [];

afterEach(async () => {
    vi.unstubAllEnvs();
    await Promise.all(directories.splice(0).map((d) => rm(d, { force: true, recursive: true })));
});

async function module() {
    const home = await mkdtemp(join(tmpdir(), "casa-uso-claude-"));
    directories.push(home);
    const config = await ConfigModule.load(home);
    const read = vi.spyOn(config, "readProviderUsage").mockResolvedValue(null);
    return { usage: new ProviderUsageModule(config), read, ctx: createRootContext().named("casa-uso") };
}

describe("casa: Claude's plan is read on the house panel, never polled at Anthropic", () => {
    it("does not ask Anthropic for Claude where the house panel exists", async () => {
        vi.stubEnv("HAPPY_CASA_CONTAS_CMD", JSON.stringify(["python", "contas.py", "painel"]));
        const { usage, read, ctx } = await module();
        await usage.refresh(ctx, "claude");
        expect(read).not.toHaveBeenCalled();
        await usage.refresh(ctx, "codex");
        expect(read).toHaveBeenCalledWith(expect.anything(), "codex");
    });

    it("still polls Claude where there is no house panel", async () => {
        vi.stubEnv("HAPPY_CASA_CONTAS_CMD", "");
        const { usage, read, ctx } = await module();
        await usage.refresh(ctx, "claude");
        expect(read).toHaveBeenCalledWith(expect.anything(), "claude");
    });
});
