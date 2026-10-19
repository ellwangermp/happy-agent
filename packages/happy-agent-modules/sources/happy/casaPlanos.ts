import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import type { ProviderUsage, ProviderUsageWindow } from "@slopus/happy-providers";

/**
 * Casa fork (19/10/2026, DECISOES.md of the 2nd brain: "faz 1 e confere oq vc nao sabe").
 *
 * The Codex reserve (reserveRoute.ts) decided on Happy Agent's own Claude usage poll, and Anthropic refused that poll
 * with 429 (3 times on 17/10, 5 on 18/10, 17 by 11:04 on 19/10; a refusal asks for up to an hour of silence). A
 * reading older than ten minutes says nothing, so the reserve went blind exactly when it mattered. The house already
 * reads all five plans every 15 minutes without being refused (2nd-brain `ferramentas/contas.py painel`, the panel
 * behind the "2/5 livres" chip), and knows which login this machine uses; the reserve reads that panel now.
 */

/** One plan as the house panel shows it (`contas.py painel`, the `cartao` of each account). */
export interface CasaCartao {
    readonly conta: string;
    readonly tipo: string;
    readonly situacao: string;
    readonly lida_em?: string | null;
    readonly cinco_horas?: number | null;
    readonly volta_5h?: string | null;
    readonly semana?: number | null;
    readonly volta_semana?: string | null;
    readonly bloqueada_ate?: string | null;
}

export interface CasaPainel {
    readonly lida_em?: string;
    readonly contas?: readonly CasaCartao[];
    readonly em_uso_aqui?: { readonly conta?: string | null } | null;
    readonly erro?: string;
}

/** The Formiga reads every 15 minutes; a plan's reading older than twice that is not counted. */
export const CASA_CARD_MAX_AGE_MS = 30 * 60 * 1000;
/** How often the panel is asked again. One reading takes about 3.4 s and asks the Formiga. */
export const CASA_REFRESH_MS = 5 * 60 * 1000;
/** A refusal Claude itself sent during a conversation outranks the panel for this long. */
export const IN_BAND_REFUSAL_MS = 5 * 60 * 1000;
const RUN_TIMEOUT_MS = 90_000;
const DEFAULT_SCRIPT = "C:/VS_Projects/2nd-brain/ferramentas/contas.py";
/** The rehearsal file: a made-up panel for named agents only, until its own deadline. */
export const DEFAULT_REHEARSAL = "C:/2nd-Brain/happy-agent-teste/painel-ensaio.json";

/**
 * The command that prints the house panel: `HAPPY_CASA_CONTAS_CMD` (a JSON array; empty turns it off), otherwise
 * `contas.py painel` when the 2nd brain is on this machine. Off under the test runner unless asked.
 */
export function casaContasCommand(env: NodeJS.ProcessEnv = process.env): string[] | null {
    const configured = env.HAPPY_CASA_CONTAS_CMD;
    if (configured !== undefined) {
        if (configured.trim() === "") return null;
        const cmd: unknown = JSON.parse(configured);
        return Array.isArray(cmd) && cmd.length > 0 ? cmd.map(String) : null;
    }
    if (env.VITEST !== undefined) return null;
    return existsSync(DEFAULT_SCRIPT) ? ["python", "-X", "utf8", DEFAULT_SCRIPT, "painel"] : null;
}

export type CasaRunner = (cmd: readonly string[]) => Promise<unknown>;

/** Runs the panel command with no window, and reads its JSON. */
export const runCasaContas: CasaRunner = (cmd) =>
    new Promise((resolve, reject) => {
        const child = spawn(cmd[0]!, cmd.slice(1), { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
        let out = "";
        let err = "";
        const timer = setTimeout(() => {
            child.kill();
            reject(new Error(`the house panel did not answer in ${RUN_TIMEOUT_MS} ms`));
        }, RUN_TIMEOUT_MS);
        child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString("utf8")));
        child.stderr.on("data", (chunk: Buffer) => (err += chunk.toString("utf8")));
        child.on("error", (error) => {
            clearTimeout(timer);
            reject(error);
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            if (code !== 0) {
                reject(new Error(`the house panel exited ${code}: ${err.trim().slice(-300)}`));
                return;
            }
            try {
                resolve(JSON.parse(out));
            } catch {
                reject(new Error(`the house panel did not print JSON: ${out.trim().slice(0, 200)}`));
            }
        });
    });

function instant(value: string | null | undefined): number | undefined {
    if (value === null || value === undefined) return undefined;
    const at = Date.parse(value);
    return Number.isNaN(at) ? undefined : at;
}

function windowOf(percent: number | null | undefined, resetsAt: string | null | undefined, now: number): ProviderUsageWindow | null {
    if (typeof percent !== "number") return null;
    const reset = instant(resetsAt);
    // A window whose reset has passed since the reading starts over.
    return { usedPercent: reset !== undefined && reset <= now ? 0 : percent, resetsAt: reset ?? null, startsAt: null, durationMs: null };
}

