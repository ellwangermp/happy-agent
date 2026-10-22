/**
 * Casa fork (22/10/2026, GOAL-HAPPY-ROBUSTO item 22 of the 2nd-brain; the owner authorized the API change: "O 20 e 22
 * te autorizo a fazer").
 *
 * The house conveyor (2nd-brain ferramentas/esteira.py) gives every card its own subtask under the bot's agent, titled
 * exactly "Cartão <id>". `POST /v0/agents` refuses a bot workspace ("A bot workspace already has its one permanent
 * agent"), so until now the esteira asked the bot's main conversation to call create_subtask: on 21/10/2026 the main
 * agents opened 120 card subtasks (Antony 56, Happy 30, Forest 27, Ebbi 7), each one a run of a conversation with
 * ~150k tokens of context that also cut whatever that conversation was doing, and 16 times the subtask did not open
 * within the esteira's 10 minutes.
 *
 * `POST /v0/agents/:agentId/casa-subtask` opens that same subtask directly, through the same `SubtasksModule.create`
 * the tool uses (same eligibility, depth, unreported card marker, opening task). It only opens an esteira card: any
 * other title is refused, so the route cannot become a general way around the bot's own coordination. The caller
 * chooses the subtask's ID, so a retried request returns the subtask it already opened instead of a second one.
 */
import { Type, type Static } from "@sinclair/typebox";
import type { Context } from "@steve.kite/stdlib";

import { ApiError } from "./ApiError.js";
import { SubtaskInputError, type SubtasksModule } from "../subtasks/index.js";
import { isEsteiraCard } from "../subtasks/casaCartao.js";

export const casaCardSubtaskBodySchema = Type.Object(
    {
        id: Type.String({ minLength: 2, maxLength: 32, pattern: "^[a-z][a-z0-9]*$" }),
        title: Type.String({ minLength: 1, maxLength: 256 }),
        text: Type.String({ minLength: 1, maxLength: 50_000 }),
        model: Type.String({ minLength: 1, maxLength: 256 }),
        effort: Type.Union([
            Type.Literal("off"),
            Type.Literal("minimal"),
            Type.Literal("low"),
            Type.Literal("medium"),
            Type.Literal("high"),
            Type.Literal("xhigh"),
            Type.Literal("max"),
        ]),
        provider: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
    },
    { additionalProperties: false },
);
export type CasaCardSubtaskBody = Static<typeof casaCardSubtaskBodySchema>;

/** Opens the esteira card's subtask under `parentAgentId`; returns the subtask's agent ID. */
export async function casaCardSubtask(
    ctx: Context,
    subtasks: SubtasksModule | undefined,
    parentAgentId: string,
    body: CasaCardSubtaskBody,
): Promise<{ readonly agentId: string }> {
    if (subtasks === undefined) {
        throw new ApiError(409, "conflict", "Subtasks are not available on this daemon.");
    }
    if (!isEsteiraCard(body.title)) {
        throw new ApiError(
            400,
            "invalid_request",
            'Only an esteira card subtask, titled exactly "Cartão <id>", opens through this route.',
        );
    }
    const { id, ...input } = body;
    try {
        const result = await subtasks.create(ctx, parentAgentId, input, id);
        return { agentId: result.agentId };
    } catch (error: unknown) {
        if (error instanceof SubtaskInputError) {
            throw new ApiError(409, "conflict", error.message);
        }
        throw error;
    }
}
