import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { AdminShell } from "@/components/admin/admin-shell";

export const metadata = { title: "Eluue Admin" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/dashboard");
  return <AdminShell adminName={ctx.name} adminEmail={ctx.email}>{children}</AdminShell>;
}
