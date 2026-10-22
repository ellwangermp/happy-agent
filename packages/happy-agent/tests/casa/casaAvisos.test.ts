import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";

import { describeListenerOverflow } from "../../sources/casaAvisos.js";

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

    it("leaves every other warning alone", () => {
        expect(describeListenerOverflow(Object.assign(new Error("x"), { name: "DeprecationWarning" }))).toBeUndefined();
    });
});
