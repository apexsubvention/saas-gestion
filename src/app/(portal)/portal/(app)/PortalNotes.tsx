"use client";

// Fil de notes partagées avec l'équipe Apex (0046) -- équivalent, côté portail, de
// DossierNotes.tsx (dossier interne). N'affiche que les notes déjà visibles au client
// (dossierNotesService filtre via RLS -- dossier_notes_select_portal), donc toujours
// visibleToClient = true ici, sauf pour d'éventuelles notes du personnel marquées
// internes qui n'arrivent tout simplement jamais jusqu'ici.
import { useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { DossierNoteView } from "@/server/services/dossierNotes.service";
import { addPortalNoteAction, deletePortalNoteAction, type AddPortalNoteFormState } from "./notesActions";

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

function DeleteNoteButton({ noteId }: { noteId: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await deletePortalNoteAction(noteId);
        })
      }
      className="text-xs text-neutral-400 hover:text-red-600 disabled:opacity-50"
    >
      Supprimer
    </button>
  );
}

export function PortalNotes({
  grantProjectId,
  clientId,
  notes,
  currentOrgUserId,
}: {
  grantProjectId: string;
  clientId: string;
  notes: DossierNoteView[];
  currentOrgUserId: string | null;
}) {
  const action = addPortalNoteAction.bind(null, grantProjectId, clientId);
  const initialState: AddPortalNoteFormState = { error: null };
  const [state, formAction] = useFormState(action, initialState);

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Notes échangées avec ton équipe</h3>
      <div className="space-y-2 rounded-md border border-neutral-100 p-3">
        {notes.length > 0 ? (
          <ol className="space-y-3">
            {notes.map((n) => (
              <li key={n.id} className="text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-neutral-900">
                    {n.authorRole === "staff" ? n.authorName : n.authorOrgUserId === currentOrgUserId ? "Toi" : n.authorName}
                  </span>
                  <time className="text-xs text-neutral-400">{formatDateTime(n.createdAt)}</time>
                  {n.authorOrgUserId === currentOrgUserId && (
                    <span className="ml-auto">
                      <DeleteNoteButton noteId={n.id} />
                    </span>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-neutral-700">{n.body}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-neutral-400">Aucun échange pour l&apos;instant.</p>
        )}
      </div>

      <form action={formAction} className="space-y-2">
        <textarea
          name="body"
          required
          rows={2}
          placeholder="Écrire un message à ton équipe chez Apex…"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <div className="flex justify-end">
          <SubmitButton />
        </div>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      </form>
    </div>
  );
}
