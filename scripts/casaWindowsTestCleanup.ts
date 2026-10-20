// Casa fork (19/10/2026, the "faz direito" to idea 168 of the 2nd brain radar).
//
// On Windows a database a test has already closed can keep its file for a while, so the test's
// last step, deleting its temporary folder, fails with EBUSY after every assertion passed. That
// one class made 119 of the 275 module tests fail on this notebook, on v0.4.99 and v0.4.100 alike.
// Here a temporary folder that Windows still holds is left behind instead (the system cleans
// %TEMP%); any other failure, and any path outside the temporary folders, still fails the test.
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform === "win32") {
    const roots = [tmpdir(), fileURLToPath(new URL("../packages/.context", import.meta.url))].map(
        (root) => resolve(root).toLowerCase() + sep,
    );
    const temporary = (path: fs.PathLike) =>
        roots.some((root) => resolve(String(path)).toLowerCase().startsWith(root));
    const held = (error: unknown, path: fs.PathLike) =>
        (error as NodeJS.ErrnoException | undefined)?.code === "EBUSY" && temporary(path);
    const rm = fs.promises.rm;
    fs.promises.rm = async (path, options) => {
        try {
            await rm(path, options);
        } catch (error) {
            if (!held(error, path)) throw error;
        }
    };
    const rmSync = fs.rmSync;
    fs.rmSync = (path, options) => {
        try {
            rmSync(path, options);
        } catch (error) {
            if (!held(error, path)) throw error;
        }
    };
    syncBuiltinESMExports();
}
