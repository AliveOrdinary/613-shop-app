import { NextResponse, type NextRequest } from "next/server";
import { buildJobPdf, pdfFileName, type DocKind, type PdfData } from "@/lib/pdf/documents";
import { getSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import type { JobFull, ShopSettings } from "@/lib/types";

export const maxDuration = 30;

const KINDS: DocKind[] = ["estimate", "work-order", "invoice", "inspection"];

/**
 * GET /api/jobs/<id>/pdf?doc=estimate|work-order|invoice|inspection[&download=1]
 * Opens in the browser (to print or save); download=1 saves it straight away.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/jobs/[id]/pdf">) {
  const { id } = await ctx.params;
  const kind = req.nextUrl.searchParams.get("doc") as DocKind | null;
  if (!kind || !KINDS.includes(kind)) return NextResponse.json({ error: "Unknown document" }, { status: 400 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sb = await supabaseServer();
  if (!(await getSession(sb))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Row-level security limits this to staff
  const [{ data: job, error }, { data: shop }] = await Promise.all([
    sb
      .from("jobs")
      .select("*, job_lines(*), customer:customers(*), vehicle:vehicles(*), payments(*), inspection:inspections(*)")
      .eq("id", id)
      .order("position", { referencedTable: "job_lines", ascending: true })
      .order("paid_on", { referencedTable: "payments", ascending: true })
      .maybeSingle<JobFull>(),
    sb.from("shop_settings").select("*").eq("id", 1).maybeSingle<ShopSettings>(),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!job || !shop) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (kind === "invoice" && !["invoiced", "paid"].includes(job.status)) {
    return NextResponse.json({ error: "This job hasn't been invoiced yet" }, { status: 409 });
  }

  if (kind === "inspection" && !job.inspection) {
    return NextResponse.json({ error: "This job has no inspection yet" }, { status: 409 });
  }

  const { job_lines, customer, vehicle, payments, inspection, files: _files, ...rest } = job;
  void _files;
  const data: PdfData = { job: rest, lines: job_lines, customer, vehicle, payments: payments ?? [], shop, inspection };
  const name = pdfFileName(kind, data);
  const disposition = req.nextUrl.searchParams.get("download") ? "attachment" : "inline";

  return new NextResponse(new Uint8Array(buildJobPdf(kind, data)), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${name.replace(/[^\x20-\x7e]/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
