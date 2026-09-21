// Snapshot des règles d'un programme au moment de la création d'un dossier (ou à la demande).
// Un snapshot n'est JAMAIS modifié : si le programme change six mois plus tard, le dossier historique reste
// lié aux règles connues à sa création. buildProgramSnapshot est pure ; diffSnapshot montre ce qui a changé depuis.
import type { ProgramRow } from "@/server/repositories/programs.repository";

export type ProgramSnapshot = {
  captured_program_id: string;
  name: string;
  agency: string | null;
  territory: string | null;
  program_type: string | null;
  description: string | null;
  typical_aid_rate: number | null;
  max_aid_amount: number | null;
  min_eligible_spend: number | null;
  aid_notes: string | null;
  open_date: string | null;
  deadline: string | null;
  filing_notes: string | null;
  availability_status: string;
  eligible_expenses: string | null;
  ineligible_expenses: string | null;
  application_process: string | null;
  claim_process: string | null;
  required_documents: string[];
  government_priorities: string[];
  resource_links: Array<{ label: string; url: string; kind: string }>; // guides et formulaires utilisés
  source: { url: string | null; last_read_at: string | null; extraction_method: string | null };
  source_text: string | null; // texte des pages officielles à cette date (base des citations)
};

export function buildProgramSnapshot(p: ProgramRow): ProgramSnapshot {
  return {
    captured_program_id: p.id,
    name: p.name,
    agency: p.agency,
    territory: p.territory,
    program_type: p.program_type,
    description: p.description,
    typical_aid_rate: p.typical_aid_rate == null ? null : Number(p.typical_aid_rate),
    max_aid_amount: p.max_aid_amount == null ? null : Number(p.max_aid_amount),
    min_eligible_spend: p.min_eligible_spend == null ? null : Number(p.min_eligible_spend),
    aid_notes: p.aid_notes,
    open_date: p.open_date,
    deadline: p.deadline,
    filing_notes: p.filing_notes,
    availability_status: p.availability_status,
    eligible_expenses: p.eligible_expenses,
    ineligible_expenses: p.ineligible_expenses,
    application_process: p.application_process,
    claim_process: p.claim_process,
    required_documents: [...(p.required_documents ?? [])],
    government_priorities: [...(p.government_priorities ?? [])],
    resource_links: (p.resource_links ?? []).map((l) => ({ label: l.label, url: l.url, kind: l.kind })),
    source: { url: p.source_url, last_read_at: p.last_read_at, extraction_method: p.extraction_method },
    source_text: p.source_text,
  };
}

type Field = { key: keyof ProgramSnapshot; label: string; format: (v: unknown) => string };
const text = (v: unknown) => (v == null || v === "" ? "—" : String(v));
const money = (v: unknown) => (v == null ? "—" : new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(Number(v)));
const percent = (v: unknown) => (v == null ? "—" : `${Math.round(Number(v) * 10000) / 100} %`);
const list = (v: unknown) => (Array.isArray(v) && v.length > 0 ? v.join(", ") : "—");
const status: Record<string, string> = { open: "Ouvert", opening_soon: "Ouverture bientôt", continuous: "En continu", closed: "Fermé", unknown: "À confirmer" };

// Champs comparés (les plus décisifs pour un dossier) et leur affichage.
export const SNAPSHOT_FIELDS: Field[] = [
  { key: "typical_aid_rate", label: "% remboursé (max.)", format: percent },
  { key: "max_aid_amount", label: "Montant maximal", format: money },
  { key: "min_eligible_spend", label: "Dépenses minimales", format: money },
  { key: "aid_notes", label: "Formule d'aide", format: text },
  { key: "open_date", label: "Ouverture des dépôts", format: text },
  { key: "deadline", label: "Date limite de dépôt", format: text },
  { key: "availability_status", label: "Disponibilité", format: (v) => status[String(v)] ?? text(v) },
  { key: "eligible_expenses", label: "Dépenses admissibles", format: text },
  { key: "ineligible_expenses", label: "Dépenses non admissibles", format: text },
  { key: "application_process", label: "Processus de demande", format: text },
  { key: "claim_process", label: "Réclamation", format: text },
  { key: "required_documents", label: "Documents à préparer", format: list },
  { key: "government_priorities", label: "Priorités", format: list },
];

const norm = (v: unknown) => (Array.isArray(v) ? JSON.stringify([...v].map(String).sort()) : v == null || v === "" ? null : typeof v === "number" ? Math.round(v * 1e6) / 1e6 : String(v));

export type SnapshotChange = { label: string; before: string; after: string };

/** Ce qui a changé dans le programme depuis le snapshot (valeurs en lecture seule, formatées). */
export function diffSnapshot(snapshot: Partial<ProgramSnapshot>, current: ProgramRow): SnapshotChange[] {
  const now = buildProgramSnapshot(current);
  const changes: SnapshotChange[] = [];
  for (const f of SNAPSHOT_FIELDS) {
    const before = snapshot[f.key];
    const after = now[f.key];
    if (JSON.stringify(norm(before)) !== JSON.stringify(norm(after))) {
      changes.push({ label: f.label, before: f.format(before), after: f.format(after) });
    }
  }
  return changes;
}
