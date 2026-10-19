"use client";

// Liste des dépôts reçus (0079, Jade) : filtres par année et par dossier, total, preuve à ouvrir,
// et export CSV (Excel) pour la comptable.
import { useMemo, useState, useTransition } from "react";
import type { SubsidyDeposit } from "@/server/services/subsidyDeposits.service";
import { PortalOpenDocumentButton } from "../PortalOpenDocumentButton";
import { usePortalAccess } from "../PortalAccessContext";
import { deleteDepositAction } from "./depositActions";

const money = (n: number) => new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2 }).format(n);

function csvCell(v: string) {
  return /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function exportCsv(rows: SubsidyDeposit[]) {
  // Point-virgule + virgule décimale : s'ouvre directement dans Excel en français.
  const header = ["Date du dépôt", "Montant reçu", "Dossier", "Client", "Provenance", "Référence", "Preuve", "Note"];
  const lines = rows.map((d) =>
    [d.depositDate, d.amount.toFixed(2).replace(".", ","), d.grantProjectName ?? "", d.clientName ?? "", d.payer ?? "", d.reference ?? "", d.document?.filename ?? "", d.note ?? ""].map(csvCell).join(";")
  );
  const blob = new Blob(["\uFEFF" + [header.join(";"), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `depots-recus-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function DeleteButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm("Retirer ce dépôt de la liste ? La preuve reste dans tes documents.")) return;
          start(async () => {
            const r = await deleteDepositAction(id);
            if (r.error) setError(r.error);
          });
        }}
        className="text-xs text-neutral-400 hover:text-red-600 disabled:opacity-50"
      >
        {pending ? "…" : "Retirer"}
      </button>
      {error && <span className="block text-xs text-red-600">{error}</span>}
    </>
  );
}

export function DepositsTable({ deposits }: { deposits: SubsidyDeposit[] }) {
  const { canEdit } = usePortalAccess();
  const years = useMemo(() => [...new Set(deposits.map((d) => d.depositDate.slice(0, 4)))].sort().reverse(), [deposits]);
  const dossierOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of deposits) m.set(d.grantProjectId ?? "", d.grantProjectName ?? "Sans dossier précis");
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [deposits]);
  const [year, setYear] = useState("");
  const [dossier, setDossier] = useState<string | null>(null);

  const rows = deposits.filter((d) => (!year || d.depositDate.startsWith(year)) && (dossier == null || (d.grantProjectId ?? "") === dossier));
  const total = Math.round(rows.reduce((s, d) => s + d.amount, 0) * 100) / 100;
  const showClient = new Set(deposits.map((d) => d.clientName)).size > 1;

  if (deposits.length === 0) {
    return <div className="rounded-lg border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-400">Aucun dépôt inscrit pour l&apos;instant.</div>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-2">
        <select value={year} onChange={(e) => setYear(e.target.value)} className="rounded-md border border-neutral-300 px-2 py-1 text-xs">
          <option value="">Toutes les années</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        {dossierOptions.length > 1 && (
          <select value={dossier ?? "*"} onChange={(e) => setDossier(e.target.value === "*" ? null : e.target.value)} className="rounded-md border border-neutral-300 px-2 py-1 text-xs">
            <option value="*">Tous les dossiers</option>
            {dossierOptions.map(([id, name]) => (
              <option key={id || "none"} value={id}>{name}</option>
            ))}
          </select>
        )}
        <span className="ml-auto text-sm text-neutral-700">
          {rows.length} dépôt{rows.length > 1 ? "s" : ""} — <strong>{money(total)}</strong>
        </span>
        <button type="button" onClick={() => exportCsv(rows)} className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100">
          Exporter (Excel)
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 text-right font-medium">Montant reçu</th>
              <th className="px-4 py-2 font-medium">Dossier</th>
              <th className="px-4 py-2 font-medium">Provenance / référence</th>
              <th className="px-4 py-2 font-medium">Preuve</th>
              {canEdit && <th className="px-4 py-2" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="border-b border-neutral-100 align-top last:border-0">
                <td className="whitespace-nowrap px-4 py-2 text-neutral-900">{d.depositDate}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-medium text-neutral-900">{money(d.amount)}</td>
                <td className="px-4 py-2 text-neutral-700">
                  {d.grantProjectName ?? <span className="text-neutral-400">—</span>}
                  {showClient && d.clientName && <span className="block text-xs text-neutral-400">{d.clientName}</span>}
                  {d.note && <span className="block text-xs text-neutral-500">{d.note}</span>}
                </td>
                <td className="px-4 py-2 text-neutral-700">
                  {d.payer ?? <span className="text-neutral-400">—</span>}
                  {d.reference && <span className="block text-xs text-neutral-500">Réf. {d.reference}</span>}
                </td>
                <td className="px-4 py-2">
                  {d.document ? <PortalOpenDocumentButton documentId={d.document.id} filename={d.document.filename} /> : <span className="text-xs text-amber-700">Preuve manquante</span>}
                </td>
                {canEdit && (
                  <td className="px-4 py-2 text-right">
                    <DeleteButton id={d.id} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
