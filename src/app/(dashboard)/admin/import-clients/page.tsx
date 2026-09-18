import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/permissions";
import { ImportRunner } from "./ImportRunner";

export default async function ImportClientsPage() {
  const ctx = await requireOrgContext();
  if (ctx.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Import des dossiers clients (zip Apex)</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Importe les ~20 dossiers réels (CanExport, PARI CNRC, MFOR, Essor, PSCE, Career Ready...) lus et
          structurés à partir du zip fourni. Aucune donnée n&apos;a été inventée : tout champ absent des
          documents originaux est laissé vide, avec une note visible sur la fiche quand une ambiguïté a été
          repérée (ex. montants divergents entre deux versions d&apos;une facture). Relancer l&apos;import est
          sans risque : les clients et projets déjà créés ne sont pas dupliqués.
        </p>
      </div>
      <ImportRunner />
    </div>
  );
}
