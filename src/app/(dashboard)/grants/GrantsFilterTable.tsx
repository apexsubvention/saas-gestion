"use client";

// Filtre par statut + recherche (client ou programme) sur la liste des dossiers --
// entièrement côté client : la liste complète est déjà chargée par la page serveur
// (grantProjectsService(...).list()), donc filtrer en mémoire évite un aller-retour
// serveur à chaque frappe. Import direct de GRANT_PROJECT_STATUS_OPTIONS pour rester
// en phase avec les statuts réels si la liste évolue.
import { useMemo, useState } from "react";
import Link from "next/link";
import { GRANT_PROJECT_STATUS_LABELS, GRANT_PROJECT_STATUS_OPTIONS, grantProjectStatusBadgeClass } from "@/features/grants/constants";
import { DeleteGrantProjectButton } from "./DeleteGrantProjectButton";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // ignore les accents dans la recherche
}

export function GrantsFilterTable({ projects, isAdmin }: { projects: any[]; isAdmin: boolean }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(() => {
    const q = normalize(search.trim());
    return projects.filter((p) => {
      if (status !== "all" && p.status !== status) return false;
      if (!q) return true;
      const clientName = normalize(p.clients?.name ?? "");
      const programName = normalize(p.grant_programs?.name ?? "");
      return clientName.includes(q) || programName.includes(q);
    });
  }, [projects, search, status]);

  const hasFilters = search.trim().length > 0 || status !== "all";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par client ou programme…"
          className="min-w-[16rem] flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700"
        >
          <option value="all">Tous les statuts</option>
          {GRANT_PROJECT_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button
            onClick={() => {
              setSearch("");
              setStatus("all");
            }}
            className="text-sm text-neutral-500 hover:text-neutral-900"
          >
            Réinitialiser
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Projet</th>
              <th className="px-4 py-2 font-medium">Client</th>
              <th className="px-4 py-2 font-medium">Programme</th>
              <th className="px-4 py-2 font-medium">Statut</th>
              <th className="px-4 py-2 font-medium">Montant approuvé</th>
              {isAdmin && <th className="px-4 py-2 font-medium"></th>}
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">
                  Aucun projet pour l&apos;instant.
                </td>
              </tr>
            )}
            {projects.length > 0 && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">
                  Aucun dossier ne correspond à ces filtres.
                </td>
              </tr>
            )}
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-2">
                  <Link href={`/grants/${p.id}`} className="font-medium text-neutral-900 hover:underline">
                    {p.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-neutral-600">{p.clients?.name ?? "—"}</td>
                <td className="px-4 py-2 text-neutral-600">{p.grant_programs?.name ?? "—"}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${grantProjectStatusBadgeClass(p.status)}`}>
                    {GRANT_PROJECT_STATUS_LABELS[p.status] ?? p.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-neutral-600">
                  {p.approved_grant_amount ? `${Number(p.approved_grant_amount).toLocaleString("fr-CA")} $` : "—"}
                </td>
                {isAdmin && (
                  <td className="px-4 py-2 text-right">
                    <DeleteGrantProjectButton grantProjectId={p.id} name={p.name} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {projects.length > 0 && (
        <p className="text-xs text-neutral-400">
          {filtered.length} dossier{filtered.length > 1 ? "s" : ""} affiché{filtered.length > 1 ? "s" : ""} sur {projects.length}
        </p>
      )}
    </div>
  );
}
