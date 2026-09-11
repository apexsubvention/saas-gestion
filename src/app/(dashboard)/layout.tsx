import { requireOrgContext } from "@/lib/permissions";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrgContext();

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar role={ctx.role} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header fullName={ctx.fullName} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
