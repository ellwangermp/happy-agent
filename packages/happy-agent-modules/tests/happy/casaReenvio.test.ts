import { describe, expect, it } from "vitest";
import { ClaudeRefusals, RESEND_MAX_AGE_MS, RESEND_NOTE, withResendNote } from "../../sources/happy/casaReenvio.js";

const message = (text: string) => ({ content: [{ text, type: "text" as const }], role: "user" as const });
const refusal = (type: string) => ({ event: { type: "done", state: "error", kind: "unknown", message: "x", providerError: { type } } });

describe("the messages Claude refused mid-run for lack of plan", () => {
    it("hands back every message of the run, oldest first, once the run settles after a plan refusal", () => {
        const watch = new ClaudeRefusals<string>(() => 0);
        watch.sent("a", message("primeira"), "claude");
        watch.sent("a", message("segunda"), "claude");
        watch.providerEvent("a", refusal("rate_limit"));
        const again = watch.settled("a", { stopReason: "error" });
        expect(again.map((entry) => entry.content.content[0])).toEqual([
            { text: "primeira", type: "text" },
            { text: "segunda", type: "text" },
        ]);
        // Once: the next settlement has nothing left.
        expect(watch.settled("a", { stopReason: "error" })).toEqual([]);
    });

    it("counts a spent plan (out_of_tokens) the same way", () => {
        const watch = new ClaudeRefusals<string>(() => 0);
        watch.sent("a", message("oi"), "claude");
        watch.providerEvent("a", refusal("out_of_tokens"));
        expect(watch.settled("a", { stopReason: "error" })).toHaveLength(1);
    });

    it("sends nothing again after any other failure, or after a run that ended well", () => {
        const other = new ClaudeRefusals<string>(() => 0);
        other.sent("a", message("oi"), "claude");
        other.providerEvent("a", refusal("authentication"));
        expect(other.settled("a", { stopReason: "error" })).toEqual([]);

        const well = new ClaudeRefusals<string>(() => 0);
        well.sent("a", message("oi"), "claude");
        well.providerEvent("a", { event: { type: "done", state: "normal" } });
        expect(well.settled("a", { stopReason: "stop" })).toEqual([]);
        // A refusal in a later run does not bring back what the good run already answered.
        well.providerEvent("a", refusal("rate_limit"));
        expect(well.settled("a", { stopReason: "error" })).toEqual([]);
    });

    it("keeps each agent apart, and leaves out a message older than half an hour", () => {
        let now = 0;
        const watch = new ClaudeRefusals<string>(() => now);
        watch.sent("a", message("velha"), "claude");
        now = RESEND_MAX_AGE_MS + 1;
        watch.sent("a", message("nova"), "claude");
        watch.sent("b", message("do outro"), "claude");
        watch.providerEvent("a", refusal("rate_limit"));
        expect(watch.settled("a", { stopReason: "error" }).map((entry) => entry.content.content[0])).toEqual([
            { text: "nova", type: "text" },
        ]);
        expect(watch.settled("b", { stopReason: "error" })).toEqual([]);
    });

    it("puts the note on top of the message sent again, without touching the original", () => {
        const original = message("leia o arquivo");
        const again = withResendNote(original);
        expect(again.content[0]).toEqual({ text: RESEND_NOTE, type: "text" });
        expect(again.content[1]).toEqual({ text: "leia o arquivo", type: "text" });
        expect(original.content).toHaveLength(1);
    });
});
