import { notFound } from "next/navigation";
import { JobView } from "@/components/JobView";
import { supabaseServer } from "@/lib/supabase/server";
import type { PreviousJob, Rates, ReusableLine, SavedItem } from "@/lib/reuse";
import type { JobFull, JobStatus } from "@/lib/types";

export const metadata = { title: "Job · 613 Automotive" };

export default async function JobPage({ params }: PageProps<"/jobs/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sb = await supabaseServer();
  const [{ data, error }, { data: settings }, { data: saved }] = await Promise.all([
    sb
      .from("jobs")
      .select("*, job_lines(*), customer:customers(*), vehicle:vehicles(*), payments(*), files:job_files(*), inspection:inspections(*)")
      .eq("id", id)
      .order("position", { referencedTable: "job_lines", ascending: true })
      .order("paid_on", { referencedTable: "payments", ascending: true })
      .order("created_at", { referencedTable: "job_files", ascending: true })
      .maybeSingle<JobFull>(),
    sb.from("shop_settings").select("rate_body, rate_paint, rate_mechanical, paint_markup_pct, hst_number").eq("id", 1).single<Rates & { hst_number: string }>(),
    sb.from("saved_items").select("*").order("name").returns<SavedItem[]>(),
  ]);
  if (error) throw new Error(`Couldn't load the job: ${error.message}`);
  if (!data) notFound();
  const rates: Rates = settings ?? { rate_body: 0, rate_paint: 0, rate_mechanical: 0, paint_markup_pct: 0 };

  // The car's most recent other job with lines, so they can be copied onto this one
  const { data: others } = await sb
    .from("jobs")
    .select("id, number, status, estimate_date, lines:job_lines(kind, description, quantity, unit_price, markup_pct, part_condition, oem, part_number, position)")
    .eq("vehicle_id", data.vehicle_id)
    .neq("id", data.id)
    .order("number", { ascending: false })
    .limit(10)
    .returns<{ id: string; number: number; status: JobStatus; estimate_date: string; lines: (ReusableLine & { position: number })[] }[]>();
  const last = others?.find((j) => j.lines.length > 0);
  const previous: PreviousJob | null = last ? { ...last, lines: [...last.lines].sort((a, b) => a.position - b.position) } : null;

  return <JobView initial={data} rates={rates} hstNumber={settings?.hst_number ?? ""} savedItems={saved ?? []} previous={previous} />;
}
