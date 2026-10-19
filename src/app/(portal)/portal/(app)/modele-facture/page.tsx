import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePortalContext } from "@/lib/portal/auth";
import { createClient } from "@/lib/supabase/server";
import { invoiceTemplatesService } from "@/server/services/invoiceTemplates.service";
import { INVOICE_TEMPLATE_FIELDS } from "@/features/invoices/invoiceTemplateFields";
import { TemplateUploadForm, DownloadTemplateButton } from "./TemplateUploadForm";

// Jade (0079) : la préparation automatique d'un modèle vierge passe par Claude (jusqu'à ~50 s).
export const maxDuration = 90;

// « Modèle de facture » (0079, Jade) : le fournisseur (ex. Sitegrow) téléverse SA facture vierge
// (Word) une fois ; Apex la remplit ensuite pour chaque versement du plan de facturation.
export default async function InvoiceTemplatePage() {
  const ctx = await requirePortalContext();
  const supabase = await createClient();
  const template = await invoiceTemplatesService(supabase as unknown as SupabaseClient).getForClient(ctx.clientId);
  const found = new Set(template?.tags ?? []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Modèle de facture</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Téléversez votre facture vierge (fichier Word) une seule fois. Pour chaque versement de votre plan de facturation, Apex
          prépare ensuite la facture dans votre modèle : description des travaux, période, montant et taxes. Vous n&apos;avez qu&apos;à
          inscrire votre numéro de facture, corriger les dates au besoin, puis la télécharger ou l&apos;envoyer.
        </p>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        {template ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-neutral-800">
              ✓ Modèle enregistré{template.filename ? ` : ${template.filename}` : ""}
              <span className="ml-2 text-xs text-neutral-400">le {new Date(template.updated_at).toLocaleDateString("fr-CA")}</span>
            </p>
            <DownloadTemplateButton />
          </div>
        ) : (
          <p className="text-sm text-neutral-600">Aucun modèle pour l&apos;instant.</p>
        )}
        <div className="mt-3 border-t border-neutral-100 pt-3">
          <TemplateUploadForm replacing={!!template} />
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-neutral-900">Comment Apex remplit votre modèle</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Apex repère automatiquement où écrire chaque information (« Facture n° », « Date », la cellule à côté de « Total »...).
          Pour choisir vous-même l&apos;endroit exact, écrivez dans votre fichier Word la balise correspondante, par exemple{" "}
          <code className="rounded bg-neutral-100 px-1">{"{{numero_facture}}"}</code>, là où la valeur doit apparaître : elle
          garde la police et la mise en forme de cet endroit.
        </p>
        <table className="mt-3 w-full text-sm">
          <tbody>
            {INVOICE_TEMPLATE_FIELDS.map((f) => (
              <tr key={f.tag} className="border-b border-neutral-100 last:border-0">
                <td className="py-1.5 pr-3 font-mono text-xs text-neutral-700">{`{{${f.tag}}}`}</td>
                <td className="py-1.5 pr-3 text-neutral-800">{f.label}</td>
                <td className="py-1.5 text-right text-xs">
                  {template ? (found.has(f.tag) ? <span className="text-emerald-700">✓ dans votre modèle</span> : <span className="text-neutral-400">absent</span>) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
