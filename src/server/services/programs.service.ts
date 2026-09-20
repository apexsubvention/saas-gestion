import type { SupabaseClient } from "@supabase/supabase-js";
import { programsRepository, type ProgramRow, type ProgramWrite } from "@/server/repositories/programs.repository";
import { programExamplesRepository } from "@/server/repositories/programExamples.repository";
import { createProgramSchema, updateProgramSchema, type CreateProgramInput, type UpdateProgramInput } from "@/features/programs/schemas";
import { readProgramFromUrl } from "@/features/programs/reader/readProgram";
import type { ProgramReadResult } from "@/features/programs/reader/types";

// Colonnes issues d'une lecture. Seules les valeurs réellement trouvées sont renvoyées :
// une relecture ne doit jamais effacer une donnée existante avec un null.
function readToColumns(read: ProgramReadResult): ProgramWrite {
  const f = read.fields;
  const cols: ProgramWrite = {
    last_read_at: new Date().toISOString(),
    read_status: read.status,
    read_error: read.error,
    extraction_method: read.method,
  };
  if (f.name) cols.name = f.name;
  if (f.agency) cols.agency = f.agency;
  if (f.description) cols.description = f.description;
  if (f.program_type) cols.program_type = f.program_type;
  if (f.territory) cols.territory = f.territory;
  if (f.aid_rate != null) cols.typical_aid_rate = f.aid_rate;
  if (f.max_aid_amount != null) cols.max_aid_amount = f.max_aid_amount;
  if (f.min_eligible_spend != null) cols.min_eligible_spend = f.min_eligible_spend;
  if (f.aid_notes) cols.aid_notes = f.aid_notes;
  if (f.open_date) cols.open_date = f.open_date;
  if (f.deadline) cols.deadline = f.deadline;
  if (f.filing_notes) cols.filing_notes = f.filing_notes;
  if (f.availability_status) cols.availability_status = f.availability_status;
  if (f.eligible_expenses) cols.eligible_expenses = f.eligible_expenses;
  if (f.ineligible_expenses) cols.ineligible_expenses = f.ineligible_expenses;
  if (f.application_process) cols.application_process = f.application_process;
  if (f.claim_process) cols.claim_process = f.claim_process;
  if (f.required_documents.length) cols.required_documents = f.required_documents;
  if (f.government_priorities.length) cols.government_priorities = f.government_priorities;
  if (read.resourceLinks.length) cols.resource_links = read.resourceLinks;
  if (read.sourceText) cols.source_text = read.sourceText;
  return cols;
}

// Ne garde que les colonnes que la fiche n'a pas déjà remplies (les métadonnées de lecture sont
// toujours mises à jour). Sert quand l'URL vient d'être ajoutée : on complète sans écraser ce que
// l'utilisateur a saisi ou corrigé à la main.
const ALWAYS_UPDATED = new Set(["last_read_at", "read_status", "read_error", "extraction_method", "source_text"]);
function keepOnlyEmptyFields(cols: ProgramWrite, existing: ProgramRow): ProgramWrite {
  const isEmpty = (v: unknown) => v == null || v === "" || (Array.isArray(v) && v.length === 0);
  const out: Record<string, unknown> = { ...cols };
  for (const key of Object.keys(out)) {
    if (ALWAYS_UPDATED.has(key)) continue;
    const current = (existing as Record<string, unknown>)[key];
    const empty = key === "availability_status" ? current === "unknown" : isEmpty(current);
    if (!empty) delete out[key];
  }
  return out as ProgramWrite;
}

export function programsService(supabase: SupabaseClient) {
  const repo = programsRepository(supabase);
  const examples = programExamplesRepository(supabase);

  async function saveExamples(program: ProgramRow, read: ProgramReadResult) {
    await examples.addMany(
      read.examples.map((e) => ({
        organization_id: program.organization_id,
        program_id: program.id,
        title: e.title,
        recipient_name: e.recipient_name,
        description: e.description,
        amount: e.amount,
        location: e.location,
        source_url: e.source_url,
        source_kind: "program_page" as const,
      }))
    );
  }

  return {
    list: () => repo.list(),
    get: (id: string) => repo.findById(id),
    findBySourceUrl: (url: string) => repo.findBySourceUrl(url),
    listExamples: (programId: string) => examples.listByProgram(programId),
    listAllExamples: () => examples.listAll(),

    // `read` : résultat d'une lecture d'URL déjà faite (l'action la fait avant, pour pouvoir
    // reprendre le nom de la page). Les champs saisis à la main l'emportent sur la lecture.
    async create(organizationId: string, input: CreateProgramInput, read?: ProgramReadResult) {
      const parsed = createProgramSchema.parse(input);
      const fromRead = read ? readToColumns(read) : {};
      const name = parsed.name || (fromRead.name as string | undefined);
      if (!name) throw new Error("Nom requis.");

      const program = await repo.create({
        ...fromRead,
        organization_id: organizationId,
        name,
        agency: parsed.agency || fromRead.agency || null,
        description: parsed.description || fromRead.description || null,
        program_type: parsed.program_type || fromRead.program_type || null,
        territory: parsed.territory || fromRead.territory || null,
        source_url: parsed.source_url || null,
      });
      if (read) await saveExamples(program, read);
      return program;
    },

    // Relit la page source : met à jour les champs trouvés (sans effacer les autres) et ajoute
    // les nouveaux exemples. Renvoie le résultat de lecture pour que l'appelant l'affiche.
    async reread(id: string, opts: { fillEmptyOnly?: boolean } = {}): Promise<ProgramReadResult> {
      const program = await repo.findById(id);
      if (!program) throw new Error("Programme introuvable.");
      if (!program.source_url) throw new Error("Ce programme n'a pas d'URL source à relire.");

      const read = await readProgramFromUrl(program.source_url);
      // Le nom saisi par l'utilisateur n'est jamais remplacé par le titre de la page.
      const { name: _name, ...allColumns } = readToColumns(read);
      const columns = opts.fillEmptyOnly ? keepOnlyEmptyFields(allColumns, program) : allColumns;
      await repo.update(id, columns);
      await saveExamples(program, read);
      return read;
    },

    async update(id: string, input: UpdateProgramInput) {
      const p = updateProgramSchema.parse(input);
      return repo.update(id, {
        name: p.name,
        agency: p.agency || null,
        program_type: p.program_type || null,
        territory: p.territory || null,
        description: p.description || null,
        source_url: p.source_url || null,
        typical_aid_rate: p.aid_rate_percent == null ? null : p.aid_rate_percent / 100,
        max_aid_amount: p.max_aid_amount,
        min_eligible_spend: p.min_eligible_spend,
        open_date: p.open_date,
        deadline: p.deadline,
        filing_notes: p.filing_notes || null,
        availability_status: p.availability_status,
        aid_notes: p.aid_notes || null,
        eligible_expenses: p.eligible_expenses || null,
        ineligible_expenses: p.ineligible_expenses || null,
        application_process: p.application_process || null,
        claim_process: p.claim_process || null,
        required_documents: p.required_documents,
      });
    },

    // Exemples trouvés hors de la page du programme (ex. Subventions ouvertes du Canada).
    async addExamples(program: ProgramRow, rows: Array<{ title: string; recipient_name: string | null; description: string | null; amount: number | null; location: string | null; source_url: string }>, kind: "open_canada" | "manual") {
      await examples.addMany(rows.map((r) => ({ ...r, organization_id: program.organization_id, program_id: program.id, source_kind: kind })));
    },
  };
}
