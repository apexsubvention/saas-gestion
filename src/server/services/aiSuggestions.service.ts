import type { SupabaseClient } from "@supabase/supabase-js";
import { projectSuppliersRepository } from "@/server/repositories/projectSuppliers.repository";
import { grantAgreementsService } from "@/server/services/grantAgreements.service";
import { matchSupplier } from "@/features/invoices/matchSupplier";
import { hasAgreementTerms, type ConventionExtraction } from "@/features/conventions/analyzeConvention";

// Suggestions IA (ai_suggestions) : SUGGESTION -> confirmation -> ACTION. Rien n'est appliqué sans que
// l'utilisateur ait coché et confirmé ; une suggestion ignorée ou appliquée reste conservée (historique).

type Ctx = { organizationId: string; organizationUserId: string };

export type SuggestionRow = {
  id: string;
  grant_project_id: string | null;
  source_document_id: string | null;
  source_ref: string | null;
  kind: string;
  title: string;
  payload: Record<string, unknown>;
  confidence: "high" | "medium" | "low";
  status: "proposed" | "applied" | "dismissed";
  created_at: string;
};

const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strOrNull = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
const fmt = (n: number | null) => (n == null ? "—" : new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n));

export function aiSuggestionsService(supabase: SupabaseClient) {
  return {
    // Convertit la lecture d'une convention en suggestions (sans rien appliquer).
    async createFromConvention(ctx: Ctx, grantProjectId: string, clientId: string, documentId: string, x: ConventionExtraction): Promise<number> {
      const rows: Array<Record<string, unknown>> = [];
      const base = {
        organization_id: ctx.organizationId,
        client_id: clientId,
        grant_project_id: grantProjectId,
        source_type: "document",
        source_document_id: documentId,
        created_by: ctx.organizationUserId,
      };
      if (hasAgreementTerms(x)) {
        rows.push({
          ...base,
          source_ref: x.terms_source_ref,
          kind: "agreement_terms",
          title: "Mettre à jour l'entente (montant, taux, dates)",
          confidence: x.terms_confidence,
          payload: {
            grant_amount: x.grant_amount,
            grant_rate_percent: x.grant_rate_percent,
            project_start: x.project_start,
            project_end: x.project_end,
            eligible_expense_period_start: x.eligible_expense_period_start,
            eligible_expense_period_end: x.eligible_expense_period_end,
            claim_frequency: x.claim_frequency,
          },
        });
      }
      for (const s of x.suppliers) {
        rows.push({
          ...base,
          source_ref: s.source_ref,
          kind: "supplier",
          title: `Ajouter le fournisseur ${s.name}`,
          confidence: s.confidence,
          payload: { name: s.name, budget: s.eligible_budget, aid: s.aid_amount },
        });
      }
      if (rows.length === 0) return 0;
      const { error } = await supabase.from("ai_suggestions").insert(rows);
      if (error) throw error;
      return rows.length;
    },

    async listProposed(grantProjectId: string): Promise<SuggestionRow[]> {
      try {
        const { data, error } = await supabase
          .from("ai_suggestions")
          .select("id, grant_project_id, source_document_id, source_ref, kind, title, payload, confidence, status, created_at")
          .eq("grant_project_id", grantProjectId)
          .eq("status", "proposed")
          .order("created_at", { ascending: true });
        if (error) return []; // ex. migration 0036 pas encore appliquée : la page reste utilisable
        return (data ?? []) as SuggestionRow[];
      } catch {
        return [];
      }
    },

    async dismiss(ctx: Ctx, id: string): Promise<void> {
      const { error } = await supabase.from("ai_suggestions").update({ status: "dismissed", decided_by: ctx.organizationUserId, decided_at: new Date().toISOString() }).eq("id", id).eq("status", "proposed");
      if (error) throw error;
    },

    // Applique les suggestions choisies. Renvoie un compte rendu lisible, une ligne par suggestion.
    async apply(ctx: Ctx, grantProjectId: string, ids: string[]): Promise<string[]> {
      const { data, error } = await supabase.from("ai_suggestions").select("*").eq("grant_project_id", grantProjectId).eq("status", "proposed").in("id", ids);
      if (error) throw error;
      const chosen = (data ?? []) as SuggestionRow[];
      const suppliersRepo = projectSuppliersRepository(supabase);
      const report: string[] = [];

      // Les termes de l'entente en dernier : ils créent les échéances et font évoluer le statut.
      const ordered = [...chosen.filter((s) => s.kind === "supplier"), ...chosen.filter((s) => s.kind === "agreement_terms")];
      for (const s of ordered) {
        const p = s.payload ?? {};
        let done = false;
        if (s.kind === "supplier") {
          const name = strOrNull(p.name);
          if (!name) continue;
          const budget = numOrNull(p.budget);
          const aid = numOrNull(p.aid);
          const provenance = { source_kind: "convention" as const, source_document_id: s.source_document_id, source_ref: s.source_ref, extracted_at: new Date().toISOString(), confidence: s.confidence };
          const existing = matchSupplier(name, await suppliersRepo.listByProject(grantProjectId));
          if (existing) {
            await suppliersRepo.update(existing.id, {
              accepted_subsidy_auto: aid ?? existing.accepted_subsidy_auto,
              ...(existing.budget_amount == null && budget != null ? { budget_amount: budget } : {}),
              ...provenance,
            });
            report.push(`${existing.name} : subvention acceptée ${fmt(aid)} ajoutée (fournisseur déjà présent).`);
          } else {
            await suppliersRepo.create({ organization_id: ctx.organizationId, grant_project_id: grantProjectId, name, budget_amount: budget, accepted_subsidy_auto: aid, ...provenance });
            report.push(`${name} ajouté au tableau (budget ${fmt(budget)}, subvention acceptée ${fmt(aid)}).`);
          }
          done = true;
        } else if (s.kind === "agreement_terms") {
          const agreements = grantAgreementsService(supabase);
          const current = (await agreements.listByProject(grantProjectId))[0];
          const rate = numOrNull(p.grant_rate_percent) ?? (current?.grant_rate != null ? Math.round(Number(current.grant_rate) * 10000) / 100 : null);
          const result = await agreements.saveAndSchedule(ctx.organizationId, grantProjectId, {
            project_start: strOrNull(p.project_start) ?? current?.project_start ?? null,
            project_end: strOrNull(p.project_end) ?? current?.project_end ?? null,
            eligible_expense_period_start: strOrNull(p.eligible_expense_period_start) ?? current?.eligible_expense_period_start ?? null,
            eligible_expense_period_end: strOrNull(p.eligible_expense_period_end) ?? current?.eligible_expense_period_end ?? null,
            grant_amount: numOrNull(p.grant_amount) ?? (current?.grant_amount != null ? Number(current.grant_amount) : null),
            grant_rate_percent: rate,
            claim_frequency: strOrNull(p.claim_frequency) ?? current?.claim_frequency ?? "",
            special_conditions: current?.special_conditions ?? "",
          });
          const bits = [result.claimsCreated ? `${result.claimsCreated} DDR mensuel(s)` : null, result.created ? `${result.created} échéance(s)` : null].filter(Boolean).join(", ");
          report.push(`Entente mise à jour${bits ? ` — ${bits} ajouté(s) à l'échéancier` : ""}${result.statusChanged ? " ; statut du dossier mis à jour" : ""}.`);
          done = true;
        }
        if (done) {
          const { error: upErr } = await supabase.from("ai_suggestions").update({ status: "applied", decided_by: ctx.organizationUserId, decided_at: new Date().toISOString() }).eq("id", s.id);
          if (upErr) throw upErr;
        }
      }
      return report;
    },
  };
}
