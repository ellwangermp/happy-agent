import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Casa fork (19/10/2026, idea 168 of the 2nd brain radar; then his "faz direito esse negocio").
 *
 * Which Claude account a reply ran with. Upstream leaves it unknown, and Claude Code's own answer
 * (the SDK's accountInfo) is not proof here: the house signs Claude Code in with long-lived tokens
 * (2nd-brain `ferramentas/contas.py`, which swaps the account of this machine), and accountInfo then
 * repeats the e-mail of an older browser sign-in (19/10/2026 21:5x: it said estevao.nyrapericias@,
 * while the token in place was administrativo@nyrapericias.com's).
 *
 * The proof contas.py itself uses is the token: the one in the login file equals the token of one
 * account. contas.py writes, for every account it knows, only the SHA-256 of its token and the
 * e-mail (`C:/2nd-Brain/contas/impressoes.json`); this reads the login file when a reply starts,
 * hashes its token and looks it up. A live Claude Code process reads that file again before each
 * turn (tested 19/10/2026: a token broken between two turns refused the second one), so the file
 * at the start of the reply is the login the reply uses. Not found, or any doubt: unknown.
 */

export const DEFAULT_IMPRESSOES = "C:/2nd-Brain/contas/impressoes.json";

export interface CasaContaClaudeOptions {
    /** The Claude Code config folder of the credential; default `~/.claude`. */
    readonly configDir?: string | undefined;
    /** The house map; `HAPPY_CASA_IMPRESSOES` (empty turns it off), else the default. */
    readonly impressoes?: string | undefined;
    readonly env?: NodeJS.ProcessEnv;
}

/** The map's path, or null when it is off. Off under the test runner unless asked. */
export function casaImpressoesPath(env: NodeJS.ProcessEnv = process.env): string | null {
    const configured = env.HAPPY_CASA_IMPRESSOES;
    if (configured !== undefined) return configured.trim() === "" ? null : configured.trim();
    if (env.VITEST !== undefined) return null;
    return DEFAULT_IMPRESSOES;
}

/** The e-mail of the account whose token is in the login file now, or undefined. */
export function casaContaClaude(options: CasaContaClaudeOptions = {}): string | undefined {
    const mapa = options.impressoes ?? casaImpressoesPath(options.env);
    if (mapa === null) return undefined;
    try {
        const pasta = options.configDir?.trim() || join(homedir(), ".claude");
        const login = JSON.parse(readFileSync(join(pasta, ".credentials.json"), "utf8")) as {
            claudeAiOauth?: { accessToken?: unknown };
        };
        const token = login.claudeAiOauth?.accessToken;
        if (typeof token !== "string" || token.length === 0) return undefined;
        const impressao = createHash("sha256").update(token, "utf8").digest("hex");
        const lido = JSON.parse(readFileSync(mapa, "utf8")) as {
            impressoes?: Record<string, unknown>;
        };
        const email = lido.impressoes?.[impressao];
        return typeof email === "string" && email.includes("@") ? email.trim() : undefined;
    } catch {
        return undefined;
    }
}
