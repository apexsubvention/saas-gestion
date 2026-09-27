import type { SupabaseClient } from "@supabase/supabase-js";
import { grantProjectsRepository } from "@/server/repositories/grantProjects.repository";
import { claimsRepository, type ClaimRow } from "@/server/repositories/claims.repository";
import {
  claimRequirementsRepository,
  type ClaimRequirementRow,
  OPEN_REQUIREMENT_STATUSES,
} from "@/server/repositories/claimRequirements.repository";
import { documentRequestsRepository, type DocumentRequestRow } from "@/server/repositories/documentRequests.repository";
import { documentsRepository } from "@/server/repositories/documents.repository";
import { milestonesRepository } from "@/server/repositories/milestones.repository";
import { programsRepository } from "@/server/repositories/programs.repository";
import { questionnaireService } from "@/server/services/questionnaire.service";
import { dossierNotesService, type DossierNoteView } from "@/server/services/dossierNotes.service";
import { programSnapshotService } from "@/server/services/programSnapshot.service";
import { supplierLedgerService } from "@/server/services/supplierLedger.service";
import { billingLineItemsService } from "@/server/services/billingLineItems.service";
import { billingInstallmentsService } from "@/server/services/billingInstallments.service";
import { grantAgreementsService } from "@/server/services/grantAgreements.service";
import { GRANT_PROJECT_STATUS_LABELS, DOCUMENT_REQUEST_STATUS_LABELS } from "@/features/grants/constants";
import { isPariCnrcProgram } from "@/server/scheduling/monthlyClaims";

// Assemble, pour le portail client, tout ce qui est associé à un dossier -- statut/dates,
// réclamations (+ documents manquants), texte rédigé du questionnaire, documents
// demandés -- en une seule structure par dossier. Ne fait AUCUN filtre par client ici :
// grantProjectsRepository.list() n'a pas de clause .eq(client_id, ...), donc c'est la RLS
// (can_access_client / can_access_grant_project, cf. 0028 et 0044) qui restreint déjà le
// résultat aux dossiers réellement accessibles à ce compte portail -- y compris ceux de
// ses clients enfants (hiérarchie). Même principe que
// projectSuppliers.repository.ts#listBySupplierClient, déjà utilisé ainsi par la page
// portail existante.

// Un dossier refusé n'intéresse plus le client au quotidien -- Jade a demandé à ce
// qu'il disparaisse du portail (il reste bien sûr visible côté interne).
const HIDDEN_PROJECT_STATUSES = ["rejected"];

// Statuts de document_requests montrés au portail : jamais "not_required" (le personnel
// a décidé que ce n'était plus utile) ni "not_requested" (pas encore réellement demandé --
// ne devrait pas arriver via l'UI actuelle, mais on l'exclut par prudence).
const VISIBLE_REQUEST_STATUSES = ["requested", "received", "validated", "issue"];

export type PortalDocumentRequestView = {
  id: string;
  title: string;
  instructions: string | null;
  documentType: string;
  dueDate: string | null;
  status: string;
  statusLabel: string;
  filename: string | null;
};

export type PortalClaimView = ClaimRow & {
  openRequirements: ClaimRequirementRow[];
  documentRequests: PortalDocumentRequestView[];
  // Documents téléversés par le personnel et rattachés à CETTE réclamation précise
  // (document_links.entity_type = 'claim', voir UploadProjectDocumentForm côté interne) -- 0063,
  // Jade : montrés même une fois la réclamation payée (contrairement à documentRequests/
  // openRequirements ci-dessus, qui ne couvrent que ce qui manque encore).
  documents: Array<{ id: string; filename: string }>;
};

// Réclamation suggérée/à venir (milestones.type = 'claim', voir MILESTONE_TYPE_LABELS) : PAS
// encore un dossier de réclamation réel (claims), juste une entrée d'échéancier avec une date --
// 0063, Jade : « on voit les réclamations avec statut payé, mais pas celles à venir avec les
// dates ». Seules les échéances encore actives (ni complétées ni annulées) sont montrées --
// une fois "done", la réclamation réelle a normalement pris le relais.
export type PortalUpcomingClaim = {
  id: string;
  title: string;
  dueDate: string | null;
  estimated: boolean; // source === 'ai_proposed' (suggérée depuis la convention, pas encore confirmée)
};