/**
 * The plan a vendor's conversations run on now, as a usage reading: for Claude the login this machine uses (only
 * `contas.py` swaps it), for Codex its one plan. Nothing when the panel does not know, or its reading is old.
 */
export function casaUsage(
    painel: CasaPainel | null | undefined,
    vendor: "claude" | "codex",
    providerId: string,
    now: number = Date.now(),
): ProviderUsage | null {
    const cards = (painel?.contas ?? []).filter((card) => card.tipo === vendor && card.situacao !== "sem leitura");
    const here = painel?.em_uso_aqui?.conta?.toLowerCase();
    const card = vendor === "claude" ? cards.find((c) => c.conta.toLowerCase() === here) : cards[0];
    if (card === undefined) return null;
    const read = instant(card.lida_em);
    if (read === undefined || now - read > CASA_CARD_MAX_AGE_MS) return null;
    const blockedUntil = instant(card.bloqueada_ate);
    return {
        providerId,
        vendor,
        // When the house asked, not when the Formiga measured: the plan in use and its age were both checked then.
        capturedAt: instant(painel?.lida_em) ?? now,
        planName: null,
        exhausted: card.situacao === "bloqueada" && !(blockedUntil !== undefined && blockedUntil <= now),
        windows: {
            fiveHour: windowOf(card.cinco_horas, card.volta_5h, now),
            weekly: windowOf(card.semana, card.volta_semana, now),
            monthly: null,
        },
        credits: null,
    };
}

/**
 * The reading the reserve decides on. A refusal Claude sent in a conversation minutes ago is the truth about the
 * login in use; otherwise the house panel; Happy Agent's own reading only when the panel says nothing. Before
 * 19/10/2026 an old in-band refusal kept every conversation on Codex: once they all moved, no Claude conversation
 * ran to report that the plan had room again, and the poll that would have was refused.
 */
export function chooseUsage(own: ProviderUsage | null, casa: ProviderUsage | null, now: number = Date.now()): ProviderUsage | null {
    if (own?.exhausted === true && now - own.capturedAt <= IN_BAND_REFUSAL_MS) return own;
    return casa ?? own;
}

interface Rehearsal {
    readonly agentes: readonly string[];
    readonly ate: string;
    readonly painel: CasaPainel;
}

/** The house panel, kept fresh in the background; reading it never waits. */
export class CasaPlanos {
    readonly #cmd: readonly string[] | null;
    readonly #run: CasaRunner;
    readonly #rehearsal: string;
    readonly #now: () => number;
    #painel: CasaPainel | null = null;
    #askedAt = 0;
    #asking: Promise<void> | null = null;
    #error: string | null = null;

    constructor(
        options: {
            cmd?: readonly string[] | null;
            run?: CasaRunner;
            rehearsal?: string;
            now?: () => number;
        } = {},
    ) {
        this.#cmd = options.cmd === undefined ? casaContasCommand() : options.cmd;
        this.#run = options.run ?? runCasaContas;
        this.#rehearsal = options.rehearsal ?? (process.env.VITEST === undefined ? DEFAULT_REHEARSAL : "");
        this.#now = options.now ?? Date.now;
    }

    /** Why the last reading failed, if it did. */
    get error(): string | null {
        return this.#error;
    }

    /** Asks the panel again now; concurrent asks share one run. */
    async refresh(): Promise<void> {
        if (this.#cmd === null) return;
        this.#askedAt = this.#now();
        this.#asking ??= this.#run(this.#cmd)
            .then((value) => {
                this.#painel = value as CasaPainel;
                this.#error = null;
            })
            .catch((error: unknown) => {
                this.#error = error instanceof Error ? error.message : String(error);
            })
            .finally(() => {
                this.#asking = null;
            });
        await this.#asking;
    }

    /** The plan in use for this vendor, from the last panel; a stale panel is asked again behind the answer. */
    usage(vendor: "claude" | "codex", providerId: string, agentId?: string): ProviderUsage | null {
        const now = this.#now();
        const rehearsal = agentId === undefined ? undefined : this.#rehearsalFor(agentId, now);
        if (rehearsal !== undefined) return casaUsage(rehearsal, vendor, providerId, now);
        if (this.#cmd !== null && this.#asking === null && now - this.#askedAt >= CASA_REFRESH_MS) {
            void this.refresh();
        }
        return casaUsage(this.#painel, vendor, providerId, now);
    }

    /**
     * The made-up panel of a rehearsal naming this agent, while it lasts. It lets the reserve be proven live on a
     * test bot without restarting the daemon the owner's bots run on, and without touching any real plan.
     */
    #rehearsalFor(agentId: string, now: number): CasaPainel | undefined {
        if (this.#rehearsal === "" || !existsSync(this.#rehearsal)) return undefined;
        try {
            const file = JSON.parse(readFileSync(this.#rehearsal, "utf8")) as Rehearsal;
            const until = instant(file.ate);
            if (until === undefined || now > until || !file.agentes.includes(agentId)) return undefined;
            return file.painel;
        } catch {
            return undefined;
        }
    }
}
