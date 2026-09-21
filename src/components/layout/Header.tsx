"use client";

import Link from "next/link";
import { Bell, LogOut, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function Header({ fullName, unreadCount = 0 }: { fullName: string | null; unreadCount?: number }) {
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
        <Link
          href="/notifications"
          className="relative rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
          title={unreadCount > 0 ? `${unreadCount} notification(s) non lue(s)` : "Notifications"}
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Link>
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
