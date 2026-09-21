// Documents fournis à l'assistant « Pose-moi tes questions » sur un programme.
//
// Ordre de priorité des sources (le plus fiable d'abord) : pages officielles, guides PDF officiels,
// puis la fiche Apex (données structurées, éventuellement corrigées à la main), puis l'information client.
// Chaque document est envoyé avec les citations activées : l'API renvoie l'endroit exact (page d'un PDF,
// passage d'un texte) qui appuie chaque affirmation.
import type { ProgramRow } from "@/server/repositories/programs.repository";

export type DocKind = "official_page" | "guide_pdf" | "apex_sheet" | "client_info";


const PAGE_MARKER = /^=== PAGE : (\S+) ===$/gm;

/** Découpe source_text en pages (marqueurs posés par la lecture) ; sans marqueur : une seule page. */
export function splitSourcePages(sourceText: string | null, fallbackUrl: string | null): Array<{ url: string | null; text: string }> {
  const text = (sourceText ?? "").trim();
  if (!text) return [];
  const markers = [...text.matchAll(PAGE_MARKER)];
  if (markers.length === 0) return [{ url: fallbackUrl, text }];
  return markers
    .map((m, i) => {
      const start = (m.index ?? 0) + m[0].length;
      const end = i + 1 < markers.length ? (markers[i + 1]!.index ?? text.length) : text.length;
      return { url: m[1] ?? null, text: text.slice(start, end).trim() };
    })
    .filter((p) => p.text.length > 0);
}

const money = (n: number | null) => (n == null ? "non précisé" : new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n));

/** Fiche Apex : données structurées du programme telles qu'enregistrées (peuvent avoir été corrigées à la main). */
export function apexSheetText(p: ProgramRow): string {
  const lines = [
    `Programme : ${p.name}`,
    p.agency && `Organisme : ${p.agency}`,
    p.territory && `Territoire : ${p.territory}`,
    p.program_type && `Type : ${p.program_type}`,
    p.description && `Description : ${p.description}`,
    `Taux d'aide maximal : ${p.typical_aid_rate == null ? "non précisé" : `${Math.round(p.typical_aid_rate * 10000) / 100} %`}`,
    `Montant maximal : ${money(p.max_aid_amount)}`,
    `Dépenses minimales : ${money(p.min_eligible_spend)}`,
    p.aid_notes && `Formule d'aide : ${p.aid_notes}`,
    `Date d'ouverture : ${p.open_date ?? "non précisée"} ; date limite : ${p.deadline ?? "non précisée"} ; statut : ${p.availability_status}`,
    p.filing_notes && `Périodes de dépôt : ${p.filing_notes}`,
    p.eligible_expenses && `Dépenses admissibles :\n${p.eligible_expenses}`,
    p.ineligible_expenses && `Dépenses non admissibles :\n${p.ineligible_expenses}`,
    p.application_process && `Processus de demande :\n${p.application_process}`,
    p.claim_process && `Réclamation / remboursement :\n${p.claim_process}`,
    p.required_documents && p.required_documents.length > 0 && `Documents à préparer :\n- ${p.required_documents.join("\n- ")}`,
    p.government_priorities.length > 0 && `Priorités : ${p.government_priorities.join(", ")}`,
  ].filter(Boolean);
  return lines.join("\n");
}

/** Guides PDF candidats : liens de type « guide » pointant vers un PDF, les 2 premiers. */
export function guideCandidates(p: ProgramRow, max = 2): Array<{ label: string; url: string }> {
  return (p.resource_links ?? [])
    .filter((l) => l.kind === "guide" && /\.pdf(\?|$)/i.test(l.url))
    .slice(0, max)
    .map((l) => ({ label: l.label || l.url, url: l.url }));
}

export function clientInfoText(c: { name: string; sector: string | null; website: string | null; current_needs: string | null; notes: string | null }): string {
  return [
    `Client : ${c.name}`,
    c.sector && `Secteur : ${c.sector}`,
    c.website && `Site Web : ${c.website}`,
    `Besoins actuels : ${c.current_needs?.trim() || "non renseignés"}`,
    c.notes && `Notes : ${c.notes}`,
  ].filter(Boolean).join("\n");
}