// Montant à facturer par UN fournisseur précis (0063, Jade) : « le nom du fournisseur » dans le
// résumé de facturation -- un dossier peut avoir plusieurs fournisseurs, chacun avec son propre
// montant (Budget prévu, déjà calculé par supplierLedgerService à partir des postes cochés "À
// facturer" qui lui sont associés -- voir 0059). Jamais recalculé ici, juste transporté.
export type PortalBillerLine = { supplierName: string; amount: number };

export type PortalRedactionItem = {
  id: string;
  prompt: string;
  text: string;
  // D'où vient le texte affiché : aide le client à savoir si c'est encore un brouillon
  // (potentiellement généré par IA, à ne pas prendre pour définitif) ou déjà validé.
  stage: "final" | "user_draft" | "ai_draft";
};

// Poste de facturation accepté (module/activité + heures, tel qu'extrait de la convention ou saisi à
// la main -- src/server/services/billingLineItems.service.ts) : ce qui doit apparaître sur les
// factures. Lecture seule côté portail -- édité uniquement depuis l'aide à la facturation interne.
export type PortalBillingLineItem = { id: string; label: string; description: string | null; amount: number; hours: number | null; includedInBilling: boolean };

// Versement de l'aide à la facturation (module/tâches déjà réparties sur une période précise, avec
// son montant -- src/server/services/billingInstallments.service.ts) : répond directement au besoin
// de Jade -- « quoi inscrire sur les factures comme montant et travaux effectués », déjà réparti
// selon le nombre de réclamations/versements configuré côté interne (page Aide à la facturation).
// Lecture seule côté portail.
export type PortalBillingInstallment = {
  id: string;
  installmentNumber: number;
  periodStart: string;
  periodEnd: string;
  amount: number;
  invoiceDescription: string | null;
  status: "draft" | "submitted";
  // Facture téléversée par le client pour ce versement (0054) -- null tant que le client ne
  // l'a pas envoyée depuis le portail (InstallmentInvoiceUpload). Écrit par
  // uploadInstallmentInvoiceAction, jamais ici (lecture seule dans ce service).
  clientInvoiceFilename: string | null;
  clientInvoiceUploadedAt: string | null;
};

// Résumé du programme montré au client quand son dossier est « à rédiger » (Jade) -- un
// sous-ensemble volontairement restreint du dernier program_snapshots figé pour ce dossier
// (jamais le programme "en direct" : voir programSnapshot.service.ts -- le portail lit via la
// policy program_snapshots_select_portal de 0056). Champs exclus volontairement : source_text
// (texte brut de la page officielle, pas destiné au client), resource_links et
// government_priorities (pas demandés par Jade, usage interne pour l'instant).
export type PortalProgramSummary = {
  description: string | null;
  eligibleExpenses: string | null;
  ineligibleExpenses: string | null;
  applicationProcess: string | null;
  requiredDocuments: string[];
  minEligibleSpend: number | null;
  maxAidAmount: number | null;
  aidNotes: string | null;
  takenAt: string;
};

// Facture fournisseur (Jade, 0057) : statut de paiement + preuve, modifiables par le portail
// (enfant ET parent). Seulement les factures déjà CONFIRMÉES par le personnel (status
// "compliant") -- jamais "to_review"/"missing_information"/"potentially_ineligible"/"rejected",
// qui ne sont pas encore vérifiées ou posent problème : pas approprié de demander au client de
// gérer le paiement d'une facture qu'Apex n'a pas encore validée. Les factures "sans fournisseur"
// (triage interne, ledger.unassigned) ne sont jamais exposées ici non plus, pour la même raison.
export type PortalSupplierInvoice = {
  id: string;
  supplierName: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  amount: number | null;
  document: { id: string; filename: string } | null;
  paymentStatus: "sent_unpaid" | "paid";
  paymentStatusUpdatedAt: string | null;
  paymentProof: { id: string; filename: string } | null;
};

