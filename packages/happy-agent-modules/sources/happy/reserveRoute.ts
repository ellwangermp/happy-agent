import type { ProviderUsage } from "@slopus/happy-providers";

/**
 * Casa fork (18/10/2026): the plan with room answers, and Codex is the reserve when every Claude plan is spent.
 *
 * Who swaps the Claude login is only `ferramentas/contas.py` of the 2nd brain: it moves to the account with the most
 * room as soon as the active one passes 99.5% (its `TROCA`), and only to an account under 95% (its `DESTINO_MAX`). So
 * when the Claude reading here stays at 99.5% or more, no Claude account has room, and the message goes to Codex.
 * This module only reads; it never touches a login. A conversation moved to the reserve goes back to the Claude
 * selection it had at the first message after Claude has room again (the switch notice carries the history across).
 */
export const CLAUDE_FULL_PERCENT = 99.5;
export const RESERVE_ROOM_PERCENT = 95;
/** A percentage older than this says nothing about now: contas.py may have swapped the login since. */
export const FRESH_READING_MS = 10 * 60 * 1000;

export interface ReserveSelection {
    readonly effort: string;
    readonly modelId: string;
    readonly permissionMode: string;
    readonly providerId: string;
    readonly serviceTier?: string | null | undefined;
}

export interface ReserveModel {
    readonly id: string;
    readonly providerId: string;
    readonly defaultEffort: string;
}

export interface ReserveInput<S extends ReserveSelection> {
    readonly selection: S;
    readonly models: readonly ReserveModel[];
    readonly typeOf: (providerId: string) => string | null;
    readonly usage: (providerId: string) => ProviderUsage | null;
    /** The Claude selection this conversation had before the reserve took it, if it did. */
    readonly movedFrom?: S | undefined;
    readonly now?: number;
}

export interface ReserveRoute<S extends ReserveSelection> {
    readonly selection: S;
    /** What to remember for the way back; undefined clears it. */
    readonly movedFrom: S | undefined;
    readonly change: "to-reserve" | "back" | null;
}

function tightest(usage: ProviderUsage): number {
    return Math.max(usage.windows.fiveHour?.usedPercent ?? 0, usage.windows.weekly?.usedPercent ?? 0);
}

/** The vendor refuses now, or a fresh reading is at the line where contas.py would have swapped. */
export function claudeFull(usage: ProviderUsage | null, now: number = Date.now()): boolean {
    if (usage === null) return false;
    if (usage.exhausted) return true;
    return now - usage.capturedAt <= FRESH_READING_MS && tightest(usage) >= CLAUDE_FULL_PERCENT;
}

/** Unknown counts as room: a reserve nobody could read is still worth trying over a refusal. */
export function reserveHasRoom(usage: ProviderUsage | null): boolean {
    return usage === null || (!usage.exhausted && tightest(usage) < RESERVE_ROOM_PERCENT);
}

export function reserveRoute<S extends ReserveSelection>(input: ReserveInput<S>): ReserveRoute<S> {
    const { selection, models, typeOf, usage } = input;
    const now = input.now ?? Date.now();
    const moved = input.movedFrom;
    if (moved !== undefined) {
        if (selection.providerId !== moved.providerId && typeOf(selection.providerId) === "codex") {
            return claudeFull(usage(moved.providerId), now)
                ? { selection, movedFrom: moved, change: null }
                : { selection: moved, movedFrom: undefined, change: "back" };
        }
        // The person chose something else on purpose: forget the way back.
        if (selection.providerId !== moved.providerId) return { selection, movedFrom: undefined, change: null };
    }
    if (typeOf(selection.providerId) !== "claude" || !claudeFull(usage(selection.providerId), now)) {
        return { selection, movedFrom: undefined, change: null };
    }
    const reserve = models.find((model) => typeOf(model.providerId) === "codex" && reserveHasRoom(usage(model.providerId)));
    if (reserve === undefined) return { selection, movedFrom: undefined, change: null };
    // A Claude service tier means nothing to Codex: the reserve runs on its default.
    const { serviceTier: _tier, ...rest } = selection;
    return {
        selection: { ...rest, effort: reserve.defaultEffort, modelId: reserve.id, providerId: reserve.providerId } as S,
        movedFrom: selection,
        change: "to-reserve",
    };
}
