import { describe, expect, it } from "vitest";
import { casaAutomaticReserve } from "../../sources/api/casaReserva.js";

describe("the house's own move between Claude and Codex", () => {
    it("is the message the esteira marks as the reserve", () => {
        expect(casaAutomaticReserve({ casa: { reserva: true } })).toBe(true);
    });

    it("is not a message without the mark, or with anything else in it", () => {
        expect(casaAutomaticReserve(undefined)).toBe(false);
        expect(casaAutomaticReserve(null)).toBe(false);
        expect(casaAutomaticReserve({})).toBe(false);
        expect(casaAutomaticReserve({ casa: { reserva: "true" } })).toBe(false);
        expect(casaAutomaticReserve({ casa: [true] })).toBe(false);
        expect(casaAutomaticReserve({ reserva: true })).toBe(false);
    });

    it("keeps the conversation's last mode when the house moved the message", async () => {
        const { readFile } = await import("node:fs/promises");
        const api = await readFile(new URL("../../sources/api/ApiModule.ts", import.meta.url), "utf8");
        expect(api).toMatch(/if \(!casaAutomaticReserve\(body\.clientMetadata\)\) \{\s*await this\.#updateAgentMetadata\(ctx, agentId, \{ lastMode: body\.mode \}\);/);
    });
});
