"use client";

// Fil de notes partagées avec le client (0046) -- équivalent, côté personnel, de
// PortalNotes.tsx (portail). Une note "Visible pour le client" (coché par défaut)
// apparaît aussi dans son portail ; décochée, elle reste un aide-mémoire interne sur ce
// même fil plutôt que d'aller rouvrir le journal (Journal du dossier, plus bas, réservé
// aux événements automatiques/manuels du personnel).
import { useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { DossierNoteView } from "@/server/services/dossierNotes.service";
import { addDossierNoteAction, deleteDossierNoteAction, type AddDossierNoteFormState } from "./notesActions";

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
      {pending ? "Envoi…" : "Envoyer"}
    </button>
  );
}

function DeleteNoteButton({ noteId, grantProjectId }: { noteId: string; grantProjectId: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await deleteDossierNoteAction(noteId, grantProjectId);
        })
      }
      className="text-xs text-neutral-400 hover:text-red-600 disabled:opacity-50"
    >
      Supprimer
    </button>
  );
}

export function DossierNotes({ grantProjectId, clientId, notes }: { grantProjectId: string; clientId: string; notes: DossierNoteView[] }) {
  const action = addDossierNoteAction.bind(null, grantProjectId, clientId);
  const initialState: AddDossierNoteFormState = { error: null };
  const [state, formAction] = useFormState(action, initialState);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-neutral-900">Notes partagées avec le client</h2>
      <p className="text-xs text-neutral-500">
        Un fil simple, visible dans le portail du client par défaut — décoche « Visible pour le client » pour te laisser
        une note interne sur le même dossier.
      </p>

      <div className="space-y-2 rounded-lg border border-neutral-200 bg-white p-4">
        {notes.length > 0 ? (
          <ol className="space-y-3">
            {notes.map((n) => (
              <li key={n.id} className="text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-neutral-900">{n.authorName}</span>
                  {n.authorRole === "client" && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">Client</span>
                  )}
                  {!n.visibleToClient && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">Interne</span>
                  )}
                  <time className="text-xs text-neutral-400">{formatDateTime(n.createdAt)}</time>
                  <span className="ml-auto">
                    <DeleteNoteButton noteId={n.id} grantProjectId={grantProjectId} />
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-neutral-700">{n.body}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-neutral-400">Aucune note pour l&apos;instant.</p>
        )}
      </div>

      <form action={formAction} className="space-y-2 rounded-lg border border-neutral-200 bg-white p-4">
        <textarea
          name="body"
          required
          rows={2}
          placeholder="Écrire une note…"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-neutral-600">
            <input type="checkbox" name="visible_to_client" defaultChecked className="rounded border-neutral-300" />
            Visible pour le client
          </label>
          <SubmitButton />
        </div>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      </form>
    </section>
  );
}
