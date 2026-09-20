// Import ponctuel des ~20 dossiers clients réels fournis par l'utilisateur (zip
// "Demande de sub - APEX"). Idempotent au niveau client / projet : peut être relancé sans
// dupliquer les clients ni les grant_projects déjà importés (les enfants d'un projet déjà
// existant — entente, fournisseurs, factures, réclamations — ne sont PAS réinsérés non plus,
// pour éviter les doublons si un import partiel est relancé).
//
// Politique anti-invention : ce module ne fait que retranscrire src/server/import-data/*.json,
// qui a déjà été construit sans jamais deviner de valeur absente (voir apexClientsSeed.types.ts).

import type { SupabaseClient } from "@supabase/supabase-js";
import { clientsRepository } from "@/server/repositories/clients.repository";
import { programsRepository } from "@/server/repositories/programs.repository";
import { grantProjectsRepository } from "@/server/repositories/grantProjects.repository";
import { grantAgreementsRepository } from "@/server/repositories/grantAgreements.repository";
import { projectSuppliersRepository } from "@/server/repositories/projectSuppliers.repository";
import { expensesRepository } from "@/server/repositories/expenses.repository";
import { claimsRepository } from "@/server/repositories/claims.repository";
import type { ApexClientsSeed, SeedProject } from "./apexClientsSeed.types";

export type ImportSummary = {
  clientsCreated: string[];
  clientsReused: string[];
  programsCreated: string[];
  projectsCreated: string[];
  projectsSkippedExisting: string[];
  agreementsCreated: number;
  suppliersCreated: number;
  expensesCreated: number;
  claimsCreated: number;
  errors: Array<{ context: string; message: string }>;
};

// Une erreur Supabase (PostgrestError / AuthError / StorageError) n'est PAS une instance de
// Error : c'est un objet brut {message, details, hint, code}. `e instanceof Error` est donc
// `false` pour elle, et `String(e)` retombe sur "[object Object]" — c'est la cause du bug
// d'affichage. Cette fonction extrait le vrai message dans tous les cas rencontrés ici.
function formatCaughtError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const obj = e as Record<string, unknown>;
    const parts = [obj.message, obj.details, obj.hint, obj.code]
      .filter((v) => typeof v === "string" && v.length > 0)
      .map((v, i) => (i === 0 ? String(v) : `[${["message", "details", "hint", "code"][i]}: ${v}]`));
    if (parts.length > 0) return parts.join(" ");
    try {
      return JSON.stringify(obj);
    } catch {
      return "Erreur non sérialisable (voir logs serveur Vercel).";
    }
  }
  return String(e);
}

function normalizeRate(rate: number | null): number | null {
  if (rate === null || rate === undefined) return null;
  if (rate > 1) return rate / 100; // garde-fou si un taux a été extrait en "%"
  if (rate < 0) return null;
  return rate;
}

