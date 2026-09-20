"use client";

import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function PortalHeader({ clientName, fullName }: { clientName: string; fullName: string | null }) {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/portal/login");
    router.refresh();
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div>
        <div className="text-sm font-semibold text-slate-900">{clientName}</div>
        <div className="text-xs text-slate-400">Portail Apex</div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right text-sm text-slate-600">{fullName ?? ""}</div>
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
