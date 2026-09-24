"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function portalSignIn(_prevState: { error: string | null }, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  // Coché par défaut côté formulaire (voir page.tsx) : ne PAS toucher aux cookies quand c'est coché
  // préserve le comportement déjà en place (session Supabase déjà persistante par défaut via son
  // cookie de rafraîchissement). Décoché seulement : réduit volontairement le cookie à une durée de
  // session -- effacé à la fermeture du navigateur, demandé par Jade pour un poste partagé/public.
  const remember = formData.get("remember") === "on";

  const supabase = await createClient();
  const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  if (!remember) {
    // Best-effort : si le nom du cookie change un jour côté Supabase, la connexion reste
    // fonctionnelle -- seule la préférence "rester connecté" serait alors ignorée.
    try {
      const cookieStore = await cookies();
      for (const c of cookieStore.getAll()) {
        if (c.name.startsWith("sb-") && c.name.includes("auth-token")) {
          cookieStore.set(c.name, c.value, { path: "/", sameSite: "lax", secure: true, httpOnly: true });
        }
      }
    } catch {
      // ignore
    }
  }

  // Première connexion (ou mot de passe temporaire régénéré par Jade) : suggère le changement de
  // mot de passe -- jamais bloquant, voir change-password/page.tsx (« Plus tard »).
  const userId = signInData.user?.id;
  if (userId) {
    const { data: portalUser } = await supabase
      .from("client_portal_users")
      .select("must_change_password")
      .eq("user_id", userId)
      .eq("active", true)
      .maybeSingle();
    if (portalUser?.must_change_password) {
      redirect("/portal/change-password?first=1");
    }
  }

  redirect("/portal");
}
