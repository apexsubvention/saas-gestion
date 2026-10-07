import { requirePortalContext } from "@/lib/portal/auth";
import { PortalHeader } from "./PortalHeader";
import { PortalSidebar } from "./PortalSidebar";
import { PortalAccessProvider } from "./PortalAccessContext";

// Même charpente que src/app/(dashboard)/layout.tsx (menu latéral + en-tête + contenu) --
// Jade a demandé un portail qui ressemble davantage à la plateforme admin.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePortalContext();

  return (
    <div className="flex h-screen bg-slate-50">
      <PortalSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <PortalHeader clientName={ctx.clientName} fullName={ctx.fullName} accessLevel={ctx.accessLevel} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl p-6 lg:p-8">
            {/* Niveau d'accès de la personne connectée (0075) -- lu par les formulaires du portail. */}
            <PortalAccessProvider level={ctx.accessLevel}>{children}</PortalAccessProvider>
          </div>
        </main>
      </div>
    </div>
  );
}
