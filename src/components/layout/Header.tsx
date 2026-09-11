"use client";

import { LogOut, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function Header({ fullName }: { fullName: string | null }) {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="hidden w-full max-w-md items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400 md:flex">
        <Search className="h-4 w-4" />
        <span>Rechercher un client, dossier ou programme…</span>
      </div>

      <div className="ml-auto flex items-center gap-4">
        <div className="text-right">
          <div className="text-sm font-medium text-slate-900">{fullName ?? "—"}</div>
          <div className="text-xs text-slate-400">Apex</div>
        </div>
        <button
          onClick={handleSignOut}
          className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
          title="Se déconnecter"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
