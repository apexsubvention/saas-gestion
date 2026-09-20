// Choix des pages liées à lire en plus de la page principale (exemples de projets financés,
// admissibilité, réclamation...) et repérage des documents (guides, formulaires).
import { normalizeSearchText } from "@/features/watch/search";
import type { PageLink } from "./html";
import type { ResourceLinkKind } from "./types";

const DOC_EXT = /\.(pdf|docx?|xlsx?|pptx?|zip)(\?|$)/i;
const SKIP_EXT = /\.(png|jpe?g|gif|svg|webp|ico|css|js|mp4|mov|mp3)(\?|$)/i;

const RELATED_KEYWORDS: Array<{ re: RegExp; weight: number }> = [
  { re: /exemple|projets? (finance|soutenu|realise|admis|retenu)|realisation|temoignage|success|histoire|beneficiaire|funded projects?|case stud|recipients?/, weight: 5 },
  { re: /reclamation|remboursement|demande de paiement|claims?|reimbursement|paiement/, weight: 4 },
  { re: /admissib|eligib|criteres|qui peut|who can/, weight: 3 },
  { re: /comment (presenter|deposer|faire)|how to apply|deposer une demande|processus|demarche/, weight: 3 },
  { re: /depenses|expenses|documents? (a|requis)|pieces? justificatives?/, weight: 2 },
  { re: /guide|formulaire|foire aux questions|faq/, weight: 1 },
];

function hostKey(hostname: string) {
  return hostname.replace(/^www\./, "").toLowerCase();
}

export function isSameSite(a: string, b: string): boolean {
  try {
    const ha = hostKey(new URL(a).hostname);
    const hb = hostKey(new URL(b).hostname);
    return ha === hb || ha.endsWith(`.${hb}`) || hb.endsWith(`.${ha}`);
  } catch {
    return false;
  }
}

export function isDocumentUrl(url: string) {
  return DOC_EXT.test(url);
}

/** Pages HTML du même site à lire en plus de la page principale, les plus utiles d'abord. */
export function pickRelatedPages(links: PageLink[], baseUrl: string, max = 4): PageLink[] {
  const base = new URL(baseUrl);
  return links
    .filter((l) => isSameSite(l.url, baseUrl) && !isDocumentUrl(l.url) && !SKIP_EXT.test(l.url) && l.url !== baseUrl)
    .map((l) => {
      const path = decodeURIComponent(new URL(l.url).pathname);
      const hay = normalizeSearchText(`${l.label} ${path}`);
      const score = RELATED_KEYWORDS.reduce((s, k) => (k.re.test(hay) ? s + k.weight : s), 0);
      // Une sous-page du même chemin que le programme est plus probablement pertinente.
      const nearby = new URL(l.url).pathname.startsWith(base.pathname.replace(/\/[^/]*$/, "/")) ? 1 : 0;
      return { link: l, score: score + nearby };
    })
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.link);
}

/** Liens candidats (documents + pages utiles) proposés à l'extraction et à l'affichage. */
export function candidateResourceLinks(links: PageLink[], max = 60): Array<PageLink & { kind: ResourceLinkKind }> {
  const out: Array<PageLink & { kind: ResourceLinkKind; score: number }> = [];
  for (const l of links) {
    if (SKIP_EXT.test(l.url) || !l.label) continue;
    const hay = normalizeSearchText(`${l.label} ${l.url}`);
    const isDoc = isDocumentUrl(l.url);
    const kind: ResourceLinkKind = /formulaire|form\b|gabarit|template/.test(hay)
      ? "formulaire"
      : /exemple|projets? finance|success|temoignage/.test(hay)
        ? "exemple"
        : /guide|directive|cadre normatif|normes?|modalites|instructions/.test(hay)
          ? "guide"
          : "autre";
    const score = (isDoc ? 3 : 0) + (kind !== "autre" ? 3 : 0) + RELATED_KEYWORDS.reduce((s, k) => (k.re.test(hay) ? s + 1 : s), 0);
    if (score >= 3) out.push({ ...l, kind, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, max).map(({ score: _score, ...rest }) => rest);
}
