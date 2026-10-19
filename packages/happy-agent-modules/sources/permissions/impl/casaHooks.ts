import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Casa fork (18/10/2026, item 7 of "turbinar o Happy": mods that react in the bots).
 *
 * The owner's Claude Code sessions run his PreToolUse hooks before every shell command — the git
 * guard among them, born of a commit that deleted about 24 GB on 01/10/2026. Bots run outside
 * Claude Code, so until now only the auto-mode reviewer, reading SECURITY.md, stood in the way, and
 * not at all in full access. This runs the very same hooks, read from the same settings file, with
 * the same input and the same answers, before a bot's shell command: one list of guards for every
 * agent on the machine, nothing to keep in step.
 */

/** One hook command, as Claude Code's settings declare it. */
export interface CasaHookCommand {
    readonly command: string;
    readonly timeoutMs: number;
}

/** The hooks that apply to the tool names one matcher accepts. */
export interface CasaHookGroup {
    readonly matcher: RegExp;
    readonly hooks: readonly CasaHookCommand[];
}

/** A bot's shell command, in the shape Claude Code hands its hooks. */
export interface CasaShellCall {
    readonly toolName: "Bash" | "PowerShell";
    readonly command: string;
    readonly cwd?: string;
}

/** What one hook process answered. `code` is null when it never finished. */
export interface CasaHookRun {
    readonly code: number | null;
    readonly stdout: string;
    readonly stderr: string;
}

export type CasaHookRunner = (command: string, input: string, timeoutMs: number) => Promise<CasaHookRun>;

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_OUTPUT = 64 * 1024;

/** The shell command in a call of any provider's shell tool, or nothing for every other tool. */
export function casaShellCall(toolName: string, args: unknown): CasaShellCall | undefined {
    if (args === null || typeof args !== "object") return undefined;
    const value = args as Record<string, unknown>;
    if ((toolName === "Bash" || toolName === "PowerShell") && typeof value.command === "string") {
        return { toolName, command: value.command };
    }
    if (toolName === "exec_command" && typeof value.cmd === "string") {
        return {
            toolName: "Bash",
            command: value.cmd,
            ...(typeof value.workdir === "string" ? { cwd: value.workdir } : {}),
        };
    }
    if (toolName === "run_terminal_command" && typeof value.command === "string") {
        return { toolName: "Bash", command: value.command };
    }
    return undefined;
}

/** The PreToolUse command hooks of a Claude Code settings file. Anything malformed is skipped. */
export function parseCasaHooks(settings: unknown): CasaHookGroup[] {
    const groups: CasaHookGroup[] = [];
    const preToolUse = (settings as { hooks?: { PreToolUse?: unknown } } | null)?.hooks?.PreToolUse;
    if (!Array.isArray(preToolUse)) return groups;
    for (const entry of preToolUse) {
        if (entry === null || typeof entry !== "object") continue;
        const { matcher, hooks } = entry as { matcher?: unknown; hooks?: unknown };
        if (!Array.isArray(hooks)) continue;
        let pattern: RegExp;
        try {
            // Claude Code: an empty or missing matcher, or "*", matches every tool.
            pattern =
                typeof matcher !== "string" || matcher === "" || matcher === "*"
                    ? /^/
                    : new RegExp(`^(?:${matcher})$`);
        } catch {
            continue;
        }
        const commands: CasaHookCommand[] = [];
        for (const hook of hooks) {
            const { type, command, timeout } = (hook ?? {}) as { type?: unknown; command?: unknown; timeout?: unknown };
            if (type !== "command" || typeof command !== "string" || command.trim() === "") continue;
            commands.push({
                command,
                timeoutMs: typeof timeout === "number" && timeout > 0 ? timeout * 1000 : DEFAULT_TIMEOUT_MS,
            });
        }
        if (commands.length > 0) groups.push({ matcher: pattern, hooks: commands });
    }
    return groups;
}

let cache: { path: string; mtimeMs: number; groups: CasaHookGroup[] } | undefined;

