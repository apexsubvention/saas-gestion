"use client";

// MFOR -- « Marche à suivre Services Québec » (Jade) : offre de service (texte collé ou document
// du dossier) + numéro de téléphone du bureau -> Apex rédige les étapes pour le client (appeler,
// présenter le besoin de formation en puces, ce qu'il faut éviter de mentionner). Le texte reste
// modifiable, puis devient une tâche dans le portail du client.
import { useState, useTransition } from "react";
import { createMforGuideTaskAction, generateMforGuideAction } from "./mforGuideActions";

const input = "w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm";
const btn = "rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50";

export function MforGuidePanel({
  grantProjectId,
  clientId,
  clientName,
  documents,
}: {
  grantProjectId: string;
  clientId: string;
  clientName: string;
  documents: Array<{ id: string; filename: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [offerText, setOfferText] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [phone, setPhone] = useState("");
  const [officeName, setOfficeName] = useState("");
  const [title, setTitle] = useState("Appeler votre bureau de Services Québec");
  const [dueDate, setDueDate] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [generating, startGenerate] = useTransition();
  const [creating, startCreate] = useTransition();

  function generate() {
    setError(null);
    setDone(false);
    startGenerate(async () => {
      const r = await generateMforGuideAction(grantProjectId, { offerText, documentId: documentId || null, phone, officeName });
      if (r.error) setError(r.error);
      else setText(r.text ?? "");
    });
  }

  function create() {
    setError(null);
    startCreate(async () => {
      const r = await createMforGuideTaskAction(grantProjectId, clientId, { title, text, dueDate: dueDate || null });
      if (r.error) setError(r.error);
      else {
        setDone(true);
        setText("");
      }
    });
  }

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-indigo-900">Marche à suivre Services Québec (MFOR)</p>
          <p className="text-xs text-indigo-800">
            À partir de l&apos;offre de service : ce que {clientName} doit dire en appelant son bureau de Services Québec, et ce qu&apos;il doit éviter
            de mentionner. Ajoutée comme tâche dans son portail.
          </p>
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} className={`${btn} border border-indigo-300 bg-white text-indigo-800 hover:bg-indigo-50`}>
          {open ? "Fermer" : "Générer la marche à suivre"}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          <label className="block text-xs font-medium text-neutral-700">
            Offre de service (colle le texte)
            <textarea value={offerText} onChange={(e) => setOfferText(e.target.value)} rows={6} className={`${input} mt-1 bg-white`} placeholder="Colle ici l'offre de service rédigée…" />
          </label>
          {documents.length > 0 && (
            <label className="block text-xs font-medium text-neutral-700">
              … ou lis-la dans un document du dossier
              <select value={documentId} onChange={(e) => setDocumentId(e.target.value)} className={`${input} mt-1 bg-white`}>
                <option value="">Aucun document</option>
                {documents.map((d) => (
                  <option key={d.id} value={d.id}>{d.filename}</option>
                ))}
              </select>
            </label>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-neutral-700">
              Téléphone du bureau de Services Québec
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="ex. 418 643-4721" className={`${input} mt-1 bg-white`} />
            </label>
            <label className="block text-xs font-medium text-neutral-700">
              Nom du bureau (optionnel)
              <input value={officeName} onChange={(e) => setOfficeName(e.target.value)} placeholder="ex. le bureau de Services Québec de Laval" className={`${input} mt-1 bg-white`} />
            </label>
          </div>
          <button
            type="button"
            onClick={generate}
            disabled={generating || (!offerText.trim() && !documentId)}
            className={`${btn} bg-indigo-700 text-white hover:bg-indigo-800`}
          >
            {generating ? "Rédaction…" : text ? "Régénérer" : "Générer"}
          </button>

          {text && (
            <div className="space-y-2 rounded-md border border-neutral-200 bg-white p-3">
              <label className="block text-xs font-medium text-neutral-700">
                Titre de la tâche
                <input value={title} onChange={(e) => setTitle(e.target.value)} className={`${input} mt-1`} />
              </label>
              <label className="block text-xs font-medium text-neutral-700">
                Marche à suivre (modifiable — c&apos;est la note que verra le client)
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={14} className={`${input} mt-1 font-normal`} />
              </label>
              <label className="block w-48 text-xs font-medium text-neutral-700">
                Échéance (optionnel)
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`${input} mt-1`} />
              </label>
              <button type="button" onClick={create} disabled={creating || !text.trim()} className={`${btn} bg-neutral-900 text-white hover:bg-neutral-800`}>
                {creating ? "Création…" : `Ajouter la tâche dans le portail de ${clientName}`}
              </button>
            </div>
          )}
          {done && <p className="text-sm text-emerald-700">✓ Tâche ajoutée dans le portail du client (liste ci-dessous).</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
