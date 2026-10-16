import { notFound } from "next/navigation";
import { JobView } from "@/components/JobView";
import { supabaseServer } from "@/lib/supabase/server";
import type { Rates } from "@/components/LinesEditor";
import type { JobFull } from "@/lib/types";

export const metadata = { title: "Job · 613 Automotive" };

export default async function JobPage({ params }: PageProps<"/jobs/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sb = await supabaseServer();
  const [{ data, error }, { data: rates }] = await Promise.all([
    sb
      .from("jobs")
      .select("*, job_lines(*), customer:customers(*), vehicle:vehicles(*)")
      .eq("id", id)
      .order("position", { referencedTable: "job_lines", ascending: true })
      .maybeSingle<JobFull>(),
    sb.from("shop_settings").select("rate_body, rate_paint, rate_mechanical, paint_markup_pct").eq("id", 1).single<Rates>(),
  ]);
  if (error) throw new Error(`Couldn't load the job: ${error.message}`);
  if (!data) notFound();
  return <JobView initial={data} rates={rates ?? { rate_body: 0, rate_paint: 0, rate_mechanical: 0, paint_markup_pct: 0 }} />;
}
