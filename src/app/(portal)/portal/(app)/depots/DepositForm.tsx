"use client";

// Ajouter un dépôt reçu (0079, Jade) -- date, montant reçu, dossier, provenance, référence, note et
// preuve (chèque, avis de virement...). Le formulaire se vide après chaque ajout réussi.
import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { addDepositAction, type DepositFormState } from "./depositActions";
import { usePortalAccess } from "../PortalAccessContext";
import { FileInput } from "@/components/forms/FileInput";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
      {pending ? "Ajout..." : "Ajouter le dépôt"}
    </button>
  );
}

const field = "w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm";
const labelCls = "block text-xs font-medium text-neutral-600";

export function DepositForm({ dossiers }: { dossiers: Array<{ id: string; name: string; clientName: string | null }> }) {
  const { canEdit } = usePortalAccess();
  const [state, formAction] = useFormState(addDepositAction, { error: null } as DepositFormState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.message) formRef.current?.reset();
  }, [state]);

  if (!canEdit) return null;
  const today = new Date().toISOString().slice(0, 10);
  const showClient = new Set(dossiers.map((d) => d.clientName)).size > 1;

  return (
    <form ref={formRef} action={formAction} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-neutral-900">Nouveau dépôt reçu</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1">
          <span className={labelCls}>Date du dépôt *</span>
          <input type="date" name="deposit_date" required defaultValue={today} max={today} className={field} />
        </label>
        <label className="space-y-1">
          <span className={labelCls}>Montant reçu *</span>
          <input name="amount" required inputMode="decimal" placeholder="ex. 12 500,00" className={field} />
        </label>
        <label className="space-y-1">
          <span className={labelCls}>Dossier</span>
          <select name="grant_project_id" defaultValue={dossiers.length === 1 ? dossiers[0]!.id : ""} className={field}>
            <option value="">— Aucun dossier précis —</option>
            {dossiers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {showClient && d.clientName ? ` (${d.clientName})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className={labelCls}>Provenance</span>
          <input name="payer" placeholder="ex. Services Québec, PARI CNRC" className={field} />
        </label>
        <label className="space-y-1">
          <span className={labelCls}>Référence</span>
          <input name="reference" placeholder="n° de chèque, de virement..." className={field} />
        </label>
        <label className="space-y-1">
          <span className={labelCls}>Preuve du dépôt</span>
          <FileInput name="file" accept=".pdf,.png,.jpg,.jpeg,.heic,.webp" className="w-full text-xs" />
        </label>
      </div>
      <label className="block space-y-1">
        <span className={labelCls}>Note</span>
        <input name="note" placeholder="ex. 2e versement de la subvention" className={field} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton />
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state.message && <span className="text-sm text-emerald-700">✓ {state.message}</span>}
      </div>
    </form>
  );
}
