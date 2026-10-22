import type { AgentConfig } from "@slopus/happy-agent-base";
import type { Context } from "@steve.kite/stdlib";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../../sources/api/ApiError.js";
import { casaCardSubtask } from "../../sources/api/casaSubtarefa.js";
import { SubtasksModule } from "../../sources/subtasks/index.js";
import { moduleDatabase } from "../support/moduleDatabase.js";

/** One active bot, held in memory (the fixture of casaCartao.test.ts). */
function fixture() {
    const ctx = moduleDatabase([], "casa-subtarefa").context;
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
    const durable = { register: vi.fn(), invoke: vi.fn(), cancel: vi.fn() };
    const module = new SubtasksModule(
        {
            forAgent: async (_ctx: Context, id: string) =>
                id === "botagent" ? { status: "active" } : undefined,
        } as never,
        { forAgent: async () => undefined } as never,
        {
            unreportedAgentMetadata: () => ({ collaboration: { reportToCreator: false } }),
            selectModel: () => ({
                model: "anthropic/opus-5-5",
                effort: "high",
                provider: "claude",
            }),
        } as never,
        { onEventTransactional: vi.fn(), get: vi.fn() } as never,
        durable as never,
        {} as never,
        {} as never,
    );
    module.beforeStart(ctx, agents as never);
    return { ctx, configs, parents, agents, durable, module };
}

const body = {
    id: "ccef24d4138t1",
    title: "Cartão cef24d4138",
    text: "Você é o Happy. Leia o mensagem.md.",
    model: "anthropic/opus-5-5",
    effort: "high" as const,
    provider: "claude",
};

describe("casa: the esteira opens a card's subtask itself", () => {
    it("opens the card subtask under the bot's agent, unreported, with its opening task", async () => {
        const { ctx, configs, parents, durable, module } = fixture();
        expect(await casaCardSubtask(ctx, module, "botagent", body)).toEqual({
            agentId: "ccef24d4138t1",
        });
        expect(parents.get("ccef24d4138t1")).toBe("botagent");
        expect(configs.get("ccef24d4138t1")!.metadata).toMatchObject({
            collaboration: { reportToCreator: false },
            casa: { cartao: true },
            title: "Cartão cef24d4138",
            subtask: true,
        });
        expect(durable.invoke).toHaveBeenCalledTimes(1);
    });

    it("returns the same subtask when the esteira retries with the same ID", async () => {
        const { ctx, agents, module } = fixture();
        await casaCardSubtask(ctx, module, "botagent", body);
        expect(await casaCardSubtask(ctx, module, "botagent", body)).toEqual({
            agentId: "ccef24d4138t1",
        });
        expect(agents.create).toHaveBeenCalledTimes(1);
    });

    it("refuses any title that is not an esteira card", async () => {
        const { ctx, agents, module } = fixture();
        await expect(
            casaCardSubtask(ctx, module, "botagent", { ...body, title: "Research" }),
        ).rejects.toBeInstanceOf(ApiError);
        expect(agents.create).not.toHaveBeenCalled();
    });

    it("refuses when the daemon has no subtasks", async () => {
        const { ctx } = fixture();
        await expect(casaCardSubtask(ctx, undefined, "botagent", body)).rejects.toBeInstanceOf(
            ApiError,
        );
    });
});
