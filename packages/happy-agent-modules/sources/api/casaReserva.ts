/**
 * Casa fork (21/10/2026, the owner: "claude 1o acabou o claude manda pro codex.... voltou claude sai do codex e volta
 * pro claude").
 *
 * The 2nd brain's esteira sends a card's work to Codex while every Claude plan is spent, and to Claude again once one
 * has room (ferramentas/dono_happy.py, rota_agora). That move is the house's, not the person's: it must not become the
 * conversation's last mode, which the phone's composer offers for the next message and which the Codex reserve
 * (happy/reserveRoute.ts) would then read as the person choosing Codex on purpose, never bringing it back. The esteira
 * marks such a message with clientMetadata {"casa": {"reserva": true}}; the message still runs on the mode it carries.
 */
export const CASA_RESERVE_KEY = "casa";

/** True when the house moved this message between Claude and Codex on its own. */
export function casaAutomaticReserve(clientMetadata: unknown): boolean {
    if (typeof clientMetadata !== "object" || clientMetadata === null) return false;
    const casa = (clientMetadata as Record<string, unknown>)[CASA_RESERVE_KEY];
    if (typeof casa !== "object" || casa === null || Array.isArray(casa)) return false;
    return (casa as Record<string, unknown>)["reserva"] === true;
}
