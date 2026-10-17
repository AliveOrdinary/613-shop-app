import { notFound } from "next/navigation";
import { InspectionView } from "@/components/InspectionView";
import { supabaseServer } from "@/lib/supabase/server";
import type { Customer, Inspection, Job, Vehicle } from "@/lib/types";

export const metadata = { title: "Inspection · 613 Automotive" };

type Row = Pick<Job, "id" | "number" | "status" | "odometer_in" | "technician"> & {
  customer: Pick<Customer, "name">;
  vehicle: Vehicle;
  inspection: Inspection | null;
};

export default async function InspectionPage({ params }: PageProps<"/jobs/[id]/inspection">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sb = await supabaseServer();
  const { data, error } = await sb
    .from("jobs")
    .select("id, number, status, odometer_in, technician, customer:customers(name), vehicle:vehicles(*), inspection:inspections(*)")
    .eq("id", id)
    .maybeSingle<Row>();
  if (error) throw new Error(`Couldn't load the job: ${error.message}`);
  if (!data) notFound();

  let inspection = data.inspection;
  if (!inspection) {
    // First visit: start a blank inspection, pre-filled from the job
    const created = await sb
      .from("inspections")
      .insert({ job_id: id, technician: data.technician, odometer_km: data.odometer_in ?? data.vehicle.odometer_km })
      .select("*")
      .single<Inspection>();
    if (created.error || !created.data) throw new Error(`Couldn't start the inspection: ${created.error?.message ?? "unknown error"}`);
    inspection = created.data;
  }

  return <InspectionView jobId={id} jobNumber={data.number} customerName={data.customer.name} vehicle={data.vehicle} initial={inspection} />;
}
