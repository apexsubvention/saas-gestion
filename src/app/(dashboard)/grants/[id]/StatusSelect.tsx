"use client";

import { useFormState, useFormStatus } from "react-dom";
import { GRANT_PROJECT_STATUS_OPTIONS, grantProjectStatusBadgeClass } from "@/features/grants/constants";
import { updateGrantProjectStatusAction, type UpdateGrantProjectStatusFormState } from "./actions";

function SubmitOnChangeSelect({ defaultValue }: { defaultValue: string }) {
  const { pending } = useFormStatus();
  return (
    <select
      name="status"
      defaultValue={defaultValue}
      disabled={pending}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className={`rounded-full border-0 px-2.5 py-1 text-xs font-medium outline-none disabled:opacity-50 ${grantProjectStatusBadgeClass(defaultValue)}`}
    >
      {GRANT_PROJECT_STATUS_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export function StatusSelect({ grantProjectId, status }: { grantProjectId: string; status: string }) {
  const action = updateGrantProjectStatusAction.bind(null, grantProjectId);
  const initialState: UpdateGrantProjectStatusFormState = { error: null };
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form action={formAction} className="inline-flex flex-col gap-1">
      <SubmitOnChangeSelect defaultValue={status} />
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
