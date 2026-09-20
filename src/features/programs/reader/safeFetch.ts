// Téléchargement sécurisé d'une page saisie par un utilisateur.
//
// L'URL d'un programme est une entrée non fiable : sans garde-fou, le serveur pourrait être
// amené à requêter le réseau interne (localhost, métadonnées cloud 169.254.169.254, IP privées).
// On n'accepte donc que http(s) vers des adresses publiques, on revalide chaque redirection,
// et on borne le temps et la taille de la réponse.
//
// Limite connue : la résolution DNS est vérifiée avant la requête mais la requête résout à
// nouveau le nom (fenêtre de "DNS rebinding"). Acceptable ici : outil interne réservé au
// personnel authentifié, réponse jamais renvoyée telle quelle au navigateur.
import { lookup } from "node:dns/promises";
import net from "node:net";

export class UnsafeUrlError extends Error {}

const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 4;

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  const [a, b] = parts;
  if (parts.length !== 4 || a === undefined || b === undefined || parts.some((p) => Number.isNaN(p))) return true;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local + métadonnées cloud
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast + réservé
  );
}

export function isPrivateIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) return isPrivateIpv4(mapped[1]);
    return /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || lower.startsWith("ff");
  }
  return true; // pas une IP valide : on refuse par défaut
}

export function parsePublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UnsafeUrlError("URL invalide.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Seules les URL http(s) sont acceptées.");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("Les URL avec identifiants ne sont pas acceptées.");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new UnsafeUrlError("Port non autorisé.");
  }
  return url;
}

async function assertPublicHost(hostname: string) {
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (bare === "localhost" || bare.endsWith(".localhost") || bare.endsWith(".local") || bare.endsWith(".internal")) {
    throw new UnsafeUrlError("Adresse non publique refusée.");
  }
  if (net.isIP(bare)) {
    if (isPrivateIp(bare)) throw new UnsafeUrlError("Adresse non publique refusée.");
    return;
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(bare, { all: true });
  } catch {
    throw new UnsafeUrlError("Nom de domaine introuvable.");
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
    throw new UnsafeUrlError("Adresse non publique refusée.");
  }
}

export type FetchedPage = { url: string; contentType: string; html: string };

const ACCEPTED_TYPES = ["text/html", "application/xhtml+xml", "text/plain"];

async function readCapped(res: Response): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      await reader.cancel();
      break; // page tronquée : on garde ce qui a été lu
    }
    chunks.push(value);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export async function fetchPublicPage(rawUrl: string): Promise<FetchedPage> {
  let url = parsePublicUrl(rawUrl);
  const deadline = AbortSignal.timeout(TIMEOUT_MS);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublicHost(url.hostname);
    const res = await fetch(url, {
      redirect: "manual",
      cache: "no-store",
      signal: deadline,
      headers: {
        "User-Agent": "ApexProgramReader/1.0 (+lecture de page de programme)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.8",
        "Accept-Language": "fr-CA,fr;q=0.9,en;q=0.6",
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error(`Redirection sans destination (HTTP ${res.status}).`);
      url = parsePublicUrl(new URL(location, url).toString());
      continue;
    }
    if (!res.ok) throw new Error(`La page a répondu HTTP ${res.status}.`);

    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!ACCEPTED_TYPES.some((t) => contentType.includes(t))) {
      throw new Error(`Type de contenu non pris en charge (${contentType || "inconnu"}) : seule une page web peut être lue, pas un PDF.`);
    }

    const bytes = await readCapped(res);
    const charset = contentType.match(/charset=([\w-]+)/)?.[1] ?? "utf-8";
    let html: string;
    try {
      html = new TextDecoder(charset).decode(bytes);
    } catch {
      html = new TextDecoder("utf-8").decode(bytes);
    }
    return { url: url.toString(), contentType, html };
  }
  throw new Error("Trop de redirections.");
}
