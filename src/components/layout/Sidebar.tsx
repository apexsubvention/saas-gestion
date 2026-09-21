import Link from "next/link";
import {
  LayoutDashboard,
  Radar,
  Building2,
  FolderKanban,
  Landmark,
  FileText,
  CalendarClock,
  Settings,
  ListChecks,
} from "lucide-react";
import type { OrgRole } from "@/lib/permissions";

const NAV = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/watch", label: "Veille des subventions", icon: Radar },
  { href: "/clients", label: "Clients", icon: Building2 },
  { href: "/grants", label: "Dossiers", icon: FolderKanban },
  { href: "/programs", label: "Programmes", icon: Landmark },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/taches", label: "Mes tâches", icon: ListChecks },
  { href: "/echeancier", label: "Échéancier", icon: CalendarClock },
] as const;

export function Sidebar({ role }: { role: OrgRole }) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-950 text-slate-200">
      <div className="flex h-16 items-center border-b border-white/10 px-5">
        <div>
          <div className="text-lg font-semibold tracking-tight text-white">apex.</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Financement & subventions</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              <Icon className="h-4 w-4" strokeWidth={1.8} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-xs text-slate-500">
          <Settings className="h-4 w-4" />
          <span className="capitalize">{role}</span>
        </div>
      </div>
    </aside>
  );
}
