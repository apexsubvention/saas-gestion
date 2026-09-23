import { requirePortalContext } from "@/lib/portal/auth";
import { createClient } from "@/lib/supabase/server";
import { projectSuppliersService } from "@/server/services/projectSuppliers.service";
import { portalDossiersService } from "@/server/services/portalDossiers.service";
import { DossierCard } from "./DossierCard";

// Page d'accueil du portail : « Mes dossiers » -- pour chaque dossier accessible à ce
// compte (le sien, et ceux de ses clients enfants s'il en a -- hiérarchie, cf. 0028),
// une carte dépliable avec statut/dates, réclamations (+ documents à fournir) et le
// texte rédigé du questionnaire, pour révision. Voir portalDossiers.service.ts : la RLS
// (can_access_client / can_access_grant_project, étendue en lecture au questionnaire
// par 0044) filtre déjà tout aux dossiers réellement accessibles, sans filtre ici.
//
// La section « Facturation à préparer » (fournisseur) est un besoin différent -- ce
// client facture pour le dossier d'UN AUTRE client (ex. Sitegrow facture pour ses
// propres clients finaux, via project_suppliers.supplier_client_id, pas forcément un
// lien de hiérarchie parent/enfant) -- donc conservée comme section distincte plutôt
// que fusionnée dans les cartes de dossiers ci-dessus.
export default async function PortalHomePage() {
  const ctx = await requirePortalContext();
  const supabase = await createClient();

  const [dossiers, supplierRows] = await Promise.all([
    portalDossiersService(supabase).listDossiers(),
    projectSuppliersService(supabase).listBySupplierClient(ctx.clientId),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Mes dossiers</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Statut, réclamations, documents à fournir et texte rédigé pour chacun de tes dossiers. Écris à ton
          contact chez Apex si un détail manque ou semble incorrect.
        </p>
      </div>

      <div className="space-y-3">
        {dossiers.length > 0 ? (
          dossiers.map((d) => <DossierCard key={d.id} dossier={d} />)
        ) : (
          <div className="rounded-lg border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-400">
            Aucun dossier pour l&apos;instant — ton contact chez Apex n&apos;a pas encore ajouté de dossier.
          </div>
        )}
      </div>

      {supplierRows && supplierRows.length > 0 && (
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">Facturation à préparer</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Pour chaque dossier ci-dessous, voici le montant prévu, la fréquence et ce qui doit apparaître sur
              la facture.
            </p>
          </div>
          <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Client final</th>
                  <th className="px-4 py-2 font-medium">Dossier</th>
                  <th className="px-4 py-2 font-medium">Budget prévu</th>
                  <th className="px-4 py-2 font-medium">Fréquence</th>
                  <th className="px-4 py-2 font-medium">Jour attendu</th>
                  <th className="px-4 py-2 font-medium">À inscrire sur la facture</th>
                </tr>
              </thead>
              <tbody>
                {(supplierRows as any[]).map((s) => (
                  <tr key={s.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-2 text-neutral-900">{s.grant_projects?.clients?.name ?? "—"}</td>
                    <td className="px-4 py-2 text-neutral-600">{s.grant_projects?.name ?? "—"}</td>
                    <td className="px-4 py-2 text-neutral-600">
                      {s.budget_amount != null
                        ? `${Number(s.budget_amount).toLocaleString("fr-CA", { minimumFractionDigits: 2 })} $`
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-neutral-600">{s.billing_frequency ?? "—"}</td>
                    <td className="px-4 py-2 text-neutral-600">{s.expected_invoice_day ?? "—"}</td>
                    <td className="px-4 py-2 text-neutral-600">{s.invoice_description_requirements ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
