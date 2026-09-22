import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "apex-documents";

export type DeleteGrantProjectPreview = {
  name: string;
  clientName: string | null;
  documentsCount: number;
  claimsCount: number;
  tasksCount: number;
  suppliersCount: number;
};

// Suppression DÉFINITIVE d'un dossier de subvention (tout son contenu : documents, entente,
// réclamations, échéances, tâches, fournisseurs, factures, questionnaire, analyses, journal, etc.).
// Réservée aux admins (policy grant_projects_delete, 0016) : contrairement à une tâche ou une
// échéance (0040), il n'y a ici rien à annuler ni à rétablir. Aucune migration requise : les
// suppressions en cascade des tables filles vers grant_projects existent déjà (0004 à 0040).
export function deleteGrantProjectService(supabase: SupabaseClient) {
  return {
    async preview(grantProjectId: string): Promise<DeleteGrantProjectPreview | null> {
      const { data: project } = await supabase.from("grant_projects").select("name, clients(name)").eq("id", grantProjectId).maybeSingle();
      if (!project) return null;
      const row = project as any;
      const [{ count: documentsCount }, { count: claimsCount }, { count: tasksCount }, { count: suppliersCount }] = await Promise.all([
        supabase.from("documents").select("id", { count: "exact", head: true }).eq("grant_project_id", grantProjectId),
        supabase.from("claims").select("id", { count: "exact", head: true }).eq("grant_project_id", grantProjectId),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("grant_project_id", grantProjectId),
        supabase.from("project_suppliers").select("id", { count: "exact", head: true }).eq("grant_project_id", grantProjectId),
      ]);
      return {
        name: row.name as string,
        clientName: (Array.isArray(row.clients) ? row.clients[0]?.name : row.clients?.name) ?? null,
        documentsCount: documentsCount ?? 0,
        claimsCount: claimsCount ?? 0,
        tasksCount: tasksCount ?? 0,
        suppliersCount: suppliersCount ?? 0,
      };
    },

    // Renvoie le nombre de lignes supprimées : 0 = refusé par les règles d'accès (pas admin, ou hors
    // organisation) ou dossier déjà supprimé -- jamais une exception dans ce cas, pour rester
    // distinguable d'une vraie erreur (contrainte, réseau...).
    async remove(grantProjectId: string): Promise<number> {
      // 1) Chemins de stockage AVANT la suppression (la cascade va effacer les lignes "documents").
      const { data: docs } = await supabase.from("documents").select("storage_path").eq("grant_project_id", grantProjectId);
      const paths = (docs ?? []).map((d: { storage_path: string }) => d.storage_path).filter(Boolean);

      const { data, error } = await supabase.from("grant_projects").delete().eq("id", grantProjectId).select("id");
      if (error) throw error;
      const removed = data?.length ?? 0;
      if (removed === 0) return 0;

      // 2) Fichiers du storage : best-effort, un objet déjà absent ou une erreur réseau ne doit pas
      // faire remonter une erreur après une suppression déjà actée en base.
      if (paths.length > 0) {
        try {
          await supabase.storage.from(BUCKET).remove(paths);
        } catch {
          /* nettoyage du storage facultatif */
        }
      }
      return removed;
    },
  };
}