export type PortalDossier = {
  id: string;
  name: string;
  clientId: string;
  clientName: string | null;
  programName: string | null;
  status: string;
  statusLabel: string;
  officialStartDate: string | null;
  officialEndDate: string | null;
  approvedGrantAmount: number | null;
  // Coût total du projet et taux d'aide : nécessaires (avec approvedGrantAmount) pour le résumé en
  // langage clair côté portail -- voir src/features/billing/billingSummary.ts. L'entente (si
  // renseignée) l'emporte sur la fiche du dossier, comme resolveSubsidyInputs côté interne.
  totalProjectCost: number | null;
  grantRate: number | null;
  // PARI CNRC/IRAP (0065) -- même détection que côté admin (isPariCnrcProgram sur le nom du
  // programme). Utilisé par DossierCard.tsx pour : (1) afficher le même "Solde restant" que le
  // portail admin (pariBalanceRemaining, lu directement sur le rapport Historique DDR -- jamais
  // recalculé depuis les réclamations formelles, qui n'existent pas pour un DDR) ; (2) masquer le
  // bloc "Factures fournisseurs", sans objet pour un dossier PARI (coûts = salariés internes, pas
  // des factures de fournisseurs externes -- Jade).
  isPariProgram: boolean;
  pariBalanceRemaining: number | null;
  billingDeadline: string | null;
  // (0060) Faits bruts du délai de paiement/facturation lu dans la convention -- la date
  // effective et le texte d'alerte se calculent en TypeScript pur, voir
  // src/features/billing/paymentDeadline.ts (computePaymentDeadline / paymentDeadlineAlertText).
  paymentDeadlineDate: string | null;
  paymentDeadlineDaysAfterEnd: number | null;
  claims: PortalClaimView[];
  upcomingClaims: PortalUpcomingClaim[];
  // Le plus récent document de catégorie "agreement" (convention) déjà téléversé pour ce dossier,
  // s'il y en a un -- 0063, Jade : « si la convention a été uploadée, qu'on puisse la voir
  // directement ». null tant qu'aucune convention n'a été déposée (jamais déduit autrement).
  agreementDocument: { id: string; filename: string } | null;
  // Un montant par fournisseur ayant un Budget prévu calculé (0059) -- 0063, Jade : une phrase de
  // facturation par fournisseur plutôt qu'un seul total combiné. Vide si aucun fournisseur n'est
  // encore associé à un poste facturable (repli sur le résumé combiné côté DossierCard.tsx).
  billingBySupplier: PortalBillerLine[];
  redaction: PortalRedactionItem[];
  // Documents demandés au niveau du dossier (claim_id vide -- ex. en vue d'un dépôt),
  // par opposition à ceux rattachés à une réclamation précise (déjà dans claims[].documentRequests).
  documentRequests: PortalDocumentRequestView[];
  notes: DossierNoteView[];
  billingLineItems: PortalBillingLineItem[];
  billingInstallments: PortalBillingInstallment[];
  // Null hors statut "draft" (à rédiger), ou si aucun snapshot n'a encore été figé pour ce
  // dossier (ex. migration pas encore appliquée côté programme, ou dossier créé avant 0038).
  programSummary: PortalProgramSummary | null;
  supplierInvoices: PortalSupplierInvoice[];
  // Jade (0064) : certaines subventions ne demandent jamais de preuve de paiement -- quand
  // false, PortalSupplierInvoices.tsx n'affiche plus le bloc "Preuve de paiement" au client.
  requiresPaymentProof: boolean;
};

