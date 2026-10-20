// Casa fork (20/10/2026, "esses que falham, acho que tem que arrumar né?").
//
// Upstream runs this package's tests on Linux only, so the tests take five Linux habits for granted
// that the Windows notebook of the house does not have. Each one is given back here, for tests only:
// - the home folder follows HOME (Windows reads USERPROFILE, so a test's stubbed HOME was ignored);
// - Git keeps the bytes a test committed (Git for Windows turns LF into CRLF on checkout by default);
// - a folder link can be made without being an administrator: when Windows refuses the symbolic
//   link, the same folder link is made as a junction, which Node also reports as a symbolic link.
//   A link to a file still needs an administrator (tests/support/casaWindowsSkips.ts);
// - a busy notebook is slower than a Linux runner: on Windows a wait (vi.waitFor, expect.poll) with
//   no time limit of its own gets 10 s instead of Vitest's 1 s, and one that names its limit gets
//   three times it (at least 10 s). No test here waits for a wait to run out;
// - the database runs on the native piece that ships: upstream's libsql patch needs its own native
//   build (rowsClose, statementFinalize), which npm's Windows piece lacks, so a closed database kept
//   its file. The house's .exe carries the official piece (casa/montar.py puts it in
//   packages/happy-agent/native/target/win32-x64), and the tests load that same file.
// And one habit of a newer Node: upstream's runner takes the latest Node 24, where destroying one end
// of a stream.duplexPair ends the other (Node 24.16.0, nodejs/node#61098). On an older Node the
// other end never heard it, and the USB bridge test waited forever; there that behavior is given
// back, the way Node 24.16.0 does it.
import fs from "node:fs";
import Module, { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import { dirname, resolve, win32 } from "node:path";
import stream, { type Duplex } from "node:stream";
import { fileURLToPath } from "node:url";
import { expect, vi } from "vitest";

if (process.platform === "win32") {
    const homedir = os.homedir;
    os.homedir = () => {
        const home = process.env.HOME;
        return home !== undefined && win32.isAbsolute(home) && /^[a-z]:/i.test(home)
            ? home
            : homedir();
    };

    const count = Number(process.env.GIT_CONFIG_COUNT ?? "0") || 0;
    process.env[`GIT_CONFIG_KEY_${count}`] = "core.autocrlf";
    process.env[`GIT_CONFIG_VALUE_${count}`] = "false";
    process.env.GIT_CONFIG_COUNT = String(count + 1);

    const asJunction = (error: unknown, target: fs.PathLike, path: fs.PathLike) => {
        if ((error as NodeJS.ErrnoException | undefined)?.code !== "EPERM") return false;
        const absolute = resolve(dirname(String(path)), String(target));
        try {
            return fs.statSync(absolute).isDirectory();
        } catch {
            return true;
        }
    };
    const symlinkSync = fs.symlinkSync;
    fs.symlinkSync = (target, path, type) => {
        try {
            symlinkSync(target, path, type);
        } catch (error) {
            if (!asJunction(error, target, path)) throw error;
            symlinkSync(resolve(dirname(String(path)), String(target)), path, "junction");
        }
    };
    const symlink = fs.promises.symlink;
    fs.promises.symlink = async (target, path, type) => {
        try {
            await symlink(target, path, type);
        } catch (error) {
            if (!asJunction(error, target, path)) throw error;
            await symlink(resolve(dirname(String(path)), String(target)), path, "junction");
        }
    };
    const symlinkCallback = fs.symlink;
    fs.symlink = ((target: fs.PathLike, path: fs.PathLike, ...rest: unknown[]) => {
        const callback = rest.pop() as fs.NoParamCallback;
        const type = rest[0] as fs.symlink.Type | null | undefined;
        symlinkCallback(target, path, type, (error) => {
            if (error === null || !asJunction(error, target, path)) return callback(error);
            symlinkCallback(
                resolve(dirname(String(path)), String(target)),
                path,
                "junction",
                callback,
            );
        });
    }) as typeof fs.symlink;
    syncBuiltinESMExports();

    const longer = (timeout: number | undefined) =>
        timeout === undefined ? 10_000 : Math.max(10_000, timeout * 3);
    const waitFor = vi.waitFor;
    vi.waitFor = ((
        callback: Parameters<typeof waitFor>[0],
        options?: Parameters<typeof waitFor>[1],
    ) =>
        waitFor(
            callback,
            typeof options === "number"
                ? longer(options)
                : { ...options, timeout: longer(options?.timeout) },
        )) as typeof waitFor;
    const poll = expect.poll;
    expect.poll = ((callback: Parameters<typeof poll>[0], options?: Parameters<typeof poll>[1]) =>
        poll(callback, { ...options, timeout: longer(options?.timeout) })) as typeof poll;

    const shipped = fileURLToPath(
        new URL("../../../happy-agent/native/target/win32-x64/libsql.node", import.meta.url),
    );
    if (fs.existsSync(shipped)) {
        const loader = Module as unknown as {
            _resolveFilename: (request: string, ...rest: unknown[]) => string;
        };
        const resolveFilename = loader._resolveFilename;
        loader._resolveFilename = function (request, ...rest) {
            return request === "@libsql/win32-x64-msvc"
                ? shipped
                : resolveFilename.call(this, request, ...rest);
        };
    }
}

const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
if (major === 24 && minor < 16) {
    const duplexPair = stream.duplexPair;
    stream.duplexPair = (options) => {
        const pair = duplexPair(options);
        const link = (side: Duplex, other: Duplex) => {
            const destroy = side._destroy.bind(side);
            side._destroy = (error, callback) => {
                if (!other.destroyed) {
                    process.nextTick(() => {
                        if (other.destroyed) return;
                        if (error) other.destroy();
                        else other.push(null);
                    });
                }
                destroy(error, callback);
            };
        };
        link(pair[0], pair[1]);
        link(pair[1], pair[0]);
        return pair;
    };
    syncBuiltinESMExports();
}
