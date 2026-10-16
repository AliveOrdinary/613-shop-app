import { CustomersView } from "@/components/CustomersView";
import { supabaseServer } from "@/lib/supabase/server";
import type { CustomerWithVehicles } from "@/lib/types";

export const metadata = { title: "Customers · 613 Automotive" };

export default async function CustomersPage() {
  const sb = await supabaseServer();
  const { data, error } = await sb
    .from("customers")
    .select("*, vehicles(*)")
    .order("name", { ascending: true })
    .range(0, 1999)
    .returns<CustomerWithVehicles[]>();
  if (error) throw new Error(`Couldn't load customers: ${error.message}`);
  return <CustomersView customers={data ?? []} />;
}
