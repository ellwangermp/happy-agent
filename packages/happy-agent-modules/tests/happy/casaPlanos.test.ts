import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ProviderUsage } from "@slopus/happy-providers";
import {
    CASA_CARD_MAX_AGE_MS,
    CASA_REFRESH_MS,
    CasaPlanos,
    casaContasCommand,
    casaUsage,
    chooseUsage,
    IN_BAND_REFUSAL_MS,
    type CasaPainel,
} from "../../sources/happy/casaPlanos.js";
import { claudeFull, reserveHasRoom, reserveRoute } from "../../sources/happy/reserveRoute.js";

const NOW = Date.parse("2026-10-19T14:10:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const MIN = 60_000;

/** The panel of 19/10/2026 14:09 UTC, as `contas.py painel` printed it, with the plan in use changed per test. */
function painel(claudeAqui: { cinco: number; semana: number; situacao: string; bloqueada_ate?: string }, codexSemana = 59): CasaPainel {
    return {
        lida_em: iso(NOW - MIN),
        em_uso_aqui: { conta: "ellwangermp@gmail.com" },
        contas: [
            {
                conta: "EllwangerMP@gmail.com",
                tipo: "claude",
                lida_em: iso(NOW - 9 * MIN),
                cinco_horas: claudeAqui.cinco,
                volta_5h: iso(NOW + 230 * MIN),
                semana: claudeAqui.semana,
                volta_semana: iso(NOW + 4 * 1440 * MIN),
                situacao: claudeAqui.situacao,
                ...(claudeAqui.bloqueada_ate === undefined ? {} : { bloqueada_ate: claudeAqui.bloqueada_ate }),
            },
            { conta: "manupozza@gmail.com", tipo: "claude", lida_em: iso(NOW - 9 * MIN), cinco_horas: 0, semana: 99, situacao: "perto do limite" },
            {
                conta: "administrativo@nyrapericias.com.br",
                tipo: "codex",
                lida_em: iso(NOW - 10 * MIN),
                cinco_horas: 0,
                volta_5h: null,
                semana: codexSemana,
                volta_semana: iso(NOW + 7 * 1440 * MIN),
                situacao: codexSemana >= 100 ? "bloqueada" : "liberada",
            },
        ],
    };
}

const models = [
    { id: "claude-opus-5-5", providerId: "claude", defaultEffort: "high" },
    { id: "openai/gpt-5.6-sol", providerId: "codex", defaultEffort: "medium" },
];
const typeOf = (id: string) => (id === "claude" || id === "codex" ? id : null);
const onClaude = { effort: "high", modelId: "claude-opus-5-5", permissionMode: "yolo", providerId: "claude", serviceTier: null };

describe("the house panel of the five plans, for the Codex reserve", () => {
    it("reads the Claude login this machine uses, and the Codex plan", () => {
        const claude = casaUsage(painel({ cinco: 22, semana: 46, situacao: "liberada" }), "claude", "claude", NOW)!;
        expect(claude.windows.fiveHour?.usedPercent).toBe(22);
        expect(claude.windows.weekly?.usedPercent).toBe(46);
        expect(claude.exhausted).toBe(false);
        expect(claude.capturedAt).toBe(NOW - MIN);
        expect(claudeFull(claude, NOW)).toBe(false);
        const codex = casaUsage(painel({ cinco: 22, semana: 46, situacao: "liberada" }), "codex", "codex", NOW)!;
        expect(codex.windows.weekly?.usedPercent).toBe(59);
        expect(reserveHasRoom(codex)).toBe(true);
    });

    it("says full when the plan in use is at the swap line or blocked, and not once the block has passed", () => {
        expect(claudeFull(casaUsage(painel({ cinco: 10, semana: 99.6, situacao: "perto do limite" }), "claude", "claude", NOW), NOW)).toBe(true);
        const blocked = painel({ cinco: 100, semana: 60, situacao: "bloqueada", bloqueada_ate: iso(NOW + 50 * MIN) });
        expect(casaUsage(blocked, "claude", "claude", NOW)?.exhausted).toBe(true);
        // Four hours on, the reading is too old to say anything.
        expect(casaUsage(blocked, "claude", "claude", NOW + 240 * MIN)).toBeNull();
        const passed = painel({ cinco: 100, semana: 60, situacao: "bloqueada", bloqueada_ate: iso(NOW - MIN) });
        const justAfter: CasaPainel = {
            ...passed,
            contas: [{ ...passed.contas![0]!, volta_5h: iso(NOW - MIN) }, ...passed.contas!.slice(1)],
        };
        const reading = casaUsage(justAfter, "claude", "claude", NOW)!;
        expect(reading.exhausted).toBe(false);
        expect(reading.windows.fiveHour?.usedPercent).toBe(0);
        expect(claudeFull(reading, NOW)).toBe(false);
    });

    it("says nothing when it does not know: no plan in use, no reading, or a reading over 30 min old", () => {
        const p = painel({ cinco: 10, semana: 10, situacao: "liberada" });
        expect(casaUsage({ ...p, em_uso_aqui: { conta: null } }, "claude", "claude", NOW)).toBeNull();
        expect(casaUsage({ ...p, em_uso_aqui: { conta: "outra@x.com" } }, "claude", "claude", NOW)).toBeNull();
        expect(casaUsage(null, "claude", "claude", NOW)).toBeNull();
        expect(casaUsage(p, "claude", "claude", NOW + CASA_CARD_MAX_AGE_MS)).toBeNull();
        const semLeitura = { ...p, contas: [{ ...p.contas![0]!, situacao: "sem leitura" }] };
        expect(casaUsage(semLeitura, "claude", "claude", NOW)).toBeNull();
    });

    it("lets a refusal Claude sent minutes ago outrank the panel, and never an old one", () => {
        const refused: ProviderUsage = {
            providerId: "claude",
            vendor: "claude",
            capturedAt: NOW - MIN,
            planName: null,
            exhausted: true,
            windows: { fiveHour: null, weekly: null, monthly: null },
            credits: null,
        };
        const casa = casaUsage(painel({ cinco: 22, semana: 46, situacao: "liberada" }), "claude", "claude", NOW);
        expect(chooseUsage(refused, casa, NOW)).toBe(refused);
        // 19/10/2026: an old refusal kept every conversation on Codex, with nothing left to report the room back.
        expect(chooseUsage({ ...refused, capturedAt: NOW - IN_BAND_REFUSAL_MS - 1 }, casa, NOW)).toBe(casa);
        expect(chooseUsage(null, null, NOW)).toBeNull();
        expect(chooseUsage({ ...refused, exhausted: false }, null, NOW)?.exhausted).toBe(false);
    });

    it("moves a conversation to Codex when the plan in use is full, and back when the panel shows room", () => {
        const full = painel({ cinco: 100, semana: 70, situacao: "bloqueada", bloqueada_ate: iso(NOW + 50 * MIN) });
        const room = painel({ cinco: 3, semana: 47, situacao: "liberada" });
        const usageOf = (p: CasaPainel) => (id: string) => casaUsage(p, id as "claude" | "codex", id, NOW);
        const away = reserveRoute({ selection: onClaude, models, typeOf, usage: usageOf(full), now: NOW });
        expect(away.change).toBe("to-reserve");
        expect(away.selection.providerId).toBe("codex");
        const back = reserveRoute({ selection: away.selection, models, typeOf, usage: usageOf(room), movedFrom: away.movedFrom, now: NOW });
        expect(back.change).toBe("back");
        expect(back.selection).toEqual(onClaude);
        // No room on Codex either: the conversation stays where it is.
        const both = painel({ cinco: 100, semana: 70, situacao: "bloqueada", bloqueada_ate: iso(NOW + 50 * MIN) }, 100);
        expect(reserveRoute({ selection: onClaude, models, typeOf, usage: usageOf(both), now: NOW }).change).toBeNull();
    });

    it("asks the panel in the background, shares one run, and keeps the last answer when a run fails", async () => {
        let now = NOW;
        let runs = 0;
        let answer: unknown = painel({ cinco: 22, semana: 46, situacao: "liberada" });
        const planos = new CasaPlanos({
            cmd: ["contas"],
            rehearsal: "",
            now: () => now,
            run: async () => {
                runs += 1;
                if (answer instanceof Error) throw answer;
                return answer;
            },
        });
        expect(planos.usage("claude", "claude")).toBeNull(); // the first ask starts behind the answer
        await planos.refresh();
        expect(planos.usage("claude", "claude")?.windows.weekly?.usedPercent).toBe(46);
        expect(runs).toBe(1); // the background ask and refresh() shared one run
        answer = new Error("the Formiga did not answer");
        now += CASA_REFRESH_MS;
        planos.usage("claude", "claude");
        await planos.refresh();
        expect(planos.error).toBe("the Formiga did not answer");
        expect(planos.usage("claude", "claude")?.windows.weekly?.usedPercent).toBe(46);
    });

    it("uses a rehearsal panel only for the agents it names, and only until its deadline", async () => {
        const folder = mkdtempSync(join(tmpdir(), "casa-ensaio-"));
        const file = join(folder, "painel-ensaio.json");
        const full = painel({ cinco: 100, semana: 70, situacao: "bloqueada", bloqueada_ate: iso(NOW + 50 * MIN) });
        writeFileSync(file, JSON.stringify({ agentes: ["teste"], ate: iso(NOW + 30 * MIN), painel: full }));
        const planos = new CasaPlanos({ cmd: ["contas"], rehearsal: file, now: () => NOW, run: async () => painel({ cinco: 1, semana: 1, situacao: "liberada" }) });
        await planos.refresh();
        expect(planos.usage("claude", "claude", "teste")?.exhausted).toBe(true);
        expect(planos.usage("claude", "claude", "forest")?.exhausted).toBe(false);
        expect(planos.usage("claude", "claude")?.exhausted).toBe(false);
        writeFileSync(file, JSON.stringify({ agentes: ["teste"], ate: iso(NOW - 1), painel: full }));
        expect(planos.usage("claude", "claude", "teste")?.exhausted).toBe(false);
    });

    it("is off under the test runner unless a command is given", () => {
        expect(casaContasCommand({ VITEST: "true" })).toBeNull();
        expect(casaContasCommand({ HAPPY_CASA_CONTAS_CMD: "" })).toBeNull();
        expect(casaContasCommand({ VITEST: "true", HAPPY_CASA_CONTAS_CMD: '["node","x.js"]' })).toEqual(["node", "x.js"]);
    });
});
