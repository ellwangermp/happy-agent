import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";

import { describeListenerOverflow, describeMemory } from "../../sources/casaAvisos.js";

describe("casa: the listener-overflow warning names its stream", () => {
    it("names the stream, the event, the count and the newest listener", () => {
        const stream = Object.assign(new EventEmitter(), { path: "C:/log/agente.log", fd: 7 });
        for (let i = 0; i < 11; i++) stream.on("drain", function waitForTheLog() {});
        const warning = Object.assign(new Error("Possible EventEmitter memory leak detected."), {
            name: "MaxListenersExceededWarning",
            emitter: stream,
            type: "drain",
            count: 11,
        });
        const line = describeListenerOverflow(warning)!;
        expect(line).toContain("path=C:/log/agente.log");
        expect(line).toContain("fd=7");
        expect(line).toContain("event=drain count=11");
        expect(line).toContain("waitForTheLog");
    });

    it("names the MCP server whose stdin stopped draining", () => {
        const stdin = Object.assign(new EventEmitter(), { casaMcpServer: "cerebro" });
        const warning = Object.assign(new Error("Possible EventEmitter memory leak detected."), {
            name: "MaxListenersExceededWarning",
            emitter: stdin,
            type: "drain",
            count: 257,
        });
        expect(describeListenerOverflow(warning)).toContain("mcp=cerebro event=drain count=257");
    });

    it("writes the memory line with the heap apart from the rest", () => {
        const mb = 1048576;
        const line = describeMemory(
            { rss: 1962 * mb, heapUsed: 700 * mb, heapTotal: 900 * mb, external: 40 * mb, arrayBuffers: 12 * mb },
            new Date("2026-10-23T03:00:00.000Z"),
        );
        expect(line).toBe(
            "[casa] memory 2026-10-23T03:00:00.000Z rss=1962MB heapUsed=700MB heapTotal=900MB external=40MB arrayBuffers=12MB",
        );
    });

    it("leaves every other warning alone", () => {
        expect(describeListenerOverflow(Object.assign(new Error("x"), { name: "DeprecationWarning" }))).toBeUndefined();
    });
});
