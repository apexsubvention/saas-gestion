import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { programsService } from "@/server/services/programs.service";
import { matchNeedsToPrograms } from "@/features/programs/match";

function money(n: number | null) {
  return n == null ? null : new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
}

const BADGE: Record<string, string> = {
  Prioritaire: "bg-violet-100 text-violet-800",
  "À évaluer": "bg-violet-50 text-violet-700",
  "Pertinence faible": "bg-neutral-100 text-neutral-600",
};

// Programmes (ajoutés dans « Programmes ») dont la nature correspond aux Besoins actuels du
// client. Calculé à chaque affichage : aucune liaison n'est stockée, elle suit donc toujours
// les besoins et les programmes à jour.
export async function CompatiblePrograms({ supabase, needs }: { supabase: SupabaseClient; needs: string | null }) {
  const text = (needs ?? "").trim();
  if (!text) {
    return <p className="text-sm text-neutral-400">Renseigne les besoins actuels ci-dessus pour voir les programmes compatibles.</p>;
  }

  const service = programsService(supabase);
  const [programs, examples] = await Promise.all([service.list(), service.listAllExamples()]);
  if (programs.length === 0) {
    return (
      <p className="text-sm text-neutral-400">
        Aucun programme enregistré. <Link href="/programs/new" className="text-blue-600 hover:underline">Ajouter un programme</Link> (avec l&apos;URL de sa page) pour voir les correspondances.
      </p>
    );
  }

  const { matches, hiddenCount, needThemes } = matchNeedsToPrograms(text, programs, examples);

  if (matches.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        Aucun des {programs.length} programme(s) enregistré(s) ne correspond clairement à ces besoins
        {needThemes.length ? ` (univers repérés : ${needThemes.join(", ")})` : ""}.{" "}
        <Link href="/programs/new" className="text-blue-600 hover:underline">Ajouter un programme</Link>
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {needThemes.length > 0 && <p className="text-xs text-neutral-500">Univers repérés dans les besoins : {needThemes.join(", ")}.</p>}
      <ul className="space-y-3">
        {matches.map(({ program, result, sharedThemes }) => (
          <li key={program.id} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <Link href={`/programs/${program.id}`} className="text-sm font-semibold text-neutral-900 hover:underline">{program.name}</Link>
                {program.agency && <p className="text-xs text-neutral-500">{program.agency}</p>}
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${BADGE[result.priorityLabel] ?? BADGE["Pertinence faible"]}`}>
                {result.priorityLabel} · {result.score}/100
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-neutral-600">
              {sharedThemes.length > 0 && <span>Compatible : {sharedThemes.join(", ")}</span>}
              {result.potentialRate != null && <span>Jusqu&apos;à {result.potentialRate} % remboursé</span>}
              {money(result.potentialAmount) && <span>Max. {money(result.potentialAmount)}</span>}
              <span>{result.deadlineStatus}</span>
            </div>
            <div className="mt-2 space-y-1 text-xs">
              {result.reasons.slice(0, 3).map((r, i) => (
                <p key={`r${i}`} className="flex gap-1.5 text-emerald-800"><span>✓</span><span>{r}</span></p>
              ))}
              {result.criteriaToVerify.slice(0, 2).map((c, i) => (
                <p key={`c${i}`} className="flex gap-1.5 text-amber-800"><span>?</span><span>{c}</span></p>
              ))}
              {result.similarAwards.map((a) => (
                <p key={a.id} className="flex gap-1.5 text-neutral-600"><span>↳</span><span>Exemple financé : {a.project_title}{a.recipient_name ? ` (${a.recipient_name})` : ""}</span></p>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 && <p className="text-xs text-neutral-400">{hiddenCount} autre(s) programme(s) compatible(s) non affiché(s) — voir la liste des programmes.</p>}
      <p className="text-xs text-neutral-400">Score de pertinence explicable à partir des besoins et de la fiche du programme — pas une probabilité d&apos;acceptation.</p>
    </div>
  );
}
