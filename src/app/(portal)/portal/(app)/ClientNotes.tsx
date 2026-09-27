"use client";

// Fil de notes partagées avec l'équipe Apex, au niveau du CLIENT plutôt que d'un dossier précis
// (0062, Jade) -- « les petites choses discutées en rencontre, pas forcément liées à un
// dossier ». Équivalent, côté portail, de ClientNotesPanel.tsx (admin) -- même mécanique que
// PortalNotes.tsx (par dossier). N'affiche que les notes déjà visibles au client (RLS
// client_notes_select_portal), donc toujours visibleToClient = true ici.
import { useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { ClientNoteView } from "@/server/services/clientNotes.service";
import { addClientNoteAction, deleteClientNoteAction, type AddClientNoteFormState } from "./notesActions";

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
          await deleteClientNoteAction(noteId);
        })
      }
      className="text-xs text-neutral-400 hover:text-red-600 disabled:opacity-50"
    >
      Supprimer
    </button>
  );
}

export function ClientNotes({
  clientId,
  clientLabel,
  notes,
  currentOrgUserId,
}: {
  clientId: string;
  // Affiché dans le titre quand ce fil concerne un client enfant plutôt que le compte courant
  // (colonne "Dossiers de tes clients") -- absent pour tes propres notes, pour ne pas répéter
  // ton propre nom.
  clientLabel?: string;
  notes: ClientNoteView[];
  currentOrgUserId: string | null;
}) {
  const action = addClientNoteAction.bind(null, clientId);
  const initialState: AddClientNoteFormState = { error: null };
  const [state, formAction] = useFormState(action, initialState);

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-neutral-200 bg-neutral-50/60 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Tâches discutées / commentaires{clientLabel ? ` — ${clientLabel}` : ""}
      </h3>
      <p className="text-xs text-neutral-400">
        Pas forcément lié à un dossier précis -- les petites choses dites en rencontre ou ailleurs.
      </p>
      <div className="space-y-2 rounded-md border border-neutral-200 bg-white p-3">
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
          <p className="text-sm text-neutral-400">Aucune note pour l&apos;instant.</p>
        )}
      </div>

      <form action={formAction} className="space-y-2">
        <textarea
          name="body"
          required
          rows={2}
          placeholder="Écrire une note à ton équipe chez Apex…"
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
