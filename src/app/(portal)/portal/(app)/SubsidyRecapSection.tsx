"use client";

// « Résumé de la subvention approuvée » (Jade) -- section repliable dans la fenêtre d'un dossier
// du portail : un clic affiche, en langage simple, ce que le client débourse, ce qu'il reçoit et
// ce que ça lui coûte réellement. Calcul : src/features/billing/subsidyRecap.ts.
import { useState } from "react";
import { formatRecapMoney, type SubsidyRecap } from "@/features/billing/subsidyRecap";

export function SubsidyRecapSection({ recap }: { recap: SubsidyRecap }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-emerald-50"
      >
        <span>
          <span className="block text-sm font-semibold text-emerald-900">Résumé de la subvention approuvée</span>
          <span className="block text-xs text-emerald-800">
            Tu débourses {formatRecapMoney(recap.totalToPay)} · tu récupères {formatRecapMoney(recap.totalReimbursed)}
          </span>
        </span>
        <span className="shrink-0 text-xs font-medium text-emerald-700">{open ? "Masquer ▲" : "Voir le détail ▼"}</span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-emerald-200 bg-white px-4 py-4 text-sm text-neutral-800">
          <div>
            <h4 className="font-semibold text-neutral-900">Montants à débourser pour obtenir le remboursement</h4>
            <ul className="mt-2 space-y-1.5">
              {recap.lines.map((l) => (
                <li key={`pay-${l.label}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span>{l.label}</span>
                    <span className="shrink-0 font-medium tabular-nums">{formatRecapMoney(l.toPay)}</span>
                  </div>
                  {l.kind === "salary" && (
                    <p className="text-xs text-neutral-500">→ À justifier avec le talon de paie, s&apos;il n&apos;a pas déjà été envoyé.</p>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-neutral-900">Remboursements qui seront reçus</h4>
            <ul className="mt-2 space-y-1.5">
              {recap.lines.map((l) => (
                <li key={`back-${l.label}`} className="flex items-baseline justify-between gap-3">
                  <span>{l.reimbursedLabel}</span>
                  <span className="shrink-0 font-medium tabular-nums text-emerald-700">{formatRecapMoney(l.reimbursed)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-md bg-neutral-50 p-3">
            <h4 className="font-semibold text-neutral-900">En résumé</h4>
            <div className="mt-2 space-y-1">
              <div className="flex items-baseline justify-between gap-3">
                <span>Total à débourser</span>
                <span className="font-semibold tabular-nums">{formatRecapMoney(recap.totalToPay)}</span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span>Total remboursé</span>
                <span className="font-semibold tabular-nums text-emerald-700">{formatRecapMoney(recap.totalReimbursed)}</span>
              </div>
            </div>
          </div>

          {recap.notes.length > 0 && (
            <div className="space-y-2 text-neutral-700">
              {recap.notes.map((n) => (
                <p key={n}>{n}</p>
              ))}
            </div>
          )}

          <p className="text-xs text-neutral-400">Montants avant taxes, selon la convention et les fournisseurs prévus au dossier.</p>
        </div>
      )}
    </div>
  );
}
