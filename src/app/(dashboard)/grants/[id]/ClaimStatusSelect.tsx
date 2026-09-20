"use client";

import { useFormState, useFormStatus } from "react-dom";
import { CLAIM_STATUS_OPTIONS, claimStatusBadgeClass } from "@/features/grants/constants";
import { updateClaimStatusAction, type UpdateClaimStatusFormState } from "./actions";

function SubmitOnChangeSelect({ defaultValue }: { defaultValue: string }) {
  const { pending } = useFormStatus();
  return (
    <select
      name="status"
      defaultValue={defaultValue}
      disabled={pending}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className={`rounded-full border-0 px-2.5 py-1 text-xs font-medium outline-none disabled:opacity-50 ${claimStatusBadgeClass(defaultValue)}`}
    >
      {CLAIM_STATUS_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export function ClaimStatusSelect({
  grantProjectId,
  claimId,
  status,
}: {
  grantProjectId: string;
  claimId: string;
  status: string;
}) {
  const action = updateClaimStatusAction.bind(null, grantProjectId, claimId);
  const initialState: UpdateClaimStatusFormState = { error: null };
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form action={formAction} className="inline-flex flex-col gap-1">
      <SubmitOnChangeSelect defaultValue={status} />
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
