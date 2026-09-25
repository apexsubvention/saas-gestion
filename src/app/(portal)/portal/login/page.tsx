"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { portalSignIn } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? "Connexion..." : "Se connecter"}
    </button>
  );
}

// useSearchParams() doit être sous une frontière Suspense en Next 14 App Router,
// sinon l'export statique de la page échoue au build -- voir le wrapper par défaut
// ci-dessous.
function PortalLoginForm() {
  const [state, formAction] = useFormState(portalSignIn, { error: null as string | null });
  const searchParams = useSearchParams();
  const accessError = searchParams.get("error") === "no_access";

  return (
    <form
      action={formAction}
      className="w-full max-w-sm space-y-4 rounded-xl border border-neutral-200 bg-white p-8 shadow-sm"
    >
      <h1 className="text-xl font-semibold text-neutral-900">Portail client Apex</h1>
      <p className="text-sm text-neutral-500">Connecte-toi avec les identifiants qui t&apos;ont été transmis.</p>
      {accessError && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Ce compte n&apos;a pas d&apos;accès portail actif. Si tu es un membre de l&apos;équipe Apex, utilise plutôt{" "}
          <a href="/login" className="underline">
            /login
          </a>
          .
        </p>
      )}

      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-medium text-neutral-700">
          Courriel
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-medium text-neutral-700">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="remember"
          name="remember"
          type="checkbox"
          defaultChecked
          className="h-4 w-4 rounded border-neutral-300"
        />
        <label htmlFor="remember" className="text-sm text-neutral-600">
          Rester connecté
        </label>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <SubmitButton />
    </form>
  );
}

export default function PortalLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50">
      <Suspense fallback={null}>
        <PortalLoginForm />
      </Suspense>
    </div>
  );
}
