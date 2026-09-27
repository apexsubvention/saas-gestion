"use client";

// Fil de notes partagées avec le client, au niveau du CLIENT plutôt que d'un dossier précis
// (0062, Jade) -- « les petites choses discutées en rencontre, pas forcément liées à un
// dossier ». Équivalent, côté personnel, de ClientNotes.tsx (portail) -- même mécanique que
// DossierNotes.tsx (grants/[id]) : une note « Visible pour le client » (coché par défaut)
// apparaît aussi dans son portail ; décochée, elle reste un aide-mémoire interne.
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

function DeleteNoteButton({ noteId, clientId }: { noteId: string; clientId: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await deleteClientNoteAction(noteId, clientId);
        })
      }
      className="text-xs text-neutral-400 hover:text-red-600 disabled:opacity-50"
    >
      Supprimer
    </button>
  );
}

export function ClientNotesPanel({ clientId, notes }: { clientId: string; notes: ClientNoteView[] }) {
  const action = addClientNoteAction.bind(null, clientId);
  const initialState: AddClientNoteFormState = { error: null };
  const [state, formAction] = useFormState(action, initialState);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-neutral-900">Tâches discutées / commentaires</h2>
      <p className="text-xs text-neutral-500">
        Pour les petites choses dites en rencontre ou ailleurs, pas forcément liées à un dossier précis -- un fil
        simple, visible dans le portail du client par défaut, séparé des notes propres à chaque dossier. Décoche
        « Visible pour le client » pour te laisser une note interne sur ce même fil.
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
                    <DeleteNoteButton noteId={n.id} clientId={clientId} />
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
