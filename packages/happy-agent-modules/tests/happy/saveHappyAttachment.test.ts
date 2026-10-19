import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { safeAttachmentName, saveHappyAttachment } from "../../sources/happy/saveHappyAttachment.js";

describe("saveHappyAttachment", () => {
    it("keeps a file that is not a picture in the conversation folder and says where", async () => {
        const folder = await mkdtemp(join(tmpdir(), "happy-anexo-"));
        const data = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9]);
        const line = await saveHappyAttachment(
            folder,
            { name: "relatório final.docx", mimeType: "application/msword", data },
            new Date("2026-10-18T21:05:09Z"),
        );
        const saved = await readFile(join(folder, ".happy", "anexos", "20261018-210509-relatório final.docx"));
        expect(new Uint8Array(saved)).toEqual(data);
        expect(line).toContain(".happy/anexos/20261018-210509-relatório final.docx");
        expect(line).toContain("application/msword");
    });

    it("never lets a name leave the attachments folder", () => {
        expect(safeAttachmentName("..\\..\\Windows\\win.ini")).toBe("win.ini");
        expect(safeAttachmentName("../../etc/passwd")).toBe("passwd");
        expect(safeAttachmentName("..")).toBe("anexo");
        expect(safeAttachmentName(undefined)).toBe("anexo");
    });
});
