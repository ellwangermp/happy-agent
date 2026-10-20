import type { SessionUserMessage } from "@slopus/happy-providers";

/**
 * Casa fork (20/10/2026, the owner: "faz 3").
 *
 * The Codex reserve (reserveRoute.ts) moves a conversation before a message runs. When Claude refuses in the middle
 * of a run instead (the plan ran out while it worked), the run failed with "The last turn failed: ..." and the
 * message was lost: only the next one moved to Codex. This keeps the phone's messages that went to Claude since the
 * run last settled well, notices a refusal for lack of plan, and hands them back once the run settles, to be sent
 * again on the reserve.
 */

/** The provider errors that mean the plan ran out, not that the work went wrong. */
const PLAN_REFUSALS: ReadonlySet<string> = new Set(["rate_limit", "out_of_tokens"]);

/** A message older than this is not sent again: the person has moved on. */
export const RESEND_MAX_AGE_MS = 30 * 60 * 1000;

export interface ClaudeSent<Selection> {
    readonly content: SessionUserMessage;
    readonly selection: Selection;
    readonly at: number;
}

interface Watch<Selection> {
    refused: boolean;
    readonly sent: ClaudeSent<Selection>[];
}

export class ClaudeRefusals<Selection> {
    readonly #agents = new Map<string, Watch<Selection>>();
    readonly #now: () => number;

    constructor(now: () => number = Date.now) {
        this.#now = now;
    }

    /** A phone message went to the agent on Claude. */
    sent(agentId: string, content: SessionUserMessage, selection: Selection): void {
        const watch = this.#agents.get(agentId) ?? { refused: false, sent: [] };
        watch.sent.push({ content: structuredClone(content), selection, at: this.#now() });
        this.#agents.set(agentId, watch);
    }

    /** A provider event of the agent's run: a `done` with a plan refusal marks the run. */
    providerEvent(agentId: string, payload: unknown): void {
        const watch = this.#agents.get(agentId);
        if (watch === undefined) return;
        const done = (payload as { event?: { type?: unknown; state?: unknown; providerError?: { type?: unknown } } })
            ?.event;
        if (done?.type !== "done" || done.state !== "error") return;
        if (typeof done.providerError?.type === "string" && PLAN_REFUSALS.has(done.providerError.type)) {
            watch.refused = true;
        }
    }

    /**
     * The run settled. After a plan refusal, the messages to send again, oldest first (each once); after any other
     * end, nothing, and the watch starts over.
     */
    settled(agentId: string, payload: unknown): ClaudeSent<Selection>[] {
        const watch = this.#agents.get(agentId);
        if (watch === undefined) return [];
        const stopReason = (payload as { stopReason?: unknown } | undefined)?.stopReason;
        if (!watch.refused || stopReason !== "error") {
            this.#agents.delete(agentId);
            return [];
        }
        this.#agents.delete(agentId);
        const now = this.#now();
        return watch.sent.filter((entry) => now - entry.at <= RESEND_MAX_AGE_MS);
    }
}

/** The line put above a message sent again, so the person sees why it shows twice. */
export const RESEND_NOTE =
    "(Mensagem reenviada: o plano do Claude acabou no meio da resposta, então ela foi para a reserva.)";

/** The same message with the note on top. */
export function withResendNote(content: SessionUserMessage): SessionUserMessage {
    return { ...content, content: [{ text: RESEND_NOTE, type: "text" }, ...structuredClone(content.content)] };
}
