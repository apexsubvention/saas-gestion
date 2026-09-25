import { requirePortalContext } from "@/lib/portal/auth";
import { createClient } from "@/lib/supabase/server";
import { projectSuppliersService } from "@/server/services/projectSuppliers.service";
import { portalDossiersService } from "@/server/services/portalDossiers.service";
import { DossiersList } from "./DossiersList";
import { SupplierDossierCard, type SupplierBillingRow } from "./SupplierDossierCard";

// Page d'accueil du portail : « Mes dossiers » -- pour chaque dossier accessible à ce
// compte (le sien, et ceux de ses clients enfants s'il en a -- hiérarchie, cf. 0028),
// une carte dépliable avec statut/dates, réclamations (+ documents à fournir), documents
// demandés (téléversables) et le texte rédigé du questionnaire, pour révision. Voir
// portalDossiers.service.ts : la RLS (can_access_client / can_access_grant_project,
// étendue en lecture au questionnaire par 0044) filtre déjà tout aux dossiers réellement
// accessibles, sans filtre ici -- le service filtre seulement les dossiers refusés
// (Jade : un dossier refusé n'a plus sa place au quotidien dans le portail).
//
// La section « Facturation à préparer » (fournisseur) est un besoin différent -- ce
// client facture pour le dossier d'UN AUTRE client (ex. Sitegrow facture pour ses
// propres clients finaux, via project_suppliers.supplier_client_id, pas forcément un
// lien de hiérarchie parent/enfant) -- donc conservée comme section distincte plutôt
// que fusionnée dans les cartes de dossiers ci-dessus. Depuis 0047, chaque ligne est une
// carte dépliable (SupplierDossierCard) donnant accès au budget complet du dossier, la
// portion de subvention, tous les documents, et un total agrégé (jamais le détail) des
// autres sous-traitants -- pas seulement le montant à facturer comme avant.
const UPLOADABLE_STATUSES = ["requested", "issue"];
const ACTIVE_CLAIM_STATUSES_EXCLUDED = ["paid", "rejected"];
// Un dossier est considéré « obtenu » dès qu'il est approuvé -- qu'il soit encore en attente de
// réclamation ou déjà complété (voir GRANT_PROJECT_STATUS_LABELS, features/grants/constants.ts).
const OBTAINED_PROJECT_STATUSES = ["approved", "awaiting_claim", "completed"];

export default async function PortalHomePage() {
  const ctx = await requirePortalContext();
  const supabase = await createClient();

  const [dossiers, supplierRows] = await Promise.all([
    portalDossiersService(supabase).listDossiers(),
    projectSuppliersService(supabase).listBySupplierClient(ctx.clientId),
  ]);

  const upcomingClaims = dossiers.reduce(
    (sum, d) => sum + d.claims.filter((c) => !ACTIVE_CLAIM_STATUSES_EXCLUDED.includes(c.status)).length,
    0
  );
  const obtainedCount = dossiers.filter((d) => OBTAINED_PROJECT_STATUSES.includes(d.status)).length;
  const toProvideCount = dossiers.reduce((sum, d) => {
    const projectLevel = d.documentRequests.filter((r) => UPLOADABLE_STATUSES.includes(r.status)).length;
    const perClaim = d.claims.reduce(
      (s, c) => s + c.openRequirements.length + c.documentRequests.filter((r) => UPLOADABLE_STATUSES.includes(r.status)).length,
      0
    );
    return sum + projectLevel + perClaim;
  }, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Mes dossiers</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Statut, réclamations, documents à fournir et texte rédigé pour chacun de tes dossiers. Écris à ton
          contact chez Apex si un détail manque ou semble incorrect.
        </p>
      </div>

      {dossiers.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryTile label="Dossiers actifs" value={dossiers.length} />
          <SummaryTile label="Subventions obtenues" value={obtainedCount} />
          <SummaryTile label="Réclamations en cours" value={upcomingClaims} />
          <SummaryTile label="Éléments à fournir" value={toProvideCount} highlight={toProvideCount > 0} />
        </div>
      )}

      <DossiersList dossiers={dossiers} ownClientId={ctx.clientId} currentOrgUserId={ctx.organizationUserId} />

      {supplierRows && supplierRows.length > 0 && (
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">Facturation à préparer</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Pour chaque dossier ci-dessous : ta facturation prévue. Déplie une carte pour voir le budget complet
              du dossier, la portion de subvention, les documents et un aperçu des autres sous-traitants.
            </p>
          </div>
          <div className="space-y-3">
            {(supplierRows as SupplierBillingRow[]).map((s) => (
              <SupplierDossierCard key={s.id} row={s} clientName={ctx.clientName} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryTile({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "border-amber-200 bg-amber-50" : "border-neutral-200 bg-white"}`}>
      <p className={`text-xl font-semibold ${highlight ? "text-amber-800" : "text-neutral-900"}`}>{value}</p>
      <p className={`text-xs ${highlight ? "text-amber-700" : "text-neutral-500"}`}>{label}</p>
    </div>
  );
}
