"use client";

import { useFormState, useFormStatus } from "react-dom";
import { setClientParentAction, type SetClientParentFormState } from "./actions";

function SubmitOnChangeSelect({ defaultValue, options }: { defaultValue: string; options: Array<{ id: string; name: string }> }) {
  const { pending } = useFormStatus();
  return (
    <select
      name="parent_client_id"
      defaultValue={defaultValue}
      disabled={pending}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm disabled:opacity-50"
    >
      <option value="">Aucun (client indépendant)</option>
      {options.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

export function SetParentForm({
  clientId,
  currentParentId,
  candidates,
}: {
  clientId: string;
  currentParentId: string | null;
  candidates: Array<{ id: string; name: string }>;
}) {
  const action = setClientParentAction.bind(null, clientId);
  const initialState: SetClientParentFormState = { error: null };
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form action={formAction} className="inline-flex flex-col gap-1">
      <SubmitOnChangeSelect defaultValue={currentParentId ?? ""} options={candidates} />
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
