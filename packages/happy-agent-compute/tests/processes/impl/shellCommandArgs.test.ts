import { describe, expect, it } from "vitest";

import { POWERSHELL_UTF8_PREFIX, shellCommandArgs } from "../../../sources/processes/impl/shellCommandArgs.js";

describe("shellCommandArgs", () => {
    it("makes Windows PowerShell talk UTF-8 so accents survive the pipe", () => {
        const args = shellCommandArgs("C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe", "Get-Content a.md");
        expect(args.slice(0, 4)).toEqual(["-NoLogo", "-NoProfile", "-NonInteractive", "-Command"]);
        expect(args[4]).toBe(POWERSHELL_UTF8_PREFIX + "Get-Content a.md");
        expect(POWERSHELL_UTF8_PREFIX).toContain("[Console]::OutputEncoding=[Text.Encoding]::UTF8");
        expect(POWERSHELL_UTF8_PREFIX).toContain("'Get-Content:Encoding']='UTF8'");
    });

    it("leaves cmd and POSIX shells untouched", () => {
        expect(shellCommandArgs("cmd.exe", "dir")).toEqual(["/d", "/s", "/c", "dir"]);
        expect(shellCommandArgs("/bin/bash", "ls")).toEqual(["-lc", "ls"]);
    });
});