export function portalDossiersService(supabase: SupabaseClient) {
  const grantProjects = grantProjectsRepository(supabase);
  const claims = claimsRepository(supabase);
  const claimRequirements = claimRequirementsRepository(supabase);
  const documentRequests = documentRequestsRepository(supabase);
  const documents = documentsRepository(supabase);
  const milestones = milestonesRepository(supabase);
  const programs = programsRepository(supabase);
  const questionnaire = questionnaireService(supabase);
  const notes = dossierNotesService(supabase);
  const snapshots = programSnapshotService(supabase);
  const supplierLedger = supplierLedgerService(supabase);
  const billingLineItems = billingLineItemsService(supabase);
  const billingInstallments = billingInstallmentsService(supabase);
  const grantAgreements = grantAgreementsService(supabase);

  return {
    // viewerClientId : le client du compte portail CONNECTÉ (requirePortalContext -> ctx.clientId)
    // -- distinct du client_id de chaque dossier. Sert uniquement à appliquer
    // hidden_from_parent_portal : un dossier ainsi marqué reste visible si ce compte EST le
    // client du dossier (viewerClientId === p.client_id), et n'est retiré que s'il y accède via
    // la hiérarchie parent/enfant (0028). Voir 0056 pour le raisonnement complet.
    async listDossiers(viewerClientId: string): Promise<PortalDossier[]> {
      const allProjects = (await grantProjects.list()) as Array<{
        id: string;
        name: string;
        client_id: string;
        program_id: string;
        status: string;
        official_start_date: string | null;
        official_end_date: string | null;
        approved_grant_amount: number | null;
        total_project_cost: number | null;
        grant_rate: number | null;
        hidden_from_parent_portal: boolean;
        requires_payment_proof: boolean;
        pari_balance_remaining: number | null;
        clients: { name: string } | null;
        grant_programs: { name: string } | null;
      }>;
      const projects = allProjects
        .filter((p) => !HIDDEN_PROJECT_STATUSES.includes(p.status))
        .filter((p) => !p.hidden_from_parent_portal || p.client_id === viewerClientId);

      // Nom du programme pour le portail (0063 -- bug trouvé, Jade : « on ne voit toujours pas le
      // titre des programmes ») : p.grant_programs?.name ci-dessous vient d'une jointure qui suit
      // grant_programs_select (0033) -- un compte portail ne peut lire un programme QUE s'il lui a
      // été "envoyé" via la veille, jamais parce qu'il a un dossier réel dessus, donc le nom
      // revient silencieusement null pour la quasi-totalité des dossiers. programsRepository
      // .listNamesForPortal (fonction RPC dédiée, vérifie l'accès via can_access_grant_project)
      // le résout correctement -- un seul aller-retour pour tous les dossiers de ce compte.
      const programNameById = new Map(
        (await programs.listNamesForPortal(Array.from(new Set(projects.map((p) => p.program_id))))).map((row) => [row.id, row.name])
      );

      const dossiers = await Promise.all(
        projects.map(async (p): Promise<PortalDossier> => {
          const [claimRows, questionnaireData, requestRows, noteRows, lineItemRows, agreements, installmentRows, projectDocuments, snapshotRows, ledger, milestoneRows] = await Promise.all([
            claims.listByProject(p.id),
            questionnaire.get(p.id),
            documentRequests.listByProject(p.id),
            notes.listByProject(p.id),
            billingLineItems.listByProject(p.id),
            grantAgreements.listByProject(p.id),
            billingInstallments.listByProject(p.id),
            documents.listByProject(p.id),
            // Uniquement utile pour un dossier « à rédiger » (Jade) -- interrogé pour tous les
            // statuts par simplicité (programSnapshotService.list() est déjà tolérant aux
            // erreurs/table absente), mais seul un dossier "draft" l'expose plus bas.
            p.status === "draft" ? snapshots.list(p.id) : Promise.resolve([]),
            // Factures fournisseurs (0057) -- expenses_select/project_suppliers_select/
            // document_links_select (0016) et documents_select_portal_full (0045) sont déjà
            // portail- et hiérarchie-compatibles (can_access_grant_project/can_access_client),
            // donc supplierLedgerService.load() fonctionne tel quel avec ce client RLS.
            supplierLedger.load(p.id),
            // Réclamations à venir (0063, Jade) -- milestones_select (0016) est déjà
            // portail-compatible (can_access_grant_project).
            milestones.listByProject(p.id),
          ]);
          // Documents rattachés à une réclamation précise -- dépend des claimRows ci-dessus,
          // donc un aller-retour séparé (une seule requête groupée pour tout le dossier).
          const claimLinks = await documents.listClaimLinks(claimRows.map((c) => c.id));
          const claimDocumentsByClaimId = new Map<string, Array<{ id: string; filename: string }>>();
          for (const link of claimLinks) {
            const list = claimDocumentsByClaimId.get(link.claim_id) ?? [];
            list.push({ id: link.document_id, filename: link.filename });
            claimDocumentsByClaimId.set(link.claim_id, list);
          }
          const upcomingClaims: PortalUpcomingClaim[] = milestoneRows
            .filter((m) => m.type === "claim" && m.status !== "done" && m.status !== "cancelled")
            .map((m) => ({
              id: m.id,
              title: m.title,
              dueDate: m.internal_due_date ?? m.official_due_date,
              estimated: m.source === "ai_proposed",
            }));
          // Convention (0063, Jade) : le document "agreement" le plus récent déjà téléversé --
          // projectDocuments est déjà trié created_at desc (documentsRepository.listByProject).
          const agreementDocument = projectDocuments.find((d) => d.category === "agreement") ?? null;
          // Un montant par fournisseur (0063) -- seulement ceux dont le Budget prévu (0059) est
          // déjà calculé (auto ou manuel), jamais un fournisseur sans aucun montant connu.
          const billingBySupplier: PortalBillerLine[] = ledger.suppliers
            .filter((s) => s.budget.effective != null && s.budget.effective > 0)
            .map((s) => ({ supplierName: s.name, amount: s.budget.effective as number }));
          const supplierInvoices: PortalSupplierInvoice[] = ledger.suppliers.flatMap((s) =>
            s.invoices
              .filter((inv) => inv.status === "compliant")
              .map((inv) => ({
                id: inv.id,
                supplierName: s.name,
                invoiceNumber: inv.invoice_number,
                invoiceDate: inv.invoice_date,
                amount: inv.amount,
                document: inv.document ? { id: inv.document.id, filename: inv.document.filename } : null,
                paymentStatus: inv.paymentStatus,
                paymentStatusUpdatedAt: inv.paymentStatusUpdatedAt,
                paymentProof: inv.paymentProof ? { id: inv.paymentProof.id, filename: inv.paymentProof.filename } : null,
              }))
          );
          const latestSnapshot = snapshotRows[0] ?? null;
          const programSummary: PortalProgramSummary | null =
            p.status === "draft" && latestSnapshot
              ? {
                  description: latestSnapshot.snapshot.description,
                  eligibleExpenses: latestSnapshot.snapshot.eligible_expenses,
                  ineligibleExpenses: latestSnapshot.snapshot.ineligible_expenses,
                  applicationProcess: latestSnapshot.snapshot.application_process,
                  requiredDocuments: latestSnapshot.snapshot.required_documents,
                  minEligibleSpend: latestSnapshot.snapshot.min_eligible_spend,
                  maxAidAmount: latestSnapshot.snapshot.max_aid_amount,
                  aidNotes: latestSnapshot.snapshot.aid_notes,
                  takenAt: latestSnapshot.taken_at,
                }
              : null;
          // Nom du fichier de facture pour chaque versement (0054) -- un seul appel pour tout le
          // dossier plutôt qu'un par versement ; documents_select_portal_full (0045) couvre déjà
          // cette lecture pour le portail.
          const documentFilenameById = new Map(projectDocuments.map((d) => [d.id, d.filename]));
          const agreement = agreements[0] ?? null;
          const programName = programNameById.get(p.program_id) ?? p.grant_programs?.name ?? null;
          const isPariProgram = isPariCnrcProgram(programName);

          const visibleRequests = requestRows.filter(
            (r) => r.visible_in_client_portal && VISIBLE_REQUEST_STATUSES.includes(r.status)
          );
          const requestLinks = await documents.listDocumentRequestLinks(visibleRequests.map((r) => r.id));
          const filenameByRequestId = new Map(requestLinks.map((l) => [l.request_id, l.filename]));

          const toView = (r: DocumentRequestRow): PortalDocumentRequestView => ({
            id: r.id,
            title: r.title,
            instructions: r.instructions,
            documentType: r.document_type,
            dueDate: r.due_date,
            status: r.status,
            statusLabel: DOCUMENT_REQUEST_STATUS_LABELS[r.status] ?? r.status,
            filename: filenameByRequestId.get(r.id) ?? null,
          });

          const claimsWithRequirements: PortalClaimView[] = await Promise.all(
            claimRows.map(async (c): Promise<PortalClaimView> => {
              const requirements = await claimRequirements.listByClaim(c.id);
              return {
                ...c,
                openRequirements: requirements.filter((r) => OPEN_REQUIREMENT_STATUSES.includes(r.status)),
                documentRequests: visibleRequests.filter((r) => r.claim_id === c.id).map(toView),
                documents: claimDocumentsByClaimId.get(c.id) ?? [],
              };
            })
          );

          const projectLevelRequests = visibleRequests.filter((r) => !r.claim_id).map(toView);

          const redaction: PortalRedactionItem[] = questionnaireData.items
            .map((q): PortalRedactionItem | null => {
              const text = q.answer.final_text || q.answer.user_draft || q.answer.ai_draft;
              if (!text) return null;
              const stage: PortalRedactionItem["stage"] = q.answer.final_text
                ? "final"
                : q.answer.user_draft
                  ? "user_draft"
                  : "ai_draft";
              return { id: q.id, prompt: q.prompt, text, stage };
            })
            .filter((item): item is PortalRedactionItem => item !== null);

          return {
            id: p.id,
            name: p.name,
            clientId: p.client_id,
            clientName: p.clients?.name ?? null,
            programName,
            status: p.status,
            statusLabel: GRANT_PROJECT_STATUS_LABELS[p.status] ?? p.status,
            // Jade : une fois une convention lue/saisie (grant_agreements), Début/Fin/Montant
            // approuvé doivent TOUJOURS s'afficher dans le portail -- même si les champs "officiels"
            // du projet (souvent remplis à la main séparément) n'ont jamais été renseignés. Même
            // repli que grantRate/billingDeadline juste en dessous.
            officialStartDate: p.official_start_date ?? agreement?.project_start ?? null,
            officialEndDate: p.official_end_date ?? agreement?.project_end ?? null,
            approvedGrantAmount: p.approved_grant_amount ?? agreement?.grant_amount ?? null,
            totalProjectCost: p.total_project_cost,
            grantRate: p.grant_rate ?? agreement?.grant_rate ?? null,
            isPariProgram,
            pariBalanceRemaining: p.pari_balance_remaining ?? null,
            billingDeadline: agreement?.project_end ?? p.official_end_date,
            paymentDeadlineDate: agreement?.payment_deadline_date ?? null,
            paymentDeadlineDaysAfterEnd: agreement?.payment_deadline_days_after_end ?? null,
            claims: claimsWithRequirements,
            upcomingClaims,
            agreementDocument: agreementDocument ? { id: agreementDocument.id, filename: agreementDocument.filename } : null,
            billingBySupplier,
            redaction,
            documentRequests: projectLevelRequests,
            notes: noteRows,
            billingLineItems: lineItemRows.map((it) => ({ id: it.id, label: it.label, description: it.description, amount: Number(it.amount), hours: it.hours != null ? Number(it.hours) : null, includedInBilling: it.included_in_billing })),
            billingInstallments: installmentRows.map((r) => ({
              id: r.id,
              installmentNumber: r.installment_number,
              periodStart: r.period_start,
              periodEnd: r.period_end,
              amount: Number(r.amount),
              invoiceDescription: r.invoice_description,
              status: r.status,
              clientInvoiceFilename: r.client_invoice_document_id ? (documentFilenameById.get(r.client_invoice_document_id) ?? "Facture envoyée") : null,
              clientInvoiceUploadedAt: r.client_invoice_uploaded_at,
            })),
            programSummary,
            supplierInvoices,
            requiresPaymentProof: p.requires_payment_proof,
          };
        })
      );

      return dossiers.sort((a, b) => a.name.localeCompare(b.name));
    },
  };
}