/**
 * The settings file whose hooks guard the bots: `HAPPY_CASA_HOOKS` when set (empty turns the guard
 * off), otherwise the owner's Claude Code settings. Under the test runner the default is off, so a
 * test's shell call never starts the machine's real hooks.
 */
export function casaHooksPath(env: NodeJS.ProcessEnv = process.env): string {
    if (env.HAPPY_CASA_HOOKS !== undefined) return env.HAPPY_CASA_HOOKS;
    return env.VITEST === undefined ? join(homedir(), ".claude", "settings.json") : "";
}

/** The owner's hooks, re-read only when the settings file changes. No file means no hooks. */
export async function loadCasaHooks(path: string = casaHooksPath()): Promise<CasaHookGroup[]> {
    if (path === "") return [];
    let mtimeMs: number;
    try {
        mtimeMs = (await stat(path)).mtimeMs;
    } catch {
        cache = undefined;
        return [];
    }
    if (cache !== undefined && cache.path === path && cache.mtimeMs === mtimeMs) return cache.groups;
    let groups: CasaHookGroup[] = [];
    try {
        groups = parseCasaHooks(JSON.parse(await readFile(path, "utf8")));
    } catch {
        groups = [];
    }
    cache = { path, mtimeMs, groups };
    return groups;
}

/** Runs one hook the way Claude Code does: the JSON on stdin, no window, killed at its timeout. */
export const runCasaHookCommand: CasaHookRunner = (command, input, timeoutMs) =>
    new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        let finished = false;
        const child = spawn(command, { shell: true, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
        const done = (code: number | null) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            resolve({ code, stdout, stderr });
        };
        const timer = setTimeout(() => {
            child.kill();
            done(null);
        }, timeoutMs);
        child.stdout?.on("data", (chunk: Buffer) => {
            if (stdout.length < MAX_OUTPUT) stdout += chunk.toString("utf8");
        });
        child.stderr?.on("data", (chunk: Buffer) => {
            if (stderr.length < MAX_OUTPUT) stderr += chunk.toString("utf8");
        });
        child.on("error", () => done(null));
        child.on("close", (code) => done(code));
        child.stdin?.on("error", () => undefined);
        child.stdin?.end(input);
    });

/**
 * Why the owner's hooks refuse this call, or nothing when they let it run. Like Claude Code, a hook
 * blocks by exiting 2 (its stderr is the reason) or by answering `permissionDecision: "deny"`; a hook
 * that fails, times out or says anything else does not block.
 */
export async function casaHookRefusal(
    groups: readonly CasaHookGroup[],
    call: CasaShellCall,
    agentId: string,
    run: CasaHookRunner = runCasaHookCommand,
): Promise<string | undefined> {
    const input = JSON.stringify({
        session_id: agentId,
        hook_event_name: "PreToolUse",
        tool_name: call.toolName,
        tool_input: { command: call.command },
        ...(call.cwd === undefined ? {} : { cwd: call.cwd }),
    });
    for (const group of groups) {
        if (!group.matcher.test(call.toolName)) continue;
        for (const hook of group.hooks) {
            const answer = await run(hook.command, input, hook.timeoutMs);
            if (answer.code === 2) return answer.stderr.trim() || "A guard hook blocked this command.";
            if (answer.code !== 0) continue;
            const reason = denyReason(answer.stdout);
            if (reason !== undefined) return reason;
        }
    }
    return undefined;
}

function denyReason(stdout: string): string | undefined {
    const text = stdout.trim();
    if (!text.startsWith("{")) return undefined;
    try {
        const output = (JSON.parse(text) as { hookSpecificOutput?: Record<string, unknown> }).hookSpecificOutput;
        if (output?.permissionDecision !== "deny") return undefined;
        return typeof output.permissionDecisionReason === "string" && output.permissionDecisionReason.trim() !== ""
            ? output.permissionDecisionReason
            : "A guard hook blocked this command.";
    } catch {
        return undefined;
    }
}
