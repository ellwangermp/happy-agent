import { describe, expect, it } from "vitest";
import type { ProviderUsage } from "@slopus/happy-providers";
import { claudeFull, reserveHasRoom, reserveRoute, FRESH_READING_MS } from "../../sources/happy/reserveRoute.js";

const NOW = 1_800_000_000_000;

function reading(vendor: "claude" | "codex", fiveHour: number, weekly: number, extra: Partial<ProviderUsage> = {}): ProviderUsage {
    const window = (usedPercent: number) => ({ usedPercent, resetsAt: null, startsAt: null, durationMs: null });
    return {
        providerId: vendor,
        vendor,
        capturedAt: NOW - 60_000,
        planName: null,
        exhausted: false,
        windows: { fiveHour: window(fiveHour), weekly: window(weekly), monthly: null },
        credits: null,
        ...extra,
    };
}

const models = [
    { id: "claude-opus-5-5", providerId: "claude", defaultEffort: "high" },
    { id: "openai/gpt-5.6-sol", providerId: "codex", defaultEffort: "medium" },
];
const typeOf = (id: string) => (id === "claude" || id === "codex" ? id : null);
const onClaude = { effort: "high", modelId: "claude-opus-5-5", permissionMode: "yolo", providerId: "claude", serviceTier: null };

describe("claudeFull", () => {
    it("is full when the vendor refuses or a fresh reading is at the swap line of contas.py", () => {
        expect(claudeFull(reading("claude", 10, 10, { exhausted: true }), NOW)).toBe(true);
        expect(claudeFull(reading("claude", 20, 99.5), NOW)).toBe(true);
        expect(claudeFull(reading("claude", 99.6, 30), NOW)).toBe(true);
    });

    it("has room under the line, when unknown, and when the reading is old (contas.py may have swapped since)", () => {
        expect(claudeFull(reading("claude", 50, 99), NOW)).toBe(false);
        expect(claudeFull(null, NOW)).toBe(false);
        expect(claudeFull(reading("claude", 20, 100, { capturedAt: NOW - FRESH_READING_MS - 1 }), NOW)).toBe(false);
    });
});

describe("reserveHasRoom", () => {
    it("needs Codex under 95% and not refusing; unknown is worth trying", () => {
        expect(reserveHasRoom(reading("codex", 0, 31))).toBe(true);
        expect(reserveHasRoom(reading("codex", 0, 95))).toBe(false);
        expect(reserveHasRoom(reading("codex", 0, 10, { exhausted: true }))).toBe(false);
        expect(reserveHasRoom(null)).toBe(true);
    });
});

describe("reserveRoute", () => {
    it("keeps Claude while it has room", () => {
        const route = reserveRoute({ selection: onClaude, models, typeOf, usage: (id) => reading(id as never, 30, 50), now: NOW });
        expect(route).toEqual({ selection: onClaude, movedFrom: undefined, change: null });
    });

    it("sends the message to Codex when every Claude plan is spent, and remembers the way back", () => {
        const usage = (id: string) => (id === "claude" ? reading("claude", 0, 100) : reading("codex", 0, 31));
        const route = reserveRoute({ selection: onClaude, models, typeOf, usage, now: NOW });
        expect(route.change).toBe("to-reserve");
        expect(route.selection).toEqual({ effort: "medium", modelId: "openai/gpt-5.6-sol", permissionMode: "yolo", providerId: "codex" });
        expect(route.movedFrom).toBe(onClaude);
    });

    it("stays on Claude when Codex is spent too (the refusal is honest)", () => {
        const usage = (id: string) => (id === "claude" ? reading("claude", 0, 100) : reading("codex", 0, 99));
        expect(reserveRoute({ selection: onClaude, models, typeOf, usage, now: NOW }).change).toBeNull();
    });

    it("goes back to the Claude selection once Claude has room, and not before", () => {
        const onCodex = { effort: "medium", modelId: "openai/gpt-5.6-sol", permissionMode: "yolo", providerId: "codex" };
        const full = (id: string) => (id === "claude" ? reading("claude", 0, 100) : reading("codex", 0, 31));
        const still = reserveRoute({ selection: onCodex, models, typeOf, usage: full, movedFrom: onClaude, now: NOW });
        expect(still).toEqual({ selection: onCodex, movedFrom: onClaude, change: null });
        const free = (id: string) => (id === "claude" ? reading("claude", 0, 14) : reading("codex", 0, 31));
        const back = reserveRoute({ selection: onCodex, models, typeOf, usage: free, movedFrom: onClaude, now: NOW });
        expect(back).toEqual({ selection: onClaude, movedFrom: undefined, change: "back" });
    });

    it("never touches a conversation the person put on Codex by choice", () => {
        const onCodex = { effort: "medium", modelId: "openai/gpt-5.6-sol", permissionMode: "yolo", providerId: "codex" };
        const free = (id: string) => reading(id as never, 0, 10);
        expect(reserveRoute({ selection: onCodex, models, typeOf, usage: free, now: NOW }).change).toBeNull();
    });
});
