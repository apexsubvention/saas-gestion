"use client";

import { useFormState, useFormStatus } from "react-dom";
import { MILESTONE_STATUS_OPTIONS, milestoneStatusBadgeClass } from "@/features/grants/constants";
import { updateMilestoneStatusAction, type UpdateMilestoneStatusFormState } from "./actions";

function SubmitOnChangeSelect({ defaultValue }: { defaultValue: string }) {
  const { pending } = useFormStatus();
  return (
    <select
      name="status"
      defaultValue={defaultValue}
      disabled={pending}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className={`rounded-full border-0 px-2.5 py-1 text-xs font-medium outline-none disabled:opacity-50 ${milestoneStatusBadgeClass(defaultValue)}`}
    >
      {MILESTONE_STATUS_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export function MilestoneStatusSelect({
  grantProjectId,
  milestoneId,
  status,
}: {
  grantProjectId: string;
  milestoneId: string;
  status: string;
}) {
  const action = updateMilestoneStatusAction.bind(null, grantProjectId, milestoneId);
  const initialState: UpdateMilestoneStatusFormState = { error: null };
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form action={formAction} className="inline-flex flex-col gap-1">
      <SubmitOnChangeSelect defaultValue={status} />
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
