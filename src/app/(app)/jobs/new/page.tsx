import { NewJobView } from "@/components/NewJobView";
import { supabaseServer } from "@/lib/supabase/server";
import type { CustomerWithVehicles } from "@/lib/types";

export const metadata = { title: "New job · 613 Automotive" };

export default async function NewJobPage({ searchParams }: PageProps<"/jobs/new">) {
  const { customer, vehicle } = await searchParams;
  const sb = await supabaseServer();
  const [{ data, error }, { data: s }] = await Promise.all([
    sb.from("customers").select("*, vehicles(*)").order("name").range(0, 1999).returns<CustomerWithVehicles[]>(),
    sb.from("shop_settings").select("next_job_number").eq("id", 1).single<{ next_job_number: number }>(),
  ]);
  if (error) throw new Error(`Couldn't load customers: ${error.message}`);
  return (
    <NewJobView
      customers={data ?? []}
      nextNumber={s?.next_job_number ?? 200}
      initialCustomer={typeof customer === "string" ? customer : null}
      initialVehicle={typeof vehicle === "string" ? vehicle : null}
    />
  );
}
