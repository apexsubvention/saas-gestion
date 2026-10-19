// Remplissage d'un modèle Word (.docx) -- sans dépendance externe (Jade : facture vierge d'un
// fournisseur, ex. Sitegrow, remplie automatiquement pour chaque versement du plan de facturation).
//
// Un .docx est une archive ZIP de fichiers XML. On relit l'archive, on modifie le texte des parties
// visibles (corps, en-têtes, pieds de page) et on la réécrit -- les autres fichiers (images, styles,
// logo...) sont recopiés tels quels, octet pour octet.
//
// Balises : {{numero_facture}}, {{date_facture}}... Word coupe souvent le texte en plusieurs
// « runs » (mise en forme, correcteur) : une balise peut être répartie sur plusieurs <w:t>. Le
// texte de chaque paragraphe est donc traité d'un bloc, puis réparti dans ses <w:t> d'origine (la
// valeur prend la mise en forme du début de la balise).
import { deflateRawSync, inflateRawSync } from "zlib";

// ---------------------------------------------------------------- ZIP --------------------------

type ZipEntry = {
  name: string;
  method: number; // 0 = stocké, 8 = deflate
  crc: number;
  compSize: number;
  uncompSize: number;
  data: Buffer; // octets tels que dans l'archive (compressés si method 8)
  externalAttr: number;
};

