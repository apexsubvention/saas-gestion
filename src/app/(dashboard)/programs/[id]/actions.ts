"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { programsService } from "@/server/services/programs.service";
import { updateProgramSchema } from "@/features/programs/schemas";
import { parsePublicUrl } from "@/features/programs/reader/safeFetch";
import { formatCaughtError } from "@/lib/errors";

// Les retours passent par un CODE dans l'URL (jamais un texte libre) : la page le traduit
// elle-même, donc un lien forgé ne peut pas afficher un message arbitraire.
type ProgramNotice =
  | "reread_ok"
  | "reread_partial"
  | "reread_failed"
  | "url_read_ok"
  | "url_read_partial"
  | "url_read_failed"
  | "examples_none"
  | "examples_unsupported"
  | "examples_failed"
  | `examples_added_${number}`;

function done(programId: string, notice: ProgramNotice): never {
  revalidatePath(`/programs/${programId}`);
  revalidatePath("/programs");
  redirect(`/programs/${programId}?notice=${notice}`);
}

export async function rereadProgramAction(programId: string) {
  await requireOrgContext();
  const supabase = await createClient();
  let notice: ProgramNotice;
  try {
    const read = await programsService(supabase).reread(programId);
    notice = read.status === "ok" ? "reread_ok" : read.status === "partial" ? "reread_partial" : "reread_failed";
  } catch {
    notice = "reread_failed";
  }
  done(programId, notice);
}

export async function findOpenCanadaExamplesAction(programId: string) {
  await requireOrgContext();
  const supabase = await createClient();
  const service = programsService(supabase);
  let notice: ProgramNotice;
  try {
    const program = await service.get(programId);
    if (!program) throw new Error("Programme introuvable.");
    const { collectOpenCanadaAwards, supportsOpenCanadaAwards } = await import("@/features/watch/connectors/openCanadaAwards");
    const hint = `${program.name} ${program.agency ?? ""}`;
    if (!supportsOpenCanadaAwards(hint)) {
      notice = "examples_unsupported";
    } else {
      const awards = await collectOpenCanadaAwards(hint, 8);
      const rows = awards
        .map((a) => ({
          title: (a.projectTitle ?? a.recipientName ?? "").slice(0, 300),
          recipient_name: a.recipientName,
          description: a.description ? a.description.slice(0, 1000) : null,
          amount: a.amount,
          location: a.location,
          source_url: a.sourceUrl,
        }))
        .filter((r) => r.title);
      await service.addExamples(program, rows, "open_canada");
      notice = rows.length ? (`examples_added_${rows.length}` as ProgramNotice) : "examples_none";
    }
  } catch {
    notice = "examples_failed";
  }
  done(programId, notice);
}

export type UpdateProgramFormState = { error: string | null; savedAt: number | null };

// « 50 », « 50,5 », « 100 000 » -> nombre ; vide -> null ; invalide -> NaN (refusé par zod).
function numberOrNull(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").replace(/\s| /g, "").replace(",", ".").replace(/\$|%/g, "");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : Number.NaN;
}

function dateOrNull(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

export async function updateProgramAction(
  programId: string,
  _prev: UpdateProgramFormState,
  formData: FormData
): Promise<UpdateProgramFormState> {
  await requireOrgContext();

  const text = (k: string) => String(formData.get(k) ?? "");
  const parsed = updateProgramSchema.safeParse({
    name: text("name"),
    agency: text("agency"),
    program_type: text("program_type"),
    territory: text("territory"),
    description: text("description"),
    source_url: text("source_url"),
    aid_rate_percent: numberOrNull(formData.get("aid_rate_percent")),
    max_aid_amount: numberOrNull(formData.get("max_aid_amount")),
    min_eligible_spend: numberOrNull(formData.get("min_eligible_spend")),
    open_date: dateOrNull(formData.get("open_date")),
    deadline: dateOrNull(formData.get("deadline")),
    filing_notes: text("filing_notes"),
    availability_status: text("availability_status") || "unknown",
    aid_notes: text("aid_notes"),
    eligible_expenses: text("eligible_expenses"),
    ineligible_expenses: text("ineligible_expenses"),
    application_process: text("application_process"),
    claim_process: text("claim_process"),
    required_documents: text("required_documents")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    return { error: `${issue?.message ?? "Formulaire invalide"}${field ? ` (${String(field)})` : ""}`, savedAt: null };
  }

  if (parsed.data.source_url) {
    try {
      parsePublicUrl(parsed.data.source_url); // refuse javascript:, ftp:, etc.
    } catch (e) {
      return { error: formatCaughtError(e), savedAt: null };
    }
  }

  const supabase = await createClient();
  const service = programsService(supabase);
  let notice: ProgramNotice | null = null;
  try {
    const before = await service.get(programId);
    await service.update(programId, parsed.data);

    // URL ajoutée ou changée (ou jamais lue) : on lit la page et on complète les champs VIDES,
    // sans écraser ce qui vient d'être saisi dans ce même formulaire.
    const newUrl = parsed.data.source_url || null;
    if (newUrl && ((before?.source_url ?? null) !== newUrl || before?.read_status === "never")) {
      const read = await service.reread(programId, { fillEmptyOnly: true });
      notice = read.status === "ok" ? "url_read_ok" : read.status === "partial" ? "url_read_partial" : "url_read_failed";
    }
  } catch (e) {
    return { error: formatCaughtError(e), savedAt: null };
  }
  if (notice) done(programId, notice); // recharge la fiche avec les informations trouvées
  revalidatePath(`/programs/${programId}`);
  revalidatePath("/programs");
  return { error: null, savedAt: Date.now() };
}
