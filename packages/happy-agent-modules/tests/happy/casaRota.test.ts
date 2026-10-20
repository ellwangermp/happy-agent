import type { MessageMode } from "@slopus/happy-agent-client";
import { describe, expect, it } from "vitest";
import { HappyMessageMapper } from "../../sources/happy/mapHappyMessages.js";
import { nomeDoModelo, textoDaRota } from "../../sources/happy/casaRota.js";

/** Casa fork (19/10/2026): the route that answered, as one line in his language. */

const claude = (conta?: string): MessageMode => ({
    providerId: "claude",
    providerType: "claude",
    modelId: "anthropic/opus-5-5",
    effort: "high",
    serviceTier: null,
    permissionMode: "auto",
    account: conta === undefined ? null : { id: `claude:${conta}`, label: conta },
});

const codex: MessageMode = {
    providerId: "codex",
    providerType: "codex",
    modelId: "openai/gpt-6.1-sol",
    effort: "high",
    serviceTier: null,
    permissionMode: "auto",
    account: null,
};

describe("casa: who answers, in his words", () => {
    it("names the models as he reads them", () => {
        expect(nomeDoModelo("anthropic/opus-5-5", "Claude")).toBe("Opus 5.5");
        expect(nomeDoModelo("openai/gpt-6.1-sol", "Codex")).toBe("GPT 6.1 Sol");
        expect(nomeDoModelo("claude-sonnet-5-5", "Claude")).toBe("Sonnet 5.5");
    });

    it("says who answers the first time, with the account when the process proved it", () => {
        expect(textoDaRota(null, claude("a@gmail.com"))).toBe(
            "Quem responde: Claude Opus 5.5, conta a@gmail.com.",
        );
        expect(textoDaRota(null, claude())).toBe("Quem responde: Claude Opus 5.5.");
    });

    it("says where the conversation went and where it came from", () => {
        expect(textoDaRota(claude("a@gmail.com"), codex)).toBe(
            "Quem responde agora: Codex GPT 6.1 Sol (antes: Claude Opus 5.5, conta a@gmail.com).",
        );
        expect(textoDaRota(claude("a@gmail.com"), claude("b@gmail.com"))).toBe(
            "Quem responde agora: Claude Opus 5.5, conta b@gmail.com (antes: Claude Opus 5.5, conta a@gmail.com).",
        );
    });

    it("does not announce a change when only the effort changed", () => {
        expect(
            textoDaRota({ ...claude("a@gmail.com"), effort: "low" }, claude("a@gmail.com")),
        ).toBe("Quem responde: Claude Opus 5.5, conta a@gmail.com.");
    });

    it("turns a configuration record into a service line Happy shows, with the archive's id", () => {
        const [line] = new HappyMessageMapper().mapHistory([
            {
                at: 1_792_453_692_305,
                role: "service",
                recordId: "d1898936-4fb5-417c-a1d3-ae5f8a8871f7",
                runId: "cqbkm2m86nl56egr9wjbb3oa",
                blocks: [
                    {
                        type: "configuration",
                        before: claude("a@gmail.com"),
                        after: codex,
                        beforeMessageId: null,
                    },
                ],
            } as never,
        ]);
        expect(line?.localId).toBe("rig:history:d1898936-4fb5-417c-a1d3-ae5f8a8871f7");
        expect(line?.content.ev).toEqual({
            t: "service",
            text: "Quem responde agora: Codex GPT 6.1 Sol (antes: Claude Opus 5.5, conta a@gmail.com).",
        });
    });
});
