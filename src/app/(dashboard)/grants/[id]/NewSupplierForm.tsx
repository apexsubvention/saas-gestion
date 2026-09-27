"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createSupplierAction, type CreateSupplierFormState } from "./actions";

function SubmitButton({ isEmployee }: { isEmployee: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? "Ajout..." : isEmployee ? "+ Salarié" : "+ Fournisseur"}
    </button>
  );
}

// clients : liste des clients Apex (hors le client de ce dossier) pour pouvoir lier
// précisément un fournisseur qui EST lui-même un client Apex (ex. Sitegrow) -- c'est ce
// lien qui alimente son portail. Facultatif : un fournisseur externe ordinaire n'a pas
// besoin d'être lié.
//
// suggestEmployee (0065, Jade -- PARI CNRC/IRAP) : coche "Salarié interne" par défaut sur un
// dossier de ce type de programme (même signal que isPariCnrcProgram) -- toujours modifiable,
// jamais imposé : Jade garde la main pour un fournisseur externe ponctuel même sur ce programme.
export function NewSupplierForm({ grantProjectId, clients, suggestEmployee = false }: { grantProjectId: string; clients: Array<{ id: string; name: string }>; suggestEmployee?: boolean }) {
  const action = createSupplierAction.bind(null, grantProjectId);
  const initialState: CreateSupplierFormState = { error: null };
  const [state, formAction] = useFormState(action, initialState);
  const [isEmployee, setIsEmployee] = useState(suggestEmployee);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <label className="flex items-center gap-1.5 text-sm font-medium text-neutral-700">
        <input type="checkbox" name="is_employee" checked={isEmployee} onChange={(e) => setIsEmployee(e.target.checked)} />
        Salarié interne
      </label>
      <div className="space-y-1">
        <label className="text-sm font-medium text-neutral-700">{isEmployee ? "Nom du salarié" : "Nom"}</label>
        <input name="name" type="text" required className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
      </div>
      {isEmployee ? (
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Rôle</label>
          <input name="role" type="text" placeholder="Ex. Ingénieur logiciel" className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
        </div>
      ) : (
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Contact</label>
          <input name="contact" type="text" className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
        </div>
      )}
      <div className="space-y-1">
        <label className="text-sm font-medium text-neutral-700">Budget prévu</label>
        <input
          name="budget_amount"
          type="number"
          step="0.01"
          className="w-28 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        />
      </div>
      {!isEmployee && (
        <>
          <div className="space-y-1">
            <label className="text-sm font-medium text-neutral-700">Fréquence de facturation</label>
            <input
              name="billing_frequency"
              type="text"
              placeholder="Mensuelle, trimestrielle..."
              className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-neutral-700">Jour attendu</label>
            <input
              name="expected_invoice_day"
              type="number"
              min={1}
              max={31}
              className="w-20 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="min-w-[220px] flex-1 space-y-1">
            <label className="text-sm font-medium text-neutral-700">Quoi inscrire sur la facture</label>
            <input
              name="invoice_description_requirements"
              type="text"
              placeholder="Ex. décrire les services en lien avec les catégories admissibles du programme"
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>
          {clients.length > 0 && (
            <div className="space-y-1">
              <label className="text-sm font-medium text-neutral-700">Ce fournisseur est un client Apex</label>
              <select
                name="supplier_client_id"
                defaultValue=""
                className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              >
                <option value="">Non (fournisseur externe)</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}
      <SubmitButton isEmployee={isEmployee} />
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
