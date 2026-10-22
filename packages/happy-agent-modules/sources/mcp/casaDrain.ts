/**
 * Casa fork (22/10/2026, GOAL-HAPPY-ROBUSTO item 5 of the 2nd-brain).
 *
 * From 17/10 to 22/10/2026 the agent printed 72 "MaxListenersExceededWarning ... 11 drain listeners added to
 * [WriteStream]". The casa diagnostic line (78f274e6) named the place: the MCP SDK's StdioClientTransport.send, called
 * from Protocol.request's cancellation path, waits for "drain" on the server process's stdin whenever write() returns
 * false. Proved with bun 1.4.2 on Windows: a child's piped stdin returns false on every write after the first, even for
 * 140 bytes, while the child reads normally, and every listener is gone once the pipe drains. So a burst of 11 messages
 * in one tick (the cancellations sent when a run with many MCP calls is aborted) trips Node's default ceiling of 10
 * without anything leaking.
 *
 * The ceiling on an MCP server's stdin is raised to CASA_MCP_STDIN_LISTENERS: a burst is normal there, and a real
 * leak (a server that stopped reading for good) still warns once it passes that many waiting messages.
 */
export const CASA_MCP_STDIN_LISTENERS = 256;

type ListenerCeiling = { setMaxListeners(n: number): unknown; getMaxListeners(): number };

/** Raises the drain-listener ceiling on a stdio MCP transport's server stdin; any other transport is left alone. */
export function casaRaiseMcpStdinCeiling(transport: unknown): boolean {
    const stdin = (transport as { _process?: { stdin?: Partial<ListenerCeiling> | null } } | null)
        ?._process?.stdin;
    if (typeof stdin?.setMaxListeners !== "function" || typeof stdin.getMaxListeners !== "function")
        return false;
    if (stdin.getMaxListeners() >= CASA_MCP_STDIN_LISTENERS) return false;
    stdin.setMaxListeners(CASA_MCP_STDIN_LISTENERS);
    return true;
}
