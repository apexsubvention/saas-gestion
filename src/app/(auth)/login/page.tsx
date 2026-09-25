"use client";

// React 18 (Next 14) : useActionState n'existe qu'a partir de React 19.
// L'equivalent stable en React 18 est useFormState (react-dom) + useFormStatus
// pour l'etat "pending", qui doit etre lu depuis un composant DESCENDANT du <form>.
import { useFormState, useFormStatus } from "react-dom";
import { signIn } from "./actions";

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

export default function LoginPage() {
  const [state, formAction] = useFormState(signIn, { error: null as string | null });

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-neutral-950 bg-cover bg-center"
      style={{ backgroundImage: "url(/images/login-background.jpg)" }}
    >
      <form
        action={formAction}
        className="w-full max-w-sm space-y-4 rounded-xl border border-neutral-200 bg-white/95 p-8 shadow-xl backdrop-blur-sm"
      >
        <h1 className="text-xl font-semibold text-neutral-900">Apex</h1>
        <p className="text-sm text-neutral-500">Connecte-toi pour continuer.</p>

        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium text-neutral-700">
            Courriel
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
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
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
        </div>

        {state.error && <p className="text-sm text-red-600">{state.error}</p>}

        <SubmitButton />
      </form>
    </div>
  );
}
