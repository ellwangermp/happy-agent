import type { AgentConfig } from "@slopus/happy-agent-base";
import type { Context } from "@steve.kite/stdlib";
import { describe, expect, it, vi } from "vitest";

import { SubtasksModule } from "../../sources/subtasks/index.js";
import { isEsteiraCard } from "../../sources/subtasks/casaCartao.js";
import { moduleDatabase } from "../support/moduleDatabase.js";

/** One active bot, held in memory (the same fixture as SubtaskConversations.test.ts). */
function fixture() {
    const ctx = moduleDatabase([], "casa-cartao").context;
    const configs = new Map<string, AgentConfig>([
        ["botagent", { metadata: { version: 1 }, environment: { workingDirectory: "/bot" } }],
    ] as unknown as [string, AgentConfig][]);
    const parents = new Map<string, string | null>([["botagent", null]]);
    const agents = {
        config: async (_ctx: Context, id: string) => configs.get(id),
        parentOf: async (_ctx: Context, id: string) => parents.get(id) ?? null,
        childOf: async (_ctx: Context, id: string) =>
            [...parents].flatMap(([child, parent]) => (parent === id ? [child] : [])),
        create: vi.fn(
            async (_ctx: Context, config: AgentConfig, options: { id: string; parent: string }) => {
                configs.set(options.id, config);
                parents.set(options.id, options.parent);
                return { id: options.id };
            },
        ),
    };
    const module = new SubtasksModule(
        {
            forAgent: async (_ctx: Context, id: string) =>
                id === "botagent" ? { status: "active" } : undefined,
        } as never,
        { forAgent: async () => undefined } as never,
        {
            unreportedAgentMetadata: () => ({ collaboration: { reportToCreator: false } }),
            selectModel: () => ({ model: "test-model", effort: "high", provider: "claude" }),
        } as never,
        { onEventTransactional: vi.fn(), get: vi.fn() } as never,
        { register: vi.fn(), invoke: vi.fn(), cancel: vi.fn() } as never,
        {} as never,
        {} as never,
    );
    module.beforeStart(ctx, agents as never);
    return { ctx, configs, module };
}

const task = { text: "Leia o mensagem.md.", model: "test-model", effort: "high" as const };

describe("casa: a card subtask of the esteira reports through the card", () => {
    it("recognizes only the exact card title", () => {
        expect(isEsteiraCard("Cartão acfa002333")).toBe(true);
        expect(isEsteiraCard("Cartão g-664e8c3230")).toBe(true);
        expect(isEsteiraCard("Cartões antigos")).toBe(false);
        expect(isEsteiraCard("Research")).toBe(false);
    });

    it("creates the card subtask unreported, with the card marker", async () => {
        const { ctx, configs, module } = fixture();
        await module.create(ctx, "botagent", { ...task, title: "Cartão acfa002333" }, "cardagent");
        expect(configs.get("cardagent")!.metadata).toMatchObject({
            collaboration: { reportToCreator: false },
            casa: { cartao: true },
            title: "Cartão acfa002333",
            subtask: true,
        });
    });

    it("leaves any other subtask reporting to its creator", async () => {
        const { ctx, configs, module } = fixture();
        await module.create(ctx, "botagent", { ...task, title: "Research" }, "otheragent");
        const metadata = configs.get("otheragent")!.metadata ?? {};
        expect(metadata["collaboration"]).toBeUndefined();
        expect(metadata["casa"]).toBeUndefined();
    });
});
