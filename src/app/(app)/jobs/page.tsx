import { JobsView, type JobRow } from "@/components/JobsView";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "Jobs · 613 Automotive" };

export default async function JobsPage() {
  const sb = await supabaseServer();
  const { data, error } = await sb
    .from("jobs")
    .select(
      "id, number, status, quick, estimate_date, invoice_date, created_at, is_insurance, discount, hst_rate, shop_supplies_pct, shop_supplies_cap, deductible, insurer_pays, amount_paid, approved_total, invoice_totals, concern, " +
        "customer:customers(name, phone, company, kind), vehicle:vehicles(year, make, model, trim, plate, vin), " +
        "job_lines(kind, quantity, unit_price, markup_pct)",
    )
    .order("created_at", { ascending: false })
    .range(0, 499)
    .returns<JobRow[]>();
  if (error) throw new Error(`Couldn't load jobs: ${error.message}`);
  return <JobsView jobs={data ?? []} />;
}
