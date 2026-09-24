"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { changePortalPasswordAction, type ChangePortalPasswordFormState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? "Enregistrement..." : "Changer le mot de passe"}
    </button>
  );
}

// useSearchParams() doit être sous une frontière Suspense en Next 14 App Router -- même
// contrainte que la page de connexion (voir portal/login/page.tsx).
function ChangePasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isFirstLogin = searchParams.get("first") === "1";
  const initialState: ChangePortalPasswordFormState = { error: null };
  const [state, formAction] = useFormState(changePortalPasswordAction, initialState);

  if (state.ok) {
    return (
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-medium text-emerald-700">Mot de passe changé ✓</p>
        <button
          type="button"
          onClick={() => router.push("/portal")}
          className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
        >
          Aller au portail
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="w-full max-w-sm space-y-4 rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Changer le mot de passe</h1>
        {isFirstLogin ? (
          <p className="mt-1 text-sm text-neutral-500">
            C&apos;est ta première connexion. Tu peux choisir ton propre mot de passe maintenant, ou le faire plus tard depuis le portail.
          </p>
        ) : (
          <p className="mt-1 text-sm text-neutral-500">Choisis un nouveau mot de passe pour ton compte.</p>
        )}
      </div>

      <div className="space-y-1">
        <label htmlFor="new_password" className="text-sm font-medium text-neutral-700">
          Nouveau mot de passe
        </label>
        <input
          id="new_password"
          name="new_password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
        <p className="text-xs text-neutral-400">Au moins 8 caractères.</p>
      </div>

      <div className="space-y-1">
        <label htmlFor="confirm_password" className="text-sm font-medium text-neutral-700">
          Confirmer le mot de passe
        </label>
        <input
          id="confirm_password"
          name="confirm_password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <SubmitButton />

      {isFirstLogin && (
        <button
          type="button"
          onClick={() => router.push("/portal")}
          className="w-full text-center text-sm text-neutral-500 underline"
        >
          Plus tard
        </button>
      )}
    </form>
  );
}

export default function ChangePasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50">
      <Suspense fallback={null}>
        <ChangePasswordForm />
      </Suspense>
    </div>
  );
}
