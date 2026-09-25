import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { grantProjectsService } from "@/server/services/grantProjects.service";
import { grantAgreementsService } from "@/server/services/grantAgreements.service";
import { billingLineItemsService } from "@/server/services/billingLineItems.service";
import { billingInstallmentsService } from "@/server/services/billingInstallments.service";
import { documentsService } from "@/server/services/documents.service";
import { suggestInstallmentCount } from "@/features/billing/schedule";
import { UploadConventionForm } from "./UploadConventionForm";
import { LineItemsEditor } from "./LineItemsEditor";
import { GenerateBillingScheduleForm } from "./GenerateBillingScheduleForm";
import { BillingInstallmentCard } from "./BillingInstallmentCard";

// Aide à la facturation : à partir des activités/postes ACCEPTÉS dans la convention (montant total
// déjà accordé, jamais recalculé), Apex prérédige ce qui doit apparaître sur les factures à venir,
// réparti sur N versements couvrant la durée du projet -- éditable, avec bouton « copier ». Ouvert à
// tous les programmes (pas seulement PARI CNRC). Voir supabase/migrations/0042_billing_aid.sql et
// src/server/services/billingInstallments.service.ts pour le calendrier et la logique de régénération.
export const maxDuration = 90;

export default async function BillingAidPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const project: any = await grantProjectsService(supabase).get(params.id);
  if (!project) notFound();

  const [agreements, lineItems, installments, projectDocuments] = await Promise.all([
    grantAgreementsService(supabase).listByProject(params.id),
    billingLineItemsService(supabase).listByProject(params.id),
    billingInstallmentsService(supabase).listByProject(params.id),
    documentsService(supabase).listByProject(params.id),
  ]);
  // Facture reçue du client (0054) : jointe ici plutôt que par une requête par versement --
  // un seul aller-retour pour toutes les cartes de la page, même liste que la section
  // Documents du dossier (grants/[id]/page.tsx) affiche déjà séparément.
  const documentById = new Map(projectDocuments.map((d) => [d.id, d]));
  const agreement = agreements[0] ?? null;
  const projectStart = agreement?.project_start ?? project.official_start_date ?? null;
  const projectEnd = agreement?.project_end ?? project.official_end_date ?? null;

  // Seuls les postes cochés « à facturer » (0050) comptent dans le total réparti sur les versements
  // -- un coût interne (ex. salaire déjà payé par l'entreprise, remboursé directement par la
  // subvention) ne donne jamais lieu à une facture.
  const billableItems = lineItems.filter((it) => it.included_in_billing);
  const totalAmount = billableItems.reduce((sum, it) => sum + Number(it.amount ?? 0), 0);
  const totalAccepted = lineItems.reduce((sum, it) => sum + Number(it.amount ?? 0), 0);
  const lockedCount = installments.filter((r) => r.status === "submitted").length;
  const draftCount = installments.filter((r) => r.status === "draft").length;

  const money = (n: number) => new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(n);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/grants/${params.id}`} className="text-sm text-neutral-500 hover:text-neutral-900">
          ← Retour au dossier
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-neutral-900">Aide à la facturation — {project.name}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          À partir des activités acceptées dans la convention, Apex propose ce qui doit apparaître sur les factures à venir et
          répartit le montant total sur plusieurs versements couvrant la durée du projet — modifie librement chaque versement,
          puis copie le texte suggéré pour préparer la facture avec le client.
        </p>
      </div>

      <section className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-neutral-900">1. Activités et postes budgétaires acceptés</h2>
        <p className="text-xs text-neutral-500">
          Téléverse la convention (PDF ou image) : Apex en extrait les activités et leur montant, à valider/corriger ci-dessous
          avant de générer les versements. Tu peux aussi ajouter ou corriger les lignes à la main.
        </p>
        <UploadConventionForm grantProjectId={params.id} />
        {/* key forcé sur le contenu de la liste : les lignes sont remplacées en bloc (delete-then-insert,
            donc de nouveaux id) à chaque lecture de convention ou enregistrement manuel -- sans ce key,
            l'état local du composant client ne se remettrait pas à jour après un nouvel upload. */}
        <LineItemsEditor key={lineItems.map((it) => it.id).join(",") || "empty"} grantProjectId={params.id} initialItems={lineItems} />
        <p className="text-xs font-medium text-neutral-700">
          Total à facturer : {money(totalAmount)}
          {totalAccepted !== totalAmount && (
            <span className="ml-1 font-normal text-neutral-500">(total accepté, incluant les coûts internes non facturés : {money(totalAccepted)})</span>
          )}
        </p>
      </section>

      <section className="space-y-2 rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
        <h2 className="text-sm font-semibold text-neutral-900">Dates du projet</h2>
        {projectStart && projectEnd ? (
          <p>Du {projectStart} au {projectEnd} (source : {agreement ? "entente" : "dossier"}).</p>
        ) : (
          <p className="text-amber-700">Dates de début/fin manquantes — renseigne-les dans l&apos;entente du dossier avant de générer les versements.</p>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-neutral-900">2. Calendrier de facturation</h2>
        {installments.length === 0 ? (
          <>
            <p className="text-xs text-neutral-500">
              Génère le calendrier complet : Apex répartit la durée du projet et le montant total en versements consécutifs et
              rédige un premier brouillon du texte de facture de chacun.
            </p>
            <GenerateBillingScheduleForm
              grantProjectId={params.id}
              mode="generate"
              disabled={!projectStart || !projectEnd || lineItems.length === 0 || totalAmount <= 0}
              defaultCount={projectStart && projectEnd ? suggestInstallmentCount(projectStart, projectEnd, agreement?.claim_frequency ?? null) : 1}
            />
          </>
        ) : (
          <>
            <p className="text-xs text-neutral-500">
              {lockedCount} versement(s) marqué(s) facturé(s), {draftCount} en brouillon. Si le client ne facture pas à chaque
              période prévue, ajuste ici le nombre de versements RESTANTS — les versements déjà marqués facturés ne sont jamais
              touchés, seul le solde restant est réparti sur les brouillons régénérés à partir de la période suivante.
            </p>
            <GenerateBillingScheduleForm grantProjectId={params.id} mode="regenerate" disabled={!projectEnd} defaultCount={Math.max(1, draftCount)} />
          </>
        )}
      </section>

      <section className="space-y-4">
        {installments.map((inst) => (
          <BillingInstallmentCard
            key={inst.id}
            grantProjectId={params.id}
            installment={inst}
            clientInvoiceDocument={inst.client_invoice_document_id ? (documentById.get(inst.client_invoice_document_id) ?? null) : null}
          />
        ))}
        {installments.length === 0 && <p className="text-sm text-neutral-400">Aucun versement généré pour l&apos;instant.</p>}
      </section>
    </div>
  );
}
