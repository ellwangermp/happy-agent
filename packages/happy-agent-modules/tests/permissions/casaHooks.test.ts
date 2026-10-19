import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    casaHookRefusal,
    casaHooksPath,
    casaShellCall,
    loadCasaHooks,
    parseCasaHooks,
    runCasaHookCommand,
    type CasaHookRunner,
} from "../../sources/permissions/impl/casaHooks.js";

const SETTINGS = {
    hooks: {
        PreToolUse: [
            { matcher: "Bash|PowerShell", hooks: [{ type: "command", command: "guard", timeout: 15 }] },
            { matcher: "Write", hooks: [{ type: "command", command: "other" }] },
            { matcher: "Bash", hooks: [{ type: "prompt", prompt: "not a command" }] },
        ],
        Stop: [{ hooks: [{ type: "command", command: "stop" }] }],
    },
};

describe("casaHooks: the owner's Claude Code guards, before a bot's shell command", () => {
    it("reads every provider's shell tool and nothing else", () => {
        expect(casaShellCall("Bash", { command: "git status" })).toEqual({ toolName: "Bash", command: "git status" });
        expect(casaShellCall("PowerShell", { command: "ls" })).toEqual({ toolName: "PowerShell", command: "ls" });
        expect(casaShellCall("exec_command", { cmd: "git commit -m x", workdir: "C:\\VS_Projects\\happy" })).toEqual({
            toolName: "Bash",
            command: "git commit -m x",
            cwd: "C:\\VS_Projects\\happy",
        });
        expect(casaShellCall("run_terminal_command", { command: "pwd" })).toEqual({ toolName: "Bash", command: "pwd" });
        expect(casaShellCall("Read", { file_path: "a" })).toBeUndefined();
        expect(casaShellCall("Bash", null)).toBeUndefined();
    });

    it("takes the PreToolUse command hooks as Claude Code's settings declare them", () => {
        const groups = parseCasaHooks(SETTINGS);
        expect(groups).toHaveLength(2);
        expect(groups[0]!.matcher.test("Bash")).toBe(true);
        expect(groups[0]!.matcher.test("BashOutput")).toBe(false);
        expect(groups[0]!.hooks).toEqual([{ command: "guard", timeoutMs: 15_000 }]);
        expect(groups[1]!.hooks[0]!.timeoutMs).toBe(60_000);
        expect(parseCasaHooks(null)).toEqual([]);
        expect(parseCasaHooks({ hooks: { PreToolUse: [{ matcher: "(", hooks: [] }] } })).toEqual([]);
    });

    it("refuses on exit 2 or a deny answer, and lets everything else run", async () => {
        const groups = parseCasaHooks(SETTINGS);
        const seen: string[] = [];
        const answers: Record<string, Awaited<ReturnType<CasaHookRunner>>> = {
            "git commit -m x": { code: 2, stdout: "", stderr: "Use commit_seguro.py\n" },
            "git add -A": {
                code: 0,
                stdout: JSON.stringify({
                    hookSpecificOutput: { permissionDecision: "deny", permissionDecisionReason: "Mixes other sessions." },
                }),
                stderr: "",
            },
            "git status": { code: 0, stdout: "", stderr: "" },
            "broken hook": { code: 1, stdout: "", stderr: "Traceback" },
            "slow hook": { code: null, stdout: "", stderr: "" },
        };
        const run: CasaHookRunner = async (command, input) => {
            seen.push(command);
            const call = JSON.parse(input) as { tool_input: { command: string }; tool_name: string; cwd?: string };
            expect(call.tool_name).toBe("Bash");
            return answers[call.tool_input.command]!;
        };
        const at = (command: string) => casaHookRefusal(groups, { toolName: "Bash", command, cwd: "C:\\x" }, "a1", run);
        expect(await at("git commit -m x")).toBe("Use commit_seguro.py");
        expect(await at("git add -A")).toBe("Mixes other sessions.");
        expect(await at("git status")).toBeUndefined();
        expect(await at("broken hook")).toBeUndefined();
        expect(await at("slow hook")).toBeUndefined();
        // Only the hooks whose matcher takes the tool ran: never the Write one.
        expect(seen.every((command) => command === "guard")).toBe(true);
    });

    it("runs a real hook process with the call on stdin and reads its refusal", async () => {
        const folder = await mkdtemp(join(tmpdir(), "casa-hook-"));
        const script = join(folder, "guard.cjs");
        await writeFile(
            script,
            `let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const c=JSON.parse(s);` +
                `if(/git commit/.test(c.tool_input.command)){process.stderr.write("blocked: "+c.cwd);process.exit(2)}process.exit(0)})`,
        );
        const settings = join(folder, "settings.json");
        await writeFile(
            settings,
            JSON.stringify({
                hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: `node "${script}"` }] }] },
            }),
        );
        const groups = await loadCasaHooks(settings);
        expect(await casaHookRefusal(groups, { toolName: "Bash", command: "git commit -m x", cwd: "C:\\repo" }, "a1"))
            .toBe("blocked: C:\\repo");
        expect(await casaHookRefusal(groups, { toolName: "Bash", command: "git status" }, "a1")).toBeUndefined();
        expect((await runCasaHookCommand(`node -e "setTimeout(()=>{},5000)"`, "", 200)).code).toBeNull();
    });

    it("is off under the test runner unless asked, and follows HAPPY_CASA_HOOKS", async () => {
        expect(casaHooksPath({ VITEST: "true" })).toBe("");
        expect(casaHooksPath({ VITEST: "true", HAPPY_CASA_HOOKS: "C:\\s.json" })).toBe("C:\\s.json");
        expect(casaHooksPath({ HAPPY_CASA_HOOKS: "" })).toBe("");
        expect(casaHooksPath({})).toMatch(/[\\/]\.claude[\\/]settings\.json$/);
        expect(await loadCasaHooks("")).toEqual([]);
        expect(await loadCasaHooks(join(tmpdir(), "no-such-settings.json"))).toEqual([]);
    });
});
