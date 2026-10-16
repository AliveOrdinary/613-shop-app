import { notFound } from "next/navigation";
import { CustomerDetail, type CustomerJob } from "@/components/CustomerDetail";
import { supabaseServer } from "@/lib/supabase/server";
import type { CustomerWithVehicles } from "@/lib/types";

export const metadata = { title: "Customer · 613 Automotive" };

export default async function CustomerPage({ params, searchParams }: PageProps<"/customers/[id]">) {
  const { id } = await params;
  const { added } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sb = await supabaseServer();
  const { data, error } = await sb
    .from("customers")
    .select("*, vehicles(*)")
    .eq("id", id)
    .order("created_at", { referencedTable: "vehicles", ascending: true })
    .maybeSingle<CustomerWithVehicles>();
  if (error) throw new Error(`Couldn't load the customer: ${error.message}`);
  if (!data) notFound();
  const { data: jobs } = await sb
    .from("jobs")
    .select("id, number, status, vehicle_id, estimate_date, invoice_date")
    .eq("customer_id", id)
    .order("number", { ascending: false })
    .returns<CustomerJob[]>();
  return <CustomerDetail customer={data} jobs={jobs ?? []} justAdded={added === "1"} />;
}
