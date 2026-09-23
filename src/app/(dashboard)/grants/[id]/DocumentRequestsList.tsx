"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useTransition } from "react";
import { OpenDocumentButton } from "./OpenDocumentButton";
import {
  DOCUMENT_REQUEST_STATUS_OPTIONS,
  documentRequestStatusBadgeClass,
} from "@/features/grants/constants";
import {
  updateDocumentRequestStatusAction,
  deleteDocumentRequestAction,
  type DocumentRequestFormState,
} from "./documentRequestActions";

export type DocumentRequestListItem = {
  id: string;
  title: string;
  instructions: string | null;
  documentType: string;
  dueDate: string | null;
  status: string;
  claimLabel: string | null;
  file: { filename: string; storagePath: string } | null;
};

// useFormStatus() ne lit l'état d'un <form> que depuis un composant ENFANT de ce
// formulaire, jamais depuis celui qui le rend -- d'où ce composant séparé (même
// découpage que ClaimStatusSelect.tsx : le parent appelle useFormState/rend <form>,
// l'enfant appelle useFormStatus/rend le contrôle).
function StatusSelect({ defaultValue }: { defaultValue: string }) {
  const { pending } = useFormStatus();
  return (
    <select
      name="status"
      defaultValue={defaultValue}
      disabled={pending}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className={`rounded-full border-0 px-2.5 py-1 text-xs font-medium outline-none disabled:opacity-50 ${documentRequestStatusBadgeClass(defaultValue)}`}
    >
      {DOCUMENT_REQUEST_STATUS_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function StatusSelectField({ grantProjectId, requestId, status }: { grantProjectId: string; requestId: string; status: string }) {
  const action = updateDocumentRequestStatusAction.bind(null, grantProjectId, requestId);
  const initialState: DocumentRequestFormState = { error: null };
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form action={formAction} className="inline-flex flex-col gap-1">
      <StatusSelect defaultValue={status} />
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}

function DeleteButton({ grantProjectId, requestId, title }: { grantProjectId: string; requestId: string; title: string }) {
  const [pending, startTransition] = useTransition();

  function remove() {
    if (!confirm(`Supprimer la demande « ${title} » ? Le document déjà reçu, s'il y en a un, reste conservé.`)) return;
    startTransition(async () => {
      await deleteDocumentRequestAction(grantProjectId, requestId);
    });
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={pending}
      className="text-xs font-medium text-red-700 hover:text-red-900 disabled:opacity-50"
    >
      {pending ? "..." : "Supprimer"}
    </button>
  );
}

export function DocumentRequestsList({ grantProjectId, items }: { grantProjectId: string; items: DocumentRequestListItem[] }) {
  if (items.length === 0) {
    return <p className="px-4 py-6 text-sm text-neutral-400">Aucun document demandé pour l&apos;instant.</p>;
  }

  return (
    <div className="divide-y divide-neutral-100">
      {items.map((item) => (
        <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="font-medium text-neutral-900">
              {item.title}
              {item.claimLabel && <span className="ml-2 text-xs font-normal text-neutral-500">({item.claimLabel})</span>}
            </p>
            <p className="text-xs text-neutral-500">
              {item.documentType}
              {item.dueDate && <span className="ml-2">Échéance : {new Date(item.dueDate).toLocaleDateString("fr-CA")}</span>}
              {item.instructions && <span className="ml-2">— {item.instructions}</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {item.file && <OpenDocumentButton storagePath={item.file.storagePath} filename={item.file.filename} />}
            <StatusSelectField grantProjectId={grantProjectId} requestId={item.id} status={item.status} />
            <DeleteButton grantProjectId={grantProjectId} requestId={item.id} title={item.title} />
          </div>
        </div>
      ))}
    </div>
  );
}
