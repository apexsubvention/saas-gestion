import { requirePortalContext } from "@/lib/portal/auth";
import { PortalHeader } from "./PortalHeader";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePortalContext();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <PortalHeader clientName={ctx.clientName} fullName={ctx.fullName} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
