import Link from "next/link";
import { FolderKanban, FileText, Radar } from "lucide-react";

// Même style que le menu latéral de la plateforme admin (src/components/layout/Sidebar.tsx)
// -- Jade a demandé un portail « qui se rapproche plus de ma plateforme admin » : même
// habillage (fond foncé, icônes, bloc de marque), un jeu de sections réduit et adapté au
// client plutôt qu'au personnel.
const NAV = [
  { href: "/portal", label: "Mes dossiers", icon: FolderKanban },
  { href: "/portal/documents", label: "Documents", icon: FileText },
  { href: "/portal/veille", label: "Veille de subventions", icon: Radar },
] as const;

export function PortalSidebar() {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-950 text-slate-200">
      <div className="flex h-16 items-center border-b border-white/10 px-5">
        <div>
          <div className="text-lg font-semibold tracking-tight text-white">apex.</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Portail client</div>
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
    </aside>
  );
}
