/**
 * Casa fork (21/10/2026, GOAL-HAPPY-ROBUSTO item 3 of the 2nd-brain).
 *
 * The house conveyor (the esteira, 2nd-brain ferramentas/esteira.py) asks a bot's own agent to open one subtask per
 * card, titled exactly "Cartão <id>". The card's work is followed by the esteira itself: the subtask tells the owner
 * through the card's commands (demandas.py), and the esteira reads the subtask's status. The automatic report to the
 * creator was a second channel nobody needed. Measured on 21/10/2026: 428 "Collaborator ... finished working" reports
 * woke the bots' main conversations (about 150k tokens of context each), which then nudged the subtasks again; the
 * runs started by agent-to-agent messages read 338 million input tokens, 28% of the day.
 *
 * So a card subtask is created unreported, and carries a marker the identity prompt reads to tell it how to talk.
 */

const CARD_TITLE = /^Cartão [A-Za-z0-9_-]{3,64}$/u;

/** The metadata marker of a card subtask. */
export const CASA_CARD_METADATA = { casa: { cartao: true } } as const;

/** Whether a subtask title is one of the esteira's cards. */
export function isEsteiraCard(title: string): boolean {
    return CARD_TITLE.test(title.trim());
}
