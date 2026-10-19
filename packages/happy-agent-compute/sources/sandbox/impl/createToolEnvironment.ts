import { existsSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";

import type { ComputeHostPolicy } from "../../ComputeHostPolicy.js";
import type { ComputePermissionMode } from "../../ComputePermissions.js";
import { findExecutableSearchPaths } from "./findExecutableSearchPaths.js";
import { createShellEnvironment } from "./createShellEnvironment.js";

export async function createToolEnvironment(
    mode: ComputePermissionMode,
    environment: NodeJS.ProcessEnv = process.env,
    options: {
        cwd?: string;
        hostPolicy?: ComputeHostPolicy;
        homeDirectory?: string;
        temporaryDirectory?: string;
    } = {},
): Promise<NodeJS.ProcessEnv> {
    const filtered = createShellEnvironment(environment, options.hostPolicy);
    if (mode === "full_access") return filtered;
    if (process.platform === "win32") {
        // Restricted commands run as Happy's separate Windows account. Trust
        // the selected workspace, its repository and the owner's folders for
        // Git ownership checks (see gitTrustedFolders), scoped to this process
        // environment. Never change the user's global Git config.
        const configuredCount = Number(filtered.GIT_CONFIG_COUNT ?? "0");
        const count =
            Number.isSafeInteger(configuredCount) && configuredCount >= 0 ? configuredCount : 0;
        const trusted = gitTrustedFolders(resolve(options.cwd ?? process.cwd()), environment);
        const result: NodeJS.ProcessEnv = { ...filtered, GIT_CONFIG_COUNT: String(count + trusted.length) };
        trusted.forEach((folder, index) => {
            result[`GIT_CONFIG_KEY_${count + index}`] = "safe.directory";
            result[`GIT_CONFIG_VALUE_${count + index}`] = folder;
        });
        return result;
    }
    return {
        ...filtered,
        PATH: (
            await findExecutableSearchPaths({
                cwd: options.cwd ?? process.cwd(),
                environment,
                ...(options.homeDirectory === undefined
                    ? {}
                    : { homeDirectory: options.homeDirectory }),
                ...(options.temporaryDirectory === undefined
                    ? {}
                    : { temporaryDirectory: options.temporaryDirectory }),
            })
        ).join(delimiter),
    };
}

/** The house's own folders, trusted by default on the owner's machine (casa fork). Empty turns it off. */
const CASA_GIT_TRUST = "C:/VS_Projects/*;C:/2nd-Brain/*";

/**
 * Casa fork (18/10/2026): the folders Git may trust under Happy's separate Windows account. Git checks
 * the owner of the repository's top folder, not of the working folder, so trusting only the selected
 * folder left a bot working in a subfolder (the Forest in C:\VS_Projects\meta_class\forest) with
 * "detected dubious ownership" on every Git command, in its own repository. The repository around the
 * working folder is trusted too, and on the owner's machine his own folders (`HAPPY_CASA_GIT_TRUST`,
 * semicolon separated, `/*` for every repository under a folder), which he already lets the bots read.
 */
export function gitTrustedFolders(cwd: string, environment: NodeJS.ProcessEnv = process.env): string[] {
    const slash = (path: string) => path.replaceAll("\\", "/");
    const folders = [slash(cwd)];
    for (let folder = cwd; ; folder = dirname(folder)) {
        if (existsSync(join(folder, ".git"))) {
            folders.push(slash(folder));
            break;
        }
        if (dirname(folder) === folder) break;
    }
    const casa = environment.HAPPY_CASA_GIT_TRUST ?? CASA_GIT_TRUST;
    folders.push(...casa.split(";").map((path) => slash(path.trim())).filter((path) => path !== ""));
    return [...new Set(folders)];
}