export async function runApexClientsImport(
  supabase: SupabaseClient,
  organizationId: string,
  ownerId: string,
  seed: ApexClientsSeed
): Promise<ImportSummary> {
  const clients = clientsRepository(supabase);
  const programs = programsRepository(supabase);
  const grantProjects = grantProjectsRepository(supabase);
  const grantAgreements = grantAgreementsRepository(supabase);
  const projectSuppliers = projectSuppliersRepository(supabase);
  const expenses = expensesRepository(supabase);
  const claims = claimsRepository(supabase);

  const summary: ImportSummary = {
    clientsCreated: [],
    clientsReused: [],
    programsCreated: [],
    projectsCreated: [],
    projectsSkippedExisting: [],
    agreementsCreated: 0,
    suppliersCreated: 0,
    expensesCreated: 0,
    claimsCreated: 0,
    errors: [],
  };

  const programCache = new Map<string, string>(); // nom normalisé -> id

  async function resolveProgramId(programName: string): Promise<string> {
    const key = programName.trim().toLowerCase();
    const cached = programCache.get(key);
    if (cached) return cached;
    const existing = await programs.findByName(programName);
    if (existing) {
      programCache.set(key, existing.id);
      return existing.id;
    }
    const created = await programs.create({ organization_id: organizationId, name: programName.trim() });
    programCache.set(key, created.id);
    summary.programsCreated.push(created.name);
    return created.id;
  }

  async function importProject(clientId: string, project: SeedProject) {
    try {
      const programId = await resolveProgramId(project.program_name);
      const existing = await grantProjects.findExisting(clientId, programId, project.name);
      if (existing) {
        summary.projectsSkippedExisting.push(`${project.name} (${project.program_name})`);
        return;
      }

      const created = await grantProjects.create({
        organization_id: organizationId,
        client_id: clientId,
        program_id: programId,
        name: project.name,
        owner_id: ownerId,
        status: project.status,
        description: project.description,
        total_project_cost: project.total_project_cost,
        approved_grant_amount: project.approved_grant_amount,
        grant_rate: normalizeRate(project.grant_rate),
        official_start_date: project.official_start_date,
        official_end_date: project.official_end_date,
      });
      summary.projectsCreated.push(`${project.name} (${project.program_name})`);

      if (project.agreement) {
        await grantAgreements.create({
          organization_id: organizationId,
          grant_project_id: created.id,
          project_start: project.agreement.project_start,
          project_end: project.agreement.project_end,
          eligible_expense_period_start: project.agreement.eligible_expense_period_start,
          eligible_expense_period_end: project.agreement.eligible_expense_period_end,
          grant_amount: project.agreement.grant_amount,
          grant_rate: normalizeRate(project.agreement.grant_rate),
          special_conditions: project.agreement.special_conditions,
        });
        summary.agreementsCreated += 1;
      }

      const supplierIdByName = new Map<string, string>();
      for (const s of project.suppliers) {
        if (!s.name) continue;
        const supplierRow = await projectSuppliers.create({
          organization_id: organizationId,
          grant_project_id: created.id,
          name: s.name,
          contact: s.contact ?? null,
        });
        supplierIdByName.set(s.name.trim().toLowerCase(), supplierRow.id);
        summary.suppliersCreated += 1;
      }

      for (const e of project.expenses) {
        const supplierId = e.supplier ? supplierIdByName.get(e.supplier.trim().toLowerCase()) ?? null : null;
        await expenses.create({
          organization_id: organizationId,
          grant_project_id: created.id,
          supplier_id: supplierId,
          invoice_number: e.invoice_number,
          invoice_date: e.invoice_date,
          total: e.total,
          eligible_amount: null, // jamais déduit automatiquement — à valider par un humain
          status: "to_review",
        });
        summary.expensesCreated += 1;
      }

      for (const c of project.claims) {
        await claims.create({
          organization_id: organizationId,
          grant_project_id: created.id,
          claim_number: c.label,
          period_start: c.period_start,
          period_end: c.period_end,
          status: "preparing",
          progress_report: c.status_hint,
        });
        summary.claimsCreated += 1;
      }
    } catch (e) {
      summary.errors.push({
        context: `${project.program_name} / ${project.name}`,
        message: formatCaughtError(e),
      });
    }
  }

  for (const client of seed.clients) {
    let clientRow: Awaited<ReturnType<typeof clients.findByName>> = null;

    // Étape 1 : résoudre/créer le client. Séparée du reste pour que, si ça échoue, l'erreur
    // dise explicitement "recherche" ou "création" plutôt que de masquer les deux sous un
    // seul message générique par client.
    try {
      clientRow = await clients.findByName(client.name);
      if (clientRow) {
        summary.clientsReused.push(client.name);
      } else {
        clientRow = await clients.create({
          organization_id: organizationId,
          name: client.name,
          status: "active",
          notes: client.name_alt ? `Raison sociale : ${client.name_alt}` : null,
          owner_id: ownerId,
        });
        summary.clientsCreated.push(client.name);
      }
    } catch (e) {
      summary.errors.push({
        context: `${client.name} (recherche/création du client)`,
        message: formatCaughtError(e),
      });
      continue;
    }

    for (const project of client.projects) {
      await importProject(clientRow.id, project);
    }
  }

  return summary;
}
