import Link from "next/link";
import { ArrowLeft, Radar } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { createFundingOpportunity } from "./actions";
import { FUNDING_TYPE_OPTIONS } from "@/features/watch/constants";

export default async function NewFundingOpportunityPage() {
  await requireOrgContext();
  const supabase = await createClient();
  const { data: sources, error } = await supabase
    .from("funding_sources")
    .select("id,name,is_official,active")
    .eq("active", true)
    .order("is_official", { ascending: false })
    .order("name");

  if (error) throw error;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/watch" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Retour à la veille</Link>
        <div className="flex items-center gap-2 text-sm font-medium text-indigo-600"><Radar className="h-4 w-4" /> Veille</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Ajouter une opportunité</h1>
        <p className="mt-1 text-sm text-slate-500">Crée la fiche canonique du programme et rattache sa source officielle si elle est connue.</p>
      </div>

      <form action={createFundingOpportunity} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <Section title="Programme canonique">
          <Field label="Nom du programme *" name="title" required placeholder="Ex. Programme d'aide à l'innovation" />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Organisme responsable" name="organization" placeholder="Ex. Investissement Québec" />
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Type d'aide</span><select name="funding_type" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="">Non précisé</option>{FUNDING_TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div>
          <TextArea label="Résumé" name="summary" placeholder="Ce que finance le programme et pourquoi il mérite d'être surveillé…" />
        </Section>

        <Section title="Source officielle">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Source officielle</span><select name="official_source_id" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="">À confirmer</option>{(sources ?? []).map((source) => <option key={source.id} value={source.id}>{source.name}{source.is_official ? " · officielle" : ""}</option>)}</select><span className="mt-1 block text-xs text-slate-400">Si la source n'existe pas encore, crée-la d'abord dans Sources surveillées.</span></label>
            <Field label="URL officielle" name="official_url" type="url" placeholder="https://…" />
          </div>
        </Section>

        <Section title="Financement et calendrier">
          <div className="grid gap-4 md:grid-cols-4">
            <Field label="Montant min. ($)" name="min_amount" type="number" min="0" step="0.01" />
            <Field label="Montant max. ($)" name="max_amount" type="number" min="0" step="0.01" />
            <Field label="Taux (%)" name="funding_rate" type="number" min="0" max="100" step="0.01" />
            <Field label="Score de pertinence" name="relevance_score" type="number" min="0" max="100" placeholder="0–100" />
          </div>
          <div className="grid gap-4 md:grid-cols-2"><Field label="Date d'ouverture" name="open_date" type="date" /><Field label="Date limite" name="deadline" type="date" /></div>
        </Section>

        <Section title="Admissibilité">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Catégories" name="categories" placeholder="innovation, exportation, RH" hint="Sépare par des virgules." />
            <Field label="Secteurs admissibles" name="eligible_sectors" placeholder="manufacturier, technologie, tourisme" hint="Sépare par des virgules." />
          </div>
          <Field label="Dépenses admissibles" name="eligible_expenses" placeholder="salaires, équipement, consultants" hint="Sépare par des virgules." />
          <TextArea label="Critères d'admissibilité" name="eligibility_criteria" placeholder="Taille d'entreprise, localisation, revenus, type de projet…" />
          <TextArea label="Notes internes" name="notes" placeholder="Analyse Apex, points à confirmer, commentaires…" />
        </Section>

        <Section title="Territoire principal">
          <p className="text-xs text-slate-500">Cette première ligne sert aux filtres. D'autres territoires pourront être rattachés ensuite à la fiche.</p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Niveau</span><select name="scope_level" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="canada">Canada</option><option value="province_territory">Province / territoire</option><option value="region">Région</option><option value="mrc_equivalent">MRC / équivalent</option><option value="municipality">Municipalité</option></select></label>
            <Field label="Province / territoire" name="province_territory" placeholder="Québec" />
            <Field label="Région" name="region" placeholder="Estrie" />
            <Field label="MRC / équivalent" name="mrc_equivalent" placeholder="Haute-Yamaska" />
            <Field label="Municipalité" name="municipality" placeholder="Granby" />
          </div>
        </Section>

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
          <Link href="/watch" className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Annuler</Link>
          <button className="rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800">Ajouter à la veille</button>
        </div>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section className="space-y-4"><h2 className="text-sm font-semibold text-slate-900">{title}</h2>{children}</section>; }
function Field({ label, name, hint, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; hint?: string }) { return <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span><input name={name} {...props} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-300 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />{hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}</label>; }
function TextArea({ label, name, placeholder }: { label: string; name: string; placeholder?: string }) { return <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span><textarea name={name} rows={4} placeholder={placeholder} className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-300 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></label>; }
