// Texte brut d'un document Word (.docx) -- sans dépendance externe (Jade : rapports d'état DDR
// remplis dans le gabarit Word du PARI CNRC). Un .docx est une archive ZIP : on lit le répertoire
// central, on décompresse word/document.xml (zlib, intégré à Node) puis on retire les balises.
import { inflateRawSync } from "zlib";

function readEntry(buf: Buffer, wanted: string): Buffer | null {
  // Fin du répertoire central (signature 0x06054b50), cherchée depuis la fin du fichier.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count && ptr + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.subarray(ptr + 46, ptr + 46 + nameLen).toString("utf8");
    if (name === wanted) {
      const lNameLen = buf.readUInt16LE(localOffset + 26);
      const lExtraLen = buf.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + lNameLen + lExtraLen;
      const data = buf.subarray(start, start + compSize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      return null;
    }
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Texte du document (paragraphes séparés par des retours à la ligne), ou null si illisible. */
export function extractDocxText(bytes: ArrayBuffer): string | null {
  try {
    const xml = readEntry(Buffer.from(bytes), "word/document.xml");
    if (!xml) return null;
    const text = xml
      .toString("utf8")
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:br\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ENTITIES[e] ?? "")
      .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return text || null;
  } catch {
    return null;
  }
}

export function isDocx(filename: string): boolean {
  return /\.docx$/i.test(filename);
}
