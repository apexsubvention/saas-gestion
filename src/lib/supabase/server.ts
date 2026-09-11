// Client Supabase pour Server Components / Server Actions / Route Handlers.
// Respecte la session de l'utilisateur -> RLS s'applique normalement.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database.types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll appele depuis un Server Component : ignorable si le
            // middleware rafraichit deja la session sur chaque requete.
          }
        },
      },
    }
  );
}
