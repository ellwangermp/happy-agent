import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { CASA_MCP_STDIN_LISTENERS, casaRaiseMcpStdinCeiling } from "../../sources/mcp/casaDrain.js";

/** A stdio transport the way the MCP SDK holds it: the server process, with its stdin. */
function transport() {
    const stdin = new EventEmitter();
    return { stdin, transport: { _process: { stdin } } };
}

describe("casa: a burst of MCP sends is not a leak", () => {
    it("lets the SDK wait for drain on 20 messages at once without the warning", () => {
        const { stdin, transport: t } = transport();
        const warned = vi.fn();
        process.on("warning", warned);
        try {
            expect(casaRaiseMcpStdinCeiling(t)).toBe(true);
            // what StdioClientTransport.send does when write() returns false, 20 times in one tick
            for (let i = 0; i < 20; i++) stdin.once("drain", () => undefined);
            expect(stdin.listenerCount("drain")).toBe(20);
            expect(stdin.getMaxListeners()).toBe(CASA_MCP_STDIN_LISTENERS);
            stdin.emit("drain");
            expect(stdin.listenerCount("drain")).toBe(0);
        } finally {
            process.off("warning", warned);
        }
    });

    it("tags the server stdin with the server name for the overflow line", () => {
        const { stdin, transport: t } = transport();
        casaRaiseMcpStdinCeiling(t, "qg-whatsapp");
        expect((stdin as unknown as { casaMcpServer?: string }).casaMcpServer).toBe("qg-whatsapp");
    });

    it("still keeps a ceiling, and leaves other transports alone", () => {
        const { stdin, transport: t } = transport();
        casaRaiseMcpStdinCeiling(t);
        expect(stdin.getMaxListeners()).toBeGreaterThan(10);
        expect(stdin.getMaxListeners()).toBeLessThan(Infinity);
        expect(casaRaiseMcpStdinCeiling(t)).toBe(false);
        expect(casaRaiseMcpStdinCeiling({})).toBe(false);
        expect(casaRaiseMcpStdinCeiling({ _process: { stdin: null } })).toBe(false);
        expect(casaRaiseMcpStdinCeiling(null)).toBe(false);
    });
});
