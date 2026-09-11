import Link from "next/link";
import { ArrowLeft, DatabaseZap } from "lucide-react";
import { createFundingSource } from "./actions";
import { GEOGRAPHIC_LEVEL_OPTIONS, SOURCE_FAMILY_OPTIONS } from "@/features/watch/constants";

export default function NewFundingSourcePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/watch/sources" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Retour aux sources</Link>
        <div className="flex items-center gap-2 text-sm font-medium text-indigo-600"><DatabaseZap className="h-4 w-4" /> Veille</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Ajouter une source</h1>
        <p className="mt-1 text-sm text-slate-500">Enregistre une source à surveiller. Cela ne lance pas encore de collecte automatique.</p>
      </div>

      <form action={createFundingSource} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <Field label="Nom *" name="name" required placeholder="Ex. Business Benefits Finder" />
        <Field label="URL principale *" name="base_url" type="url" required placeholder="https://…" />
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Famille</span><select name="source_family" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm">{SOURCE_FAMILY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Niveau géographique</span><select name="geographic_level" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm">{GEOGRAPHIC_LEVEL_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <div className="grid gap-4 md:grid-cols-2"><Field label="Territoire / portée" name="territory_label" placeholder="Canada, Québec, Estrie, Granby…" /><label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Méthode prévue</span><select name="collection_method" defaultValue="manual" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="manual">Manuel</option><option value="api">API</option><option value="rss">RSS</option><option value="scrape">Scraping</option><option value="email">Courriel / infolettre</option><option value="import">Import</option><option value="unknown">À déterminer</option></select></label></div>
        <div className="grid gap-4 md:grid-cols-2"><label className="flex items-center gap-3 rounded-xl border border-slate-200 p-4"><input type="checkbox" name="is_official" value="true" className="h-4 w-4" /><span><span className="block text-sm font-medium text-slate-800">Source officielle</span><span className="block text-xs text-slate-500">Autorité pour dates, montants, critères et statut.</span></span></label><label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Priorité</span><select name="priority" defaultValue="2" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="1">1 — Critique</option><option value="2">2 — Haute</option><option value="3">3 — Secondaire</option></select></label></div>
        <TextArea label="Notes" name="notes" placeholder="Particularités, fréquence souhaitée, sections à surveiller…" />
        <div className="flex justify-end gap-3 border-t border-slate-100 pt-5"><Link href="/watch/sources" className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Annuler</Link><button className="rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800">Enregistrer la source</button></div>
      </form>
    </div>
  );
}

function Field({ label, name, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) { return <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span><input name={name} {...props} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-300 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></label>; }
function TextArea({ label, name, placeholder }: { label: string; name: string; placeholder?: string }) { return <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span><textarea name={name} rows={4} placeholder={placeholder} className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-300 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></label>; }
