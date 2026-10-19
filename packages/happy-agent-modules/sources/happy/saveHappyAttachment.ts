import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Casa fork (18/10/2026, "turbinar o Happy" item 4): a file the person attached that is not a picture (PDF, Word,
 * Excel) used to be dropped before download ("it cannot do that with a spreadsheet"). It is now saved in the
 * conversation's folder, and the model is told where, so it can open it with its tools.
 */
export const HAPPY_ATTACHMENTS_DIR = join(".happy", "anexos");

/** One file the person attached that is not a picture. */
export interface HappyInboundFile {
    readonly name: string;
    readonly mimeType: string;
    readonly data: Uint8Array;
}

/** A file name that cannot leave the attachments folder: the last part only, without control characters. */
export function safeAttachmentName(name: string | undefined): string {
    const base = (name ?? "").split(/[\\/]/).pop() ?? "";
    const clean = base
        .replace(/[\u0000-\u001f<>:"|?*]/g, "_")
        .replace(/^\.+/, "")
        .trim()
        .slice(0, 120);
    return clean || "anexo";
}

/** Saves the file under `<folder>/.happy/anexos/` and returns the line that tells the model where it is. */
export async function saveHappyAttachment(
    folder: string,
    file: HappyInboundFile,
    now: Date = new Date(),
): Promise<string> {
    const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-");
    const name = safeAttachmentName(file.name);
    const relative = join(HAPPY_ATTACHMENTS_DIR, `${stamp}-${name}`);
    await mkdir(join(folder, HAPPY_ATTACHMENTS_DIR), { recursive: true });
    await writeFile(join(folder, relative), file.data, { mode: 0o600 });
    const kb = Math.max(1, Math.round(file.data.length / 1024));
    return `[Arquivo anexado pela pessoa: ${name} (${file.mimeType}, ${kb} KB), salvo em ${relative.replace(/\\/g, "/")}. Abra por lá com as suas ferramentas.]`;
}
