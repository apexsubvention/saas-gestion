import { requirePortalContext } from "@/lib/portal/auth";
import { createClient } from "@/lib/supabase/server";
import { projectSuppliersService } from "@/server/services/projectSuppliers.service";

// Portail v1 : montre, pour CE client (ex. Sitegrow), toutes les lignes où il est
// lui-même le fournisseur sur le dossier d'un de ses propres clients finaux --
// c'est-à-dire quoi facturer, sur quel dossier, à quelle fréquence et quoi inscrire.
// RLS (project_suppliers_select -> can_access_grant_project -> can_access_client,
// voir 0028) filtre déjà aux seuls dossiers réellement accessibles à ce compte,
// y compris à travers la hiérarchie client parent/enfants.
export default async function PortalHomePage() {
  const ctx = await requirePortalContext();
  const supabase = await createClient();

  const supplierRows = await projectSuppliersService(supabase).listBySupplierClient(ctx.clientId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Facturation à préparer</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Pour chaque dossier ci-dessous, voici le montant prévu, la fréquence et ce qui doit apparaître sur la
          facture. Écris à ton contact chez Apex si un détail manque ou semble incorrect.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        {supplierRows && supplierRows.length > 0 ? (
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
        ) : (
          <p className="px-4 py-8 text-center text-sm text-neutral-400">
            Rien pour l&apos;instant — ton contact chez Apex n&apos;a pas encore ajouté de dossier où tu es
            fournisseur.
          </p>
        )}
      </div>
    </div>
  );
}
