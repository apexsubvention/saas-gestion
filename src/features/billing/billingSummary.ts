// Résumé en langage clair de ce qu'un dossier (et, le cas échéant, un fournisseur/sous-traitant
// précis) doit facturer pour aller chercher la subvention -- reprend le calcul déjà en place
// (src/features/grants/subsidyMath.ts, utilisé par SubsidyPanel côté interne) mais sous forme de
// phrase plutôt que de tableau de chiffres, pour l'afficher aussi bien à l'interne que dans le
// portail client. Demandé par Jade : « L'entreprise X devra avoir dépensé la totalité du projet
// [...] mais [client parent] devra avoir facturé [...] d'ici [date de fin] » -- la deuxième phrase
// reprend volontairement la même construction (« devra avoir [participe passé] ») que la première,
// jamais « devra facturer » (formulation que Jade n'aime pas).
//
// Voix active ou passive selon QUI est nommé (Jade, sur le dossier direct de Réseau Psy -- pas
// de fournisseur/sous-traitant) : billerLabel == null veut dire que la phrase parle du CLIENT
// lui-même, qui est celui qui DÉPENSE (reçoit des factures de ses fournisseurs pour pouvoir les
// soumettre à la réclamation) -- jamais celui qui facture quelqu'un d'autre. Donc voix passive :
// « [client] devra avoir ÉTÉ facturé [...] ». billerLabel renseigné (fournisseur/sous-traitant,
// SuppliersTable.tsx/SupplierDossierCard.tsx) reste à la voix active : cette partie-là émet
// vraiment les factures : « [fournisseur] devra avoir facturé [...] ».
//
// Fonction pure (aucune dépendance Supabase) : appelable aussi bien depuis une page serveur
// (grants/[id]/page.tsx) qu'un composant client (SuppliersTable.tsx, DossierCard.tsx,
// SupplierDossierCard.tsx).
import type { SubsidySummary } from "@/features/grants/subsidyMath";

export type BillingNarrativeInput = {
  clientName: string;
  // Résultat de computeSubsidy() pour ce dossier -- ready=false (taux ou montant manquant) : la
  // phrase sur le total du projet est simplement omise, jamais remplacée par une valeur inventée.
  subsidy: SubsidySummary;
  billerLabel: string | null; // qui doit facturer (ex. nom du fournisseur/sous-traitant) ; null = le client lui-même
  billerAmount: number | null; // montant que CE facturier doit facturer -- jamais déduit ici, fourni par l'appelant
  deadline: string | null; // date ISO (fin de projet), pour "d'ici le ..."
  // (0059, Jade) : portion du coût total qui ne sera JAMAIS facturée par personne (ex. salaire
  // interne, décoché dans Aide à la facturation) -- déjà comprise dans requiredSpend/billerAmount
  // ci-dessus quand ceux-ci viennent du coût total du projet. Sert uniquement à AJOUTER une
  // précision dans la phrase (« X $ de coûts internes ne seront jamais facturés ») ; ne change
  // jamais billerAmount lui-même. null/0 = rien à préciser.
  excludedAmount?: number | null;
};

function money(n: number): string {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

/**
 * Ne renvoie jamais une phrase partielle inventée : chaque élément (dépense totale requise,
 * portion subventionnée, montant à facturer) n'apparaît que si la donnée sous-jacente existe.
 * Renvoie null si rien de significatif n'est disponible.
 */
export function buildBillingNarrative(input: BillingNarrativeInput): string | null {
  const { subsidy } = input;
  const parts: string[] = [];

  if (subsidy.ready && subsidy.requiredSpend != null) {
    const ratePct = Math.round((subsidy.rate ?? 0) * 10000) / 100;
    parts.push(
      `L'entreprise ${input.clientName} devra avoir dépensé la totalité du projet, soit ${money(subsidy.requiredSpend)} (${ratePct.toLocaleString("fr-CA")} % de subvention).`
    );
    if (subsidy.maxSubsidy != null) {
      parts.push(`Sur ce montant, ${money(subsidy.maxSubsidy)} sera subventionné.`);
    }
  }

  if (input.billerAmount != null) {
    const who = input.billerLabel ?? input.clientName;
    const due = input.deadline ? ` d'ici le ${formatDate(input.deadline)}` : "";
    // Pas de fournisseur/sous-traitant nommé : c'est le dossier direct du client -- il DÉPENSE
    // (reçoit des factures), il ne facture personne -- voix passive. Voir le commentaire en
    // tête de fichier.
    const verb = input.billerLabel == null ? "avoir été facturé" : "avoir facturé";
    let sentence = `${who} devra ${verb} ${money(input.billerAmount)}${due}.`;
    // Jade : évite de laisser croire que TOUT le coût total sera facturé -- précise la portion qui
    // ne le sera jamais (ex. salaire interne), déjà comprise dans le calcul de la subvention ci-dessus.
    if (input.excludedAmount != null && input.excludedAmount > 0) {
      sentence += ` (${money(input.excludedAmount)} de coûts internes -- ex. salaire -- ne seront jamais facturés, mais comptent dans le calcul de la subvention ci-dessus.)`;
    }
    parts.push(sentence);
  }

  return parts.length > 0 ? parts.join(" ") : null;
}
