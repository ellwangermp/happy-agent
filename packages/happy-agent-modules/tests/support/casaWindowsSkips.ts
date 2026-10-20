// Casa fork (20/10/2026, his "esses que falham, acho que tem que arrumar né?").
//
// The tests upstream wrote for Linux, skipped on Windows from this one list so that no upstream
// test file changes: upstream runs these modules only on Ubuntu (publish.yml), and a mark inside
// each file would turn every merge of a new upstream version into a conflict. Each entry says why
// the test cannot run here. What Windows can run, it runs: tests/casa/casaRealDiskDiscovery.test.ts
// proves on the real disk what the FakeCompute (pretend Linux) tests prove on a pretend one.
// "links" tests run wherever this computer lets a file link be made (Developer Mode or an admin).
// A Windows run must end with no failures; a test that starts failing is fixed, not added here.
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach } from "vitest";

type Skip = {
    file: string;
    needs: "linux" | "links";
    reason: string;
    tests: string[];
};

const SKIPS: Skip[] = [
    {
        file: "tests/config/executionConfig.test.ts",
        needs: "linux",
        reason: "execution users need sudo, which Windows does not have; Happy refuses them there by design.",
        tests: [
            "reads the workload user, per-bot users, and the runner executable",
            "starts runners from the daemon's own executable unless one is named",
        ],
    },
    {
        file: "tests/bridges/attachVhciDevice.test.ts",
        needs: "linux",
        reason: "USB attach goes through the Linux kernel's vhci driver.",
        tests: [
            "puts a SuperSpeed device on a SuperSpeed port, and a faster one at SuperSpeed",
            "writes `port 3 devid speed` from a helper holding the socket as descriptor 3",
        ],
    },
    {
        file: "tests/tailcat/TailcatConnection.test.ts",
        needs: "linux",
        reason: "the fake carrier is a #! script, which Windows cannot start.",
        tests: [
            "closes during startup without resurrecting the carrier and unregisters only once",
            "recovers from a carrier failing during handshake",
            "recovers from a carrier failing during startup",
            "replaces a live but stale carrier for subsequent concurrent requests without replaying a failed connection",
            "reuses one persistent SOCKS carrier and returns native sockets with bounded handshake reads",
        ],
    },
    {
        file: "tests/tailcat/TailcatExposure.test.ts",
        needs: "linux",
        reason: "the fake tailcat is a #! script, which Windows cannot start, and the daemon listens on a Unix socket path, which Windows names as a pipe.",
        tests: [
            "forwards HTTP bytes to a Unix-socket daemon",
            "generates one stable fixed-region key and keeps only the key after closing",
            "keeps reopening after Tailcat exits and one reopen fails",
        ],
    },
    {
        file: "tests/tailcat/TailcatModule.test.ts",
        needs: "linux",
        reason: "the fake tailcat is a #! script, which Windows cannot start.",
        tests: ["opens and closes the live tunnel, persists the toggle, and reports its address"],
    },
    {
        file: "tests/compute/ComputeAbort.test.ts",
        needs: "linux",
        reason: "the command is written for a POSIX shell and the check reads a POSIX process group.",
        tests: ["marks process state exited and sends SIGKILL to the complete process group"],
    },
    {
        file: "tests/compute/ComputeSecrets.test.ts",
        needs: "linux",
        reason: "the commands are written for a POSIX shell.",
        tests: [
            "builds each command environment from only its selected attached bundles",
            "keeps background input under the secret-bearing process's existing sandbox",
            "provides selected secrets without leaving the sandbox",
            "resolves the global catalog through each agent's own attachment scope",
        ],
    },
    {
        file: "tests/workspaces/WorkspaceNestedProvisioning.test.ts",
        needs: "linux",
        reason: "the setup commands are written for a POSIX shell (quoting, touch, while).",
        tests: [
            "cancels provisioning and archives while a setup command is running",
            "keeps a created workspace usable when its setup command fails",
            "recovers setup from its durable command checkpoint after restart",
        ],
    },
    {
        file: "tests/compute/ComputeModule.test.ts",
        needs: "linux",
        reason: 'the machine is FakeCompute, a pretend Linux host ("/workspace"); tests/casa/casaRealDiskDiscovery.test.ts proves discovery on the real disk.',
        tests: ["creates and caches one distinct compute per agent for every module"],
    },
    {
        file: "tests/skills/SkillsModule.test.ts",
        needs: "linux",
        reason: 'the machine is FakeCompute, a pretend Linux host ("/workspace"); tests/casa/casaRealDiskDiscovery.test.ts proves discovery on the real disk.',
        tests: [
            "bounds system instructions for a large valid catalog",
            "contributes each skill as a command and injects the invoked document for the run",
            "discovers user and project skills with deeper project precedence",
            "does not recurse into dot-directories or node_modules",
            "follows symlinked skill directories without looping",
            "parses YAML flow maps, aliases, and folded plain scalars",
            "reads a user-only skill the user requested with a read_skill tool call",
            "reserves a skill marked disable-model-invocation for the user",
        ],
    },
    {
        file: "tests/skills/SkillsModule.edge.test.ts",
        needs: "linux",
        reason: 'the machine is FakeCompute, a pretend Linux host ("/workspace"); tests/casa/casaRealDiskDiscovery.test.ts proves discovery on the real disk.',
        tests: [
            "bounds list output and keeps every page reachable",
            "discovers changes and removals without a persistent catalog",
            "does not retain mutable list results between live reads",
            "does not treat a root-level SKILL.md as a child skill document",
            "escapes skill metadata in system instructions",
            "handles filesystem failures at each discovery boundary",
            "keeps malformed or unreadable entries from hiding valid siblings",
            "reads filesystem documents with the bounded, no-follow read contract",
            "routes list and read tools through the same public operations",
            "skips malformed flow-map and oversized frontmatter files while keeping siblings",
            "supports filtered paging and cursors beyond the final match",
            "treats a skills root reached through a symlink as the skill itself",
            "uses the nearest project skill when several project roots define one name",
        ],
    },
    {
        file: "tests/skills/SkillsDiscoveryPerformance.test.ts",
        needs: "linux",
        reason: 'the machine is FakeCompute, a pretend Linux host ("/workspace"); tests/casa/casaRealDiskDiscovery.test.ts proves discovery on the real disk.',
        tests: [
            "batches directory metadata instead of making a serial stat call per entry",
            "does not retain a failed filesystem observation in a later scan",
            "does not reuse a completed scan after a skill changes, disappears, or reappears",
            "keeps identically named machines and different permission modes isolated",
            "reads each skill once during a concurrent 605-agent catalog load",
            "retains individual failure isolation when a metadata batch fails",
        ],
    },
    {
        file: "tests/skills/SkillsConfiguredDirectories.test.ts",
        needs: "linux",
        reason: 'the machine is FakeCompute, a pretend Linux host ("/workspace"); tests/casa/casaRealDiskDiscovery.test.ts proves discovery on the real disk.',
        tests: [
            "discovers skills in project-configured folders relative to the project root",
            "ignores an invalid project happy.toml without hiding standard skills",
            "parses [skills] directories from the user happy.toml and resolves them against home",
            "scans machine-configured folders only on the daemon's native filesystem",
        ],
    },
    {
        file: "tests/skills/SkillsAvailability.test.ts",
        needs: "linux",
        reason: 'the machine is FakeCompute, a pretend Linux host ("/workspace"); tests/casa/casaRealDiskDiscovery.test.ts proves discovery on the real disk.',
        tests: [
            "filters pending global instructions without disabling same-name project or separate-machine skills",
        ],
    },
    {
        file: "tests/skills/SkillFoldersModule.test.ts",
        needs: "linux",
        reason: 'the machine is FakeCompute, a pretend Linux host ("/workspace"); tests/casa/casaRealDiskDiscovery.test.ts proves discovery on the real disk.',
        tests: ["adds and removes folders in runtime.toml and discovery sees the change live"],
    },
    {
        file: "tests/systemPrompt/SystemPromptAgentsMd.test.ts",
        needs: "linux",
        reason: 'the machine is FakeCompute, a pretend Linux host ("/workspace"); tests/casa/casaRealDiskDiscovery.test.ts proves discovery on the real disk.',
        tests: [
            "corrects a queued change accepted after files revert",
            "discovers applicable files from the Git root to the compute cwd",
            "does not accept a spoofed removal payload with the generated notice ID",
            "does not advance the fingerprint for copied notice metadata on another message",
            "includes the configured global instructions, project security rules, and the specification",
            "inserts a durable replacement or removal notice when instructions change",
            "keeps one instruction snapshot per turn when files change after beforeTurn",
            "keeps ordinary bounded document read failures visible",
            "marks oversized documents and keeps the instruction hook bounded",
            "marks the snapshot truncated when a deeper document follows a gap after the limit",
            "returns a truncated record when a document grows during its bounded read",
            "uses a fresh durable notice ID when content or removal repeats later",
        ],
    },
    {
        file: "tests/systemPrompt/SystemPromptCornerCases.test.ts",
        needs: "linux",
        reason: 'the machine is FakeCompute, a pretend Linux host ("/workspace"); tests/casa/casaRealDiskDiscovery.test.ts proves discovery on the real disk.',
        tests: [
            "does not follow a project-root security symbolic link",
            "does not follow an AGENTS.md symbolic link",
            "keeps the public reviewer formatting separate from delivery state",
            "reads AGENTS.md from an agent's folder on a runner",
            "returns a detached snapshot that callers cannot mutate in place",
        ],
    },
    {
        file: "tests/systemPrompt/SystemPromptModule.test.ts",
        needs: "linux",
        reason: 'the machine is FakeCompute, a pretend Linux host ("/workspace"); tests/casa/casaRealDiskDiscovery.test.ts proves discovery on the real disk.',
        tests: [
            "appends the machine environment and every configured model route",
            "fits a maximal AGENTS.md chain into the remaining UTF-8 prompt budget",
            "renders the complete legacy environment text in its exact order",
        ],
    },
    {
        file: "tests/runtime/globalSkills.test.ts",
        needs: "linux",
        reason: "Windows refuses to rename a folder the native watcher holds open.",
        tests: [
            "serves parsed skills, streams native file changes, enforces disablement, and survives restart",
        ],
    },
    {
        file: "tests/projects/ProjectPlainDirectoryRegistration.test.ts",
        needs: "linux",
        reason: "an inaccessible folder is made with chmod, which Windows ignores.",
        tests: ["keeps missing, inaccessible, and non-directory paths as registration errors"],
    },
    {
        file: "tests/git/WorkingTreeWatcher.test.ts",
        needs: "linux",
        reason: "upstream lists Git-ignored folders only where each folder costs a kernel watch (LISTS_IGNORED in WorkingTreeWatcher.ts); Windows reports them on purpose.",
        tests: [
            "reports working-tree changes and nothing from ignored directories",
            "stops reporting a directory once Git starts ignoring it",
        ],
    },
    {
        file: "tests/bots/BotsModule.test.ts",
        needs: "links",
        reason: "links to a file, which Windows lets only an administrator (or Developer Mode) make.",
        tests: ["keeps admin avatar images inside the acting bot's folder"],
    },
    {
        file: "tests/exportedBots/bridgeExportedBot.test.ts",
        needs: "links",
        reason: "links to a file, which Windows lets only an administrator (or Developer Mode) make.",
        tests: ["refuses relative paths, links, directories, missing and empty files"],
    },
    {
        file: "tests/files/ProjectFilesModule.test.ts",
        needs: "links",
        reason: "links to a file, which Windows lets only an administrator (or Developer Mode) make.",
        tests: ["refuses traversal, outside absolute paths, symlink escapes and non-files"],
    },
    {
        file: "tests/skills/GlobalSkillsModule.test.ts",
        needs: "links",
        reason: "links to a file, which Windows lets only an administrator (or Developer Mode) make.",
        tests: [
            "rejects traversal and escaping symlinks, but supports an installed directory symlink",
        ],
    },
];

function canLinkFiles(): boolean {
    const root = fs.mkdtempSync(join(tmpdir(), "happy-file-link-"));
    try {
        fs.writeFileSync(join(root, "target"), "");
        fs.symlinkSync(join(root, "target"), join(root, "link"), "file");
        return true;
    } catch {
        return false;
    } finally {
        fs.rmSync(root, { force: true, recursive: true });
    }
}

if (process.platform === "win32") {
    const links = canLinkFiles();
    beforeEach((context) => {
        const file = (context.task.file?.filepath ?? "").replaceAll("\\", "/");
        const skip = SKIPS.find(
            (entry) => file.endsWith(`/${entry.file}`) && entry.tests.includes(context.task.name),
        );
        if (skip !== undefined && (skip.needs === "linux" || !links)) {
            context.skip(`Casa fork, Windows: ${skip.reason}`);
        }
    });
}
