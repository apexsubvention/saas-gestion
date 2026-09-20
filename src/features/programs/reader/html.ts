// Conversion HTML -> texte structuré + extraction de liens, sans dépendance.
// On garde les titres (« ## ») et les puces (« - ») : c'est ce qui permet à l'extraction de
// distinguer « Dépenses admissibles » de « Documents à fournir » dans une page à sections.

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">",
  eacute: "é", egrave: "è", ecirc: "ê", euml: "ë", agrave: "à", acirc: "â", ccedil: "ç",
  icirc: "î", iuml: "ï", ocirc: "ô", ugrave: "ù", ucirc: "û", Eacute: "É", Egrave: "È",
  Agrave: "À", Ccedil: "Ç", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", laquo: "«",
  raquo: "»", ndash: "–", mdash: "—", hellip: "…", oelig: "œ", euro: "€",
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith("#")) {
      const code = body[1]?.toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body] ?? whole;
  });
}

export function htmlToStructuredText(html: string): string {
  const body = html
    .replace(/<(script|style|noscript|svg|template|nav|footer)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  return decodeEntities(
    body
      .replace(/<h[1-6][^>]*>/gi, "\n\n## ")
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<\/(p|div|section|article|ul|ol|table|h[1-6])>|<br\s*\/?>|<\/tr>/gi, "\n")
      .replace(/<\/t[dh]>/gi, " | ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t\r\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractTitle(html: string): string | null {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i)?.[1];
  const pick = [h1, og, title].map((v) => (v ? decodeEntities(v.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() : "")).find((v) => v.length > 2);
  return pick ? pick.slice(0, 200) : null;
}

export function extractMetaDescription(html: string): string | null {
  const m =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] ??
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i)?.[1];
  const text = m ? decodeEntities(m).replace(/\s+/g, " ").trim() : "";
  return text.length > 10 ? text.slice(0, 600) : null;
}

export type PageLink = { url: string; label: string };

export function extractLinks(html: string, baseUrl: string): PageLink[] {
  const seen = new Set<string>();
  const links: PageLink[] = [];
  for (const m of html.matchAll(/<a\s[^>]*?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1]?.trim();
    if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) continue;
    let url: URL;
    try {
      url = new URL(decodeEntities(href), baseUrl);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    url.hash = "";
    const key = url.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    const label = decodeEntities((m[2] ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    links.push({ url: key, label: label.slice(0, 160) });
  }
  return links;
}
