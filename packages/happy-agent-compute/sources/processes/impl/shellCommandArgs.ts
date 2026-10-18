import { basename } from "node:path";

/**
 * Casa (17/10/2026): Windows PowerShell writes to a pipe in the old console code page and reads text files as ANSI,
 * so every accent in the agent's output came back broken ("é" as "Ǹ" or "�"). The prefix makes the pipe UTF-8 and
 * makes Get-Content and Select-String read UTF-8. It does not change how files are written (in Windows PowerShell 5.1,
 * -Encoding UTF8 on writes adds a BOM). Without a console, setting the console encoding throws, hence the try.
 */
export const POWERSHELL_UTF8_PREFIX =
    "try{[Console]::OutputEncoding=[Text.Encoding]::UTF8}catch{};$OutputEncoding=[Text.Encoding]::UTF8;" +
    "$PSDefaultParameterValues['Get-Content:Encoding']='UTF8';$PSDefaultParameterValues['Select-String:Encoding']='UTF8'\n";

/** Shell syntax is selected from the executable; arguments remain an argv vector. */
export function shellCommandArgs(shell: string, command: string): string[] {
    const name = basename(shell).toLowerCase();
    if (name === "cmd.exe" || name === "cmd") return ["/d", "/s", "/c", command];
    if (["powershell.exe", "powershell", "pwsh.exe", "pwsh"].includes(name))
        return ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", POWERSHELL_UTF8_PREFIX + command];
    return ["-lc", command];
}
