// Reusing lines on another job: from a saved item or from the car's last job. Hours,
// quantities, part prices and descriptions carry over; labour rates and the paint markup come
// from today's Settings, so a rate change is never missed.

import type { LineKind } from "./totals";
import type { JobLine, JobStatus } from "./types";

export type Rates = { rate_body: number; rate_paint: number; rate_mechanical: number; paint_markup_pct: number };

/** What a line keeps when it's saved for reuse */
export type ReusableLine = Pick<JobLine, "kind" | "description" | "quantity" | "unit_price" | "markup_pct" | "part_condition" | "oem" | "part_number">;

export type SavedItem = { id: string; name: string; lines: ReusableLine[]; created_at: string };

/** The car's most recent other job that has lines, for "Copy lines from …" */
export type PreviousJob = { id: string; number: number; status: JobStatus; estimate_date: string; lines: ReusableLine[] };

export function labourRate(kind: LineKind, rates: Rates): number | null {
  if (kind === "labour_body") return Number(rates.rate_body) || 0;
  if (kind === "labour_paint") return Number(rates.rate_paint) || 0;
  if (kind === "labour_mechanical") return Number(rates.rate_mechanical) || 0;
  return null;
}

/** Strips a job line down to what's worth saving */
export function toReusable(l: ReusableLine): ReusableLine {
  return {
    kind: l.kind,
    description: l.description.trim(),
    quantity: Number(l.quantity) || 0,
    unit_price: Number(l.unit_price) || 0,
    markup_pct: Number(l.markup_pct) || 0,
    part_condition: l.kind === "part" ? (l.part_condition ?? "new") : null,
    oem: l.kind === "part" ? Boolean(l.oem) : null,
    part_number: l.kind === "part" ? (l.part_number ?? "").trim() : "",
  };
}

/** The rows to insert on a job, numbered after the lines it already has */
export function reuseLines(lines: ReusableLine[], rates: Rates, jobId: string, afterPosition: number) {
  return lines.map((raw, i) => {
    const l = toReusable(raw);
    const rate = labourRate(l.kind, rates);
    return {
      ...l,
      job_id: jobId,
      position: afterPosition + i + 1,
      unit_price: rate ?? l.unit_price,
      markup_pct: l.kind === "paint_materials" ? Number(rates.paint_markup_pct) || 0 : 0,
    };
  });
}
