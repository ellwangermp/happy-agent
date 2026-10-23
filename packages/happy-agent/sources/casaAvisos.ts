/**
 * Casa fork (21/10/2026, GOAL-HAPPY-ROBUSTO item 5 of the 2nd-brain).
 *
 * The daemon printed 68 "MaxListenersExceededWarning ... 11 drain listeners added to [WriteStream]" lines on
 * 21/10/2026 and never said which stream. Under Bun every file, standard stream and child stdin is a "WriteStream",
 * and NODE_OPTIONS=--trace-warnings is ignored by the compiled binary. So the listener-overflow warning gets one more
 * line: which stream (its file, descriptor or child), how many listeners, the newest listener's source and where it was
 * added. The next warning names the leak instead of the class.
 */

type Overflow = Error & { emitter?: unknown; type?: unknown; count?: unknown };

/** The line that names the stream behind a listener-overflow warning, or undefined for any other warning. */
export function describeListenerOverflow(warning: Error): string | undefined {
    if (warning.name !== "MaxListenersExceededWarning") return undefined;
    const overflow = warning as Overflow;
    const emitter = overflow.emitter as
        | (Record<string, unknown> & { listeners?: (type: string) => unknown[] })
        | undefined;
    const type = String(overflow.type ?? "");
    const where = [
        `class=${(emitter?.constructor as { name?: string } | undefined)?.name ?? "?"}`,
        emitter?.["path"] !== undefined ? `path=${String(emitter["path"])}` : "",
        emitter?.["fd"] !== undefined && emitter["fd"] !== null ? `fd=${String(emitter["fd"])}` : "",
        emitter?.["spawnfile"] !== undefined ? `child=${String(emitter["spawnfile"])}` : "",
        emitter?.["casaMcpServer"] !== undefined ? `mcp=${String(emitter["casaMcpServer"])}` : "",
        `event=${type}`,
        `count=${String(overflow.count ?? "?")}`,
    ].filter(Boolean);
    let newest = "";
    try {
        const all = typeof emitter?.listeners === "function" ? emitter.listeners(type) : [];
        newest = String(all.at(-1) ?? "").replace(/\s+/gu, " ").slice(0, 240);
    } catch {
        // The listener list is only a clue.
    }
    const stack = (warning.stack ?? "").split("\n").slice(1, 9).map((line) => line.trim()).join(" | ");
    return `[casa] listener overflow: ${where.join(" ")} newest=${JSON.stringify(newest)} at ${stack}`;
}

/** How often the daemon writes its memory line. */
export const CASA_MEMORY_EVERY_MS = 10 * 60_000;

/**
 * One line with the process memory, in MB. 22/10/2026: happy-agent.exe held 5.3 GB of committed memory with 1.9 GB in
 * RAM, in steps (1.0 GB at 10:27, 4.2 GB at 12:57, 5.4 GB at 21:07) and flat between them; from outside the process
 * nobody could tell the JavaScript heap from memory the allocator kept after a peak. The line tells them apart.
 */
export function describeMemory(usage: NodeJS.MemoryUsage, now: Date = new Date()): string {
    const mb = (bytes: number) => Math.round(bytes / 1048576);
    return (
        `[casa] memory ${now.toISOString()} rss=${mb(usage.rss)}MB heapUsed=${mb(usage.heapUsed)}MB ` +
        `heapTotal=${mb(usage.heapTotal)}MB external=${mb(usage.external)}MB arrayBuffers=${mb(usage.arrayBuffers)}MB`
    );
}

/** Writes the memory line to stderr every CASA_MEMORY_EVERY_MS; the timer never keeps a short command alive. */
export function installMemoryReport(every: number = CASA_MEMORY_EVERY_MS): ReturnType<typeof setInterval> {
    const timer = setInterval(() => {
        try {
            process.stderr.write(`${describeMemory(process.memoryUsage())}\n`);
        } catch {
            // The line is only a clue.
        }
    }, every);
    timer.unref?.();
    return timer;
}

/** Writes the naming line to stderr next to the default warning. */
export function installListenerOverflowReport(): void {
    process.on("warning", (warning) => {
        const line = describeListenerOverflow(warning);
        if (line !== undefined) process.stderr.write(`${line}\n`);
    });
}
