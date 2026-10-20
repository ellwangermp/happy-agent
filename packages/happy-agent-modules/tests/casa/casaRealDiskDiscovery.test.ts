import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createHostCompute } from "@slopus/happy-agent-compute";
import { createRootContext } from "@steve.kite/stdlib";
import { afterEach, describe, expect, it } from "vitest";

import { SkillsModule } from "../../sources/skills/index.js";
import { scriptedComputeModule } from "../support/computeModule.js";
import { systemPromptWorld } from "../systemPrompt/support/systemPromptWorld.js";

/**
 * Casa fork (20/10/2026): the skills and AGENTS.md tests upstream run on a pretend Linux machine
 * (FakeCompute, "/workspace"), which a Windows computer cannot be. These read a real folder on the
 * computer the tests run on, through the real host compute, so the house's Windows notebook proves
 * what its bots actually get: the AGENTS.md from the Git root down to the working folder, and the
 * project skills, named with the computer's own paths.
 *
 * The project sits beside the repository, as the house's projects sit in C:\VS_Projects. Not in
 * the temporary folder: on Windows that one is inside the user's profile, where Happy (rightly)
 * refuses to read a parent of the working folder, so the Git root above it would go unseen.
 */

const ctx = createRootContext().named("casa-real-disk-discovery");
const roots: string[] = [];
const BESIDE_THE_REPOSITORY = fileURLToPath(new URL("../../../.context", import.meta.url));

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function project() {
    await mkdir(BESIDE_THE_REPOSITORY, { recursive: true });
    const root = await realpath(await mkdtemp(join(BESIDE_THE_REPOSITORY, "casa-real-disk-")));
    roots.push(root);
    const app = join(root, "packages", "app");
    await mkdir(join(root, ".git"), { recursive: true });
    await mkdir(app, { recursive: true });
    await mkdir(join(root, ".agents", "skills", "review"), { recursive: true });
    await mkdir(join(root, "other"), { recursive: true });
    await writeFile(join(root, "AGENTS.md"), "Fale português.", "utf8");
    await writeFile(join(root, "packages", "AGENTS.md"), "Use package conventions.", "utf8");
    await writeFile(join(root, "other", "AGENTS.md"), "Not applicable.", "utf8");
    await writeFile(
        join(root, ".agents", "skills", "review", "SKILL.md"),
        "---\nname: review\ndescription: Review the change.\n---\n\nReview instructions.",
        "utf8",
    );
    return { root, app, compute: createHostCompute({ ctx, cwd: app }) };
}

describe("casa: discovery on the real disk of the computer the tests run on", () => {
    it("reads AGENTS.md from the Git root down to the working folder", async () => {
        const { root, app, compute } = await project();
        try {
            const world = await systemPromptWorld({ compute: async () => compute });
            await expect(world.module.readAgentsMd(ctx, "agent-a")).resolves.toEqual({
                cwd: app,
                documents: [
                    { path: join(root, "AGENTS.md"), text: "Fale português." },
                    { path: join(root, "packages", "AGENTS.md"), text: "Use package conventions." },
                ],
            });
        } finally {
            await compute.dispose(ctx);
        }
    });

    it("lists the project's skills where they are on this computer", async () => {
        const { root, compute } = await project();
        try {
            const skills = new SkillsModule(scriptedComputeModule(async () => compute));
            await expect(skills.list(ctx, "agent-a")).resolves.toMatchObject({
                skills: [
                    {
                        name: "review",
                        description: "Review the change.",
                        location: join(root, ".agents", "skills", "review", "SKILL.md"),
                        source: "project",
                    },
                ],
            });
        } finally {
            await compute.dispose(ctx);
        }
    });
});