function readZip(buf: Buffer): ZipEntry[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Fichier Word illisible (archive invalide).");
  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (ptr + 46 > buf.length || buf.readUInt32LE(ptr) !== 0x02014b50) throw new Error("Fichier Word illisible (répertoire invalide).");
    const method = buf.readUInt16LE(ptr + 10);
    const crc = buf.readUInt32LE(ptr + 16);
    const compSize = buf.readUInt32LE(ptr + 20);
    const uncompSize = buf.readUInt32LE(ptr + 24);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const externalAttr = buf.readUInt32LE(ptr + 38);
    const localOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.subarray(ptr + 46, ptr + 46 + nameLen).toString("utf8");
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    entries.push({ name, method, crc, compSize, uncompSize, data: Buffer.from(buf.subarray(start, start + compSize)), externalAttr });
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function entryText(e: ZipEntry): string {
  if (e.method === 0) return e.data.toString("utf8");
  if (e.method === 8) return inflateRawSync(e.data).toString("utf8");
  throw new Error(`Compression non prise en charge dans le fichier Word (${e.name}).`);
}

function withText(e: ZipEntry, text: string): ZipEntry {
  const raw = Buffer.from(text, "utf8");
  const data = deflateRawSync(raw);
  return { ...e, method: 8, crc: crc32(raw), compSize: data.length, uncompSize: raw.length, data };
}

function writeZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version
    local.writeUInt16LE(0x0800, 6); // noms en UTF-8, pas de descripteur de données
    local.writeUInt16LE(e.method, 8);
    local.writeUInt16LE(0, 10); // heure
    local.writeUInt16LE(0x21, 12); // date (1980-01-01)
    local.writeUInt32LE(e.crc, 14);
    local.writeUInt32LE(e.compSize, 18);
    local.writeUInt32LE(e.uncompSize, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, e.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(e.method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(e.crc, 16);
    central.writeUInt32LE(e.compSize, 20);
    central.writeUInt32LE(e.uncompSize, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(e.externalAttr, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + e.data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

// ---------------------------------------------------------- Paragraphes ------------------------

// Parties visibles : corps, puis en-têtes et pieds de page (ordre stable -> index stables).
function isTextPart(name: string) {
  return name === "word/document.xml" || /^word\/(header|footer)\d*\.xml$/.test(name);
}
function partOrder(a: string, b: string) {
  if (a === "word/document.xml") return -1;
  if (b === "word/document.xml") return 1;
  return a.localeCompare(b, undefined, { numeric: true });
}

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
const encode = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type TNode = { start: number; end: number; text: string };
type Para = {
  index: number;
  part: string;
  nodes: TNode[];
  text: string;
  closeAt: number;
  pPrRunProps: string | null;
  // <w:p/> ou <w:p .../> auto-fermant (cellule vide) : position et attributs, pour le rouvrir.
  selfClosing?: { start: number; end: number; attrs: string };
};

// Paragraphes les plus internes (une zone de texte peut contenir des paragraphes dans un
// paragraphe), avec leurs <w:t>. `closeAt` : position de </w:p>, pour y ajouter une valeur.
function scanParagraphs(xml: string, part: string, firstIndex: number): Para[] {
  const re = /<w:p(?=[\s>/])[^>]*?(\/?)>|<\/w:p>|<w:t(?=[\s>/])[^>]*?(\/)?>(?:([\s\S]*?)<\/w:t>)?/g;
  const stack: Array<{ nodes: TNode[]; openEnd: number; hasChildPara: boolean }> = [];
  const out: Para[] = [];
  let index = firstIndex;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const tok = m[0];
    if (tok.startsWith("</w:p>")) {
      const p = stack.pop();
      if (!p) continue;
      if (stack.length) stack[stack.length - 1]!.hasChildPara = true;
      if (p.hasChildPara && p.nodes.length === 0) continue; // conteneur seulement
      const pPr = xml.slice(p.openEnd, m.index).match(/^\s*<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? "";
      const rPr = pPr.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? null;
      out.push({ index: index++, part, nodes: p.nodes, text: p.nodes.map((n) => n.text).join(""), closeAt: m.index, pPrRunProps: rPr });
    } else if (tok.startsWith("<w:p")) {
      if (m[1] === "/") {
        // <w:p/> vide auto-fermant (ex. cellule de tableau vide) : paragraphe vide, remplissable.
        if (stack.length) stack[stack.length - 1]!.hasChildPara = true;
        const attrs = tok.slice(4, tok.length - 2);
        out.push({ index: index++, part, nodes: [], text: "", closeAt: m.index, pPrRunProps: null, selfClosing: { start: m.index, end: m.index + tok.length, attrs } });
        continue;
      }
      stack.push({ nodes: [], openEnd: m.index + tok.length, hasChildPara: false });
    } else if (stack.length) {
      // <w:t> ; <w:t/> vide = texte ""
      stack[stack.length - 1]!.nodes.push({ start: m.index, end: m.index + tok.length, text: m[2] === "/" ? "" : decode(m[3] ?? "") });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

function tElement(text: string): string {
  const lines = text.split("\n");
  return lines.map((l) => `<w:t xml:space="preserve">${encode(l)}</w:t>`).join("<w:br/>");
}

// Une opération sur le texte d'un paragraphe : remplacer [start, end) par `insert`.
type Op = { start: number; end: number; insert: string };

// Applique des opérations au texte d'un paragraphe en le répartissant dans ses <w:t> d'origine.
function rewriteParagraph(p: Para, ops: Op[]): Array<{ start: number; end: number; xml: string }> {
  if (p.nodes.length === 0) return [];
  const owner: number[] = [];
  p.nodes.forEach((n, i) => {
    for (let k = 0; k < n.text.length; k++) owner.push(i);
  });
  const pieces = p.nodes.map(() => "");
  const sorted = [...ops].sort((a, b) => a.start - b.start);
  let i = 0;
  let o = 0;
  const ownerAt = (pos: number) => owner[Math.min(pos, owner.length - 1)] ?? p.nodes.length - 1;
  while (i <= p.text.length) {
    while (o < sorted.length && sorted[o]!.start === i) {
      const op = sorted[o]!;
      const k = ownerAt(op.start === p.text.length && op.start > 0 ? op.start - 1 : op.start);
      pieces[k] = (pieces[k] ?? "") + op.insert;
      i = Math.max(i, op.end);
      o++;
    }
    if (i >= p.text.length) break;
    const k = owner[i]!;
    pieces[k] = (pieces[k] ?? "") + p.text.charAt(i);
    i++;
  }
  return p.nodes.map((n, k) => ({ start: n.start, end: n.end, xml: tElement(pieces[k]!) }));
}

// ---------------------------------------------------------------- API ---------------------------

export type DocxParagraph = { index: number; text: string };

export class DocxTemplate {
  private entries: ZipEntry[];
  constructor(bytes: ArrayBuffer | Buffer) {
    this.entries = readZip(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
    if (!this.entries.some((e) => e.name === "word/document.xml")) throw new Error("Ce fichier n'est pas un document Word (.docx).");
  }

  private parts() {
    return this.entries.filter((e) => isTextPart(e.name)).sort((a, b) => partOrder(a.name, b.name));
  }

  private paragraphsByPart(): Array<{ entry: ZipEntry; xml: string; paras: Para[] }> {
    let next = 0;
    return this.parts().map((entry) => {
      const xml = entryText(entry);
      const paras = scanParagraphs(xml, entry.name, next);
      next += paras.length;
      return { entry, xml, paras };
    });
  }

  /** Paragraphes du document (texte, vides compris) -- index stables pour prepare(). */
  paragraphs(): DocxParagraph[] {
    return this.paragraphsByPart().flatMap((p) => p.paras.map((x) => ({ index: x.index, text: x.text })));
  }

  /** Balises {{...}} présentes. */
  tags(): string[] {
    const found = new Set<string>();
    for (const p of this.paragraphs()) for (const m of p.text.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)) found.add(m[1]!.toLowerCase());
    return [...found];
  }

  private rewrite(opsFor: (p: Para) => { ops: Op[]; fillEmpty?: string | null }) {
    const parts = this.paragraphsByPart();
    const replaced = new Map<string, ZipEntry>();
    for (const { entry, xml, paras } of parts) {
      const edits: Array<{ start: number; end: number; xml: string }> = [];
      for (const p of paras) {
        const { ops, fillEmpty } = opsFor(p);
        if (p.nodes.length === 0) {
          if (fillEmpty && p.selfClosing) edits.push({ start: p.selfClosing.start, end: p.selfClosing.end, xml: `<w:p${p.selfClosing.attrs}><w:r>${tElement(fillEmpty)}</w:r></w:p>` });
          else if (fillEmpty) edits.push({ start: p.closeAt, end: p.closeAt, xml: `<w:r>${p.pPrRunProps ?? ""}${tElement(fillEmpty)}</w:r>` });
          continue;
        }
        if (fillEmpty && !p.text.trim()) ops.push({ start: p.text.length, end: p.text.length, insert: fillEmpty });
        if (ops.length) edits.push(...rewriteParagraph(p, ops));
      }
      if (!edits.length) continue;
      edits.sort((a, b) => b.start - a.start);
      let out = xml;
      for (const e of edits) out = out.slice(0, e.start) + e.xml + out.slice(e.end);
      replaced.set(entry.name, withText(entry, out));
    }
    this.entries = this.entries.map((e) => replaced.get(e.name) ?? e);
  }

  /**
   * Prépare un modèle vierge : insère des balises aux endroits indiqués (repérés par Claude).
   * - replace : remplace le texte `find` du paragraphe par la balise (ex. « XXXX », « [date] ») ;
   * - after : ajoute la balise juste après le libellé `find` (ex. « Facture n° ») ;
   * - fill : paragraphe vide (ex. cellule à droite de « Date ») -> la balise y est écrite.
   */
  insertTags(placements: Array<{ paragraph: number; tag: string; mode: "replace" | "after" | "fill"; find?: string | null }>) {
    const byPara = new Map<number, typeof placements>();
    for (const pl of placements) byPara.set(pl.paragraph, [...(byPara.get(pl.paragraph) ?? []), pl]);
    let applied = 0;
    this.rewrite((p) => {
      const list = byPara.get(p.index) ?? [];
      const ops: Op[] = [];
      let fillEmpty: string | null = null;
      for (const pl of list) {
        const tag = `{{${pl.tag}}}`;
        if (pl.mode === "fill") {
          if (!p.text.trim()) {
            fillEmpty = fillEmpty ? `${fillEmpty} ${tag}` : tag;
            applied++;
          }
          continue;
        }
        const find = pl.find ?? "";
        const at = find ? p.text.indexOf(find) : -1;
        if (at < 0 || ops.some((o) => at < o.end && at + find.length > o.start)) continue;
        if (pl.mode === "replace") ops.push({ start: at, end: at + find.length, insert: tag });
        else ops.push({ start: at + find.length, end: at + find.length, insert: ` ${tag}` });
        applied++;
      }
      return { ops, fillEmpty };
    });
    return applied;
  }

  /** Remplace chaque {{balise}} par sa valeur (balise inconnue -> laissée vide). */
  fill(values: Record<string, string>) {
    this.rewrite((p) => {
      const ops: Op[] = [];
      for (const m of p.text.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)) {
        ops.push({ start: m.index!, end: m.index! + m[0].length, insert: values[m[1]!.toLowerCase()] ?? "" });
      }
      return { ops };
    });
  }

  toBuffer(): Buffer {
    return writeZip(this.entries);
  }
}
