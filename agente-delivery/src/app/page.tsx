import { redirect } from "next/navigation";
import { getSessionTenant } from "@/lib/tenant";
import Dashboard from "@/components/Dashboard";

export default async function Home() {
  const tenant = await getSessionTenant();
  if (!tenant) redirect("/login");

  return (
    <Dashboard
      tenantName={tenant.name}
      botName={tenant.botName}
      tenantId={tenant.id}
    />
  );
}
