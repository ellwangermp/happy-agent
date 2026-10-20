import type { MessageMode } from "@slopus/happy-agent-client";

/**
 * Casa fork (19/10/2026, idea 168 of the 2nd brain radar, his "faz 1"; then "tem que arrumar e ver oq
 * falhou... faz direito esse negocio").
 *
 * Since v0.4.100 History writes a `configuration` record whenever the route that actually answered changes
 * (provider, model, effort, account). Happy had no word for it, so he never saw it: the conversation could go
 * from Claude to Codex, or from one Claude account to another, and the phone said nothing. This turns that
 * record into one plain line in the conversation, in his language.
 */

/** "anthropic/opus-5-5" -> "Opus 5.5"; "gpt-6.1-sol" -> "GPT 6.1 Sol". */
export function nomeDoModelo(modelId: string, provedor?: string): string {
    const base = modelId.slice(modelId.lastIndexOf("/") + 1).trim();
    const partes = base.split(/[-_\s]+/).filter((parte) => parte.length > 0);
    if (provedor !== undefined && partes[0]?.toLowerCase() === provedor.toLowerCase())
        partes.shift();
    const palavras: string[] = [];
    for (const parte of partes) {
        const anterior = palavras[palavras.length - 1];
        if (/^\d+$/.test(parte) && anterior !== undefined && /^\d+(\.\d+)*$/.test(anterior)) {
            palavras[palavras.length - 1] = `${anterior}.${parte}`;
            continue;
        }
        palavras.push(
            /^gpt$/i.test(parte)
                ? "GPT"
                : /^\d/.test(parte)
                  ? parte
                  : parte.charAt(0).toUpperCase() + parte.slice(1),
        );
    }
    return palavras.join(" ") || modelId;
}

/** The provider as he names it: "Claude", "Codex", or the configured id. */
export function nomeDoProvedor(mode: MessageMode): string {
    const tipo = (mode.providerType ?? mode.providerId).trim();
    if (/^claude/i.test(tipo)) return "Claude";
    if (/^codex/i.test(tipo)) return "Codex";
    return tipo;
}

/** "Claude Opus 5.5, conta x@gmail.com" — the account only when the process proved it. */
export function nomeDaRota(mode: MessageMode): string {
    const provedor = nomeDoProvedor(mode);
    const conta = mode.account?.label ?? mode.account?.id;
    return `${provedor} ${nomeDoModelo(mode.modelId, provedor)}${conta ? `, conta ${conta}` : ""}`;
}

/** The line Happy shows where History recorded that the answering route changed. */
export function textoDaRota(before: MessageMode | null, after: MessageMode): string {
    const agora = nomeDaRota(after);
    if (before === null) return `Quem responde: ${agora}.`;
    const antes = nomeDaRota(before);
    // Only effort or permission changed: the same route keeps answering.
    if (antes === agora) return `Quem responde: ${agora}.`;
    return `Quem responde agora: ${agora} (antes: ${antes}).`;
}
