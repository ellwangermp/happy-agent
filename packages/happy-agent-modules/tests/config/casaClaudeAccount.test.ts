import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CredentialSource } from "@slopus/happy-agent-client";
import type { BaseProvider, SessionEvent } from "@slopus/happy-providers";
import { createRootContext } from "@steve.kite/stdlib";
import { afterEach, describe, expect, it } from "vitest";
import {
    casaContaClaude,
    casaImpressoesPath,
    DEFAULT_IMPRESSOES,
} from "../../sources/config/impl/casaContaClaude.js";
import { observeProviderExecution } from "../../sources/config/impl/observeProviderExecution.js";
import { ProviderExecutionObservations } from "../../sources/config/impl/ProviderExecutionObservations.js";

/**
 * Casa fork (19/10/2026): the Claude account of a reply is the one whose token is in the login file
 * when the reply starts, looked up by the token's SHA-256 in the map 2nd-brain contas.py writes.
 */

const sha = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");

function casa(token: string | undefined, mapa: Record<string, string>) {
    const pasta = mkdtempSync(join(tmpdir(), "casa-conta-"));
    if (token !== undefined)
        writeFileSync(
            join(pasta, ".credentials.json"),
            JSON.stringify({ claudeAiOauth: { accessToken: token, refreshToken: "" } }),
        );
    const impressoes = join(pasta, "impressoes.json");
    writeFileSync(
        impressoes,
        JSON.stringify({ gerado_em: "2026-10-19T22:00:00-03:00", impressoes: mapa }),
    );
    return { pasta, impressoes };
}

const NATIVE: CredentialSource = {
    kind: "native_login",
    location: "Claude Code sign-in",
    host: null,
};

describe("casa: which Claude account answered", () => {
    afterEach(() => {
        delete process.env.HAPPY_CASA_IMPRESSOES;
    });

    it("names the account whose token is in the login file", () => {
        const { pasta, impressoes } = casa("tok-adm", {
            [sha("tok-adm")]: "administrativo@nyrapericias.com",
            [sha("tok-est")]: "estevao.nyrapericias@gmail.com",
        });
        expect(casaContaClaude({ configDir: pasta, impressoes })).toBe(
            "administrativo@nyrapericias.com",
        );
    });

    it("stays unknown for a token the house does not know, a missing login or a missing map", () => {
        const { pasta, impressoes } = casa("tok-navegador", { [sha("tok-adm")]: "a@b.com" });
        expect(casaContaClaude({ configDir: pasta, impressoes })).toBeUndefined();
        const vazio = casa(undefined, { [sha("tok-adm")]: "a@b.com" });
        expect(
            casaContaClaude({ configDir: vazio.pasta, impressoes: vazio.impressoes }),
        ).toBeUndefined();
        expect(
            casaContaClaude({ configDir: pasta, impressoes: join(pasta, "nada.json") }),
        ).toBeUndefined();
    });

    it("is off under the test runner unless asked, and can be turned off", () => {
        expect(casaImpressoesPath({ VITEST: "true" })).toBeNull();
        expect(casaImpressoesPath({})).toBe(DEFAULT_IMPRESSOES);
        expect(casaImpressoesPath({ HAPPY_CASA_IMPRESSOES: "" })).toBeNull();
        expect(casaImpressoesPath({ VITEST: "true", HAPPY_CASA_IMPRESSOES: "x.json" })).toBe(
            "x.json",
        );
    });

    async function attempt(providerType: string, source: CredentialSource | null, pasta: string) {
        const observations = new ProviderExecutionObservations();
        let atEntry: unknown = "not read";
        const fake = {
            session: async (id: string) => ({
                id,
                credential: { configDir: pasta },
                run: () => ({
                    async *[Symbol.asyncIterator]() {
                        atEntry = observations.current("agent", "op")?.attempt.mode.account;
                        yield { type: "done", state: "completed" } as unknown as SessionEvent;
                    },
                }),
                compact: async () => ({}),
            }),
        } as unknown as BaseProvider;
        observeProviderExecution(fake, observations, providerType, source, undefined, providerType);
        const session = await fake.session("agent", {} as never);
        observations.begin("agent", "op", "inference");
        for await (const _ of session.run(createRootContext(), {
            model: "anthropic/opus-5-5",
        } as never));
        return { atEntry, recorded: observations.read("agent", "op")?.map((a) => a.mode.account) };
    }

    it("carries the account in the attempt History sees, from the first block", async () => {
        const { pasta, impressoes } = casa("tok-adm", {
            [sha("tok-adm")]: "administrativo@nyrapericias.com",
        });
        process.env.HAPPY_CASA_IMPRESSOES = impressoes;
        const conta = {
            id: "claude:administrativo@nyrapericias.com",
            label: "administrativo@nyrapericias.com",
        };
        expect(await attempt("claude", NATIVE, pasta)).toEqual({
            atEntry: conta,
            recorded: [conta],
        });
    });

    it("never names an account for Codex or for a Claude key that is not the Claude Code sign-in", async () => {
        const { pasta, impressoes } = casa("tok-adm", {
            [sha("tok-adm")]: "administrativo@nyrapericias.com",
        });
        process.env.HAPPY_CASA_IMPRESSOES = impressoes;
        expect((await attempt("codex", NATIVE, pasta)).recorded).toEqual([null]);
        const chave: CredentialSource = {
            kind: "configuration",
            location: "providers.claude.api_key",
            host: null,
        };
        expect((await attempt("claude", chave, pasta)).recorded).toEqual([null]);
    });
});
