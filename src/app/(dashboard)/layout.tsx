import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/permissions";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { createClient } from "@/lib/supabase/server";
import { notificationsService } from "@/server/services/notifications.service";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrgContext();

  // Un compte portail (role="client", voir 0028_client_hierarchy_and_portal_access.sql)
  // n'a pas sa place dans l'interface staff -- même si RLS limite déjà ce qu'il peut
  // voir/faire ici, ce n'est pas la surface qui lui est destinée.
  if (ctx.role === "client") {
    redirect("/portal");
  }

  const unreadCount = await notificationsService(await createClient()).unreadCount();

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar role={ctx.role} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header fullName={ctx.fullName} unreadCount={unreadCount} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
