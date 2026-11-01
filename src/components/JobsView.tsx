"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Card, EmptyState, Input, PageTitle, cx } from "./ui";
import { money, vehicleLabel } from "@/lib/format";
import { formatDate, isOwed, jobNumber, statusBadge, todayLocal } from "@/lib/jobs";
import { jobTotals, type Totals, type TotalsJob, type TotalsLine } from "@/lib/totals";
import type { Customer, JobStatus, Vehicle } from "@/lib/types";

export type JobRow = TotalsJob & {
  id: string;
  number: number;
  status: JobStatus;
  quick: boolean;
  estimate_date: string;
  invoice_date: string | null;
  invoice_totals: Totals | null;
  concern: string;
  customer: Pick<Customer, "name" | "phone" | "company" | "kind">;
  vehicle: Pick<Vehicle, "year" | "make" | "model" | "trim" | "plate" | "vin">;
  job_lines: TotalsLine[];
};

type Row = Pick<JobRow, "status" | "quick">;
const FILTERS: { key: string; label: string; shows: (j: Row) => boolean }[] = [
  { key: "open", label: "In the shop", shows: (j) => ["estimate", "approved", "ready"].includes(j.status) && !isOwed(j) },
  { key: "owed", label: "Owed", shows: isOwed }, // quick sales to pay later, not invoiced yet
  { key: "unpaid", label: "Unpaid", shows: (j) => j.status === "invoiced" }, // includes part paid
  { key: "paid", label: "Paid", shows: (j) => j.status === "paid" },
  { key: "declined", label: "Declined", shows: (j) => j.status === "declined" },
  { key: "all", label: "All", shows: () => true },
];

/** The day a job belongs to in the list: its invoice date once invoiced, else its estimate date */
const jobDay = (j: Pick<JobRow, "invoice_date" | "estimate_date">) => j.invoice_date ?? j.estimate_date;

/** "Today", "Yesterday", or the date, for the list's day headings */
export function dayLabel(day: string, today: string): string {
  if (day === today) return "Today";
  const t = new Date(`${today}T12:00:00`);
  t.setDate(t.getDate() - 1);
  const y = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  if (day === y) return "Yesterday";
  const d = new Date(`${day}T12:00:00`);
  return d.toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
  });
}

export function JobsView({ jobs }: { jobs: JobRow[] }) {
  const [filter, setFilter] = useState("open");
  const [q, setQ] = useState("");

  const rows = useMemo(
    () =>
      jobs.map((j) => {
        const total = j.invoice_totals?.total ?? jobTotals(j, j.job_lines).total;
        const text = [
          j.number,
          jobNumber(j),
          j.customer.name,
          j.customer.company,
          j.customer.phone.replace(/\D/g, ""),
          vehicleLabel(j.vehicle),
          j.vehicle.plate,
          j.vehicle.plate.replace(/\s/g, ""),
          j.vehicle.vin ?? "",
          j.concern,
        ]
          .join(" ")
          .toLowerCase();
        return { j, total, text };
      }),
    [jobs],
  );

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, jobs.filter(f.shows).length])), [jobs]);
  const owedTotal = useMemo(() => rows.reduce((sum, r) => (isOwed(r.j) ? sum + r.total : sum), 0), [rows]);

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  // A search looks across every status
  const shows = words.length ? () => true : FILTERS.find((f) => f.key === filter)!.shows;
  const shown = rows
    .filter(({ j, text }) => shows(j) && words.every((w) => text.includes(w)))
    .sort((a, b) => jobDay(b.j).localeCompare(jobDay(a.j)) || b.j.number - a.j.number);
  // Grouped by day, newest first
  const today = todayLocal();
  const days: { day: string; rows: typeof shown }[] = [];
  for (const r of shown) {
    const day = jobDay(r.j);
    if (days.at(-1)?.day === day) days.at(-1)!.rows.push(r);
    else days.push({ day, rows: [r] });
  }

  return (
    <div>
      <PageTitle
        action={
          <div className="flex gap-2">
            <Link href="/jobs/quick" className="inline-flex h-11 items-center rounded-lg border border-line bg-surface px-4 text-[15px] font-medium text-ink hover:bg-canvas">
              Quick sale
            </Link>
            <Link href="/jobs/new" className="inline-flex h-11 items-center rounded-lg bg-brand px-4 text-[15px] font-medium text-ink hover:bg-brand-hover">
              New job
            </Link>
          </div>
        }
      >
        Jobs
      </PageTitle>

      <div className="mb-3">
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number, customer, plate or VIN" aria-label="Search jobs" />
      </div>

      {words.length === 0 ? (
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cx(
                "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium",
                filter === f.key ? "border-ink bg-ink text-white" : "border-line bg-surface text-charcoal hover:border-faint",
              )}
            >
              {f.label}
              <span className={cx("tabular text-xs", filter === f.key ? "text-brand" : "text-faint")}>
                {counts[f.key]}
                {f.key === "owed" && owedTotal > 0 ? ` · ${money(owedTotal)}` : ""}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {words.length === 0 && filter === "owed" && counts.owed > 0 ? (
        <p className="mb-4 text-sm text-muted">
          {money(owedTotal)} owed on {counts.owed} quick {counts.owed === 1 ? "sale" : "sales"}. When they pay, open the sale and tap Paid · create invoice.
        </p>
      ) : null}

      {jobs.length === 0 ? (
        <EmptyState title="Start your first job">Pick the customer and vehicle, then write the estimate.</EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState title={words.length ? `No job matches “${q}”` : "Nothing here right now"} />
      ) : (
        <div className="space-y-5">
          {days.map(({ day, rows }) => (
            <section key={day}>
              <h2 className="mb-2 flex items-baseline gap-2 text-[13px] font-semibold text-charcoal">
                {dayLabel(day, today)}
                <span className="font-normal text-faint">{rows.length}</span>
              </h2>
            <Card className="divide-y divide-line overflow-hidden">
              {rows.map(({ j, total }) => (
            <Link key={j.id} href={`/jobs/${j.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-canvas">
              <div className="w-[78px] shrink-0 sm:w-[88px]">
                <p className="display tabular text-[17px] leading-tight text-ink">{jobNumber(j)}</p>
                <p className="text-xs text-muted">{formatDate(j.invoice_date ?? j.estimate_date)}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{j.customer.name}</p>
                <p className="truncate text-sm text-muted">{[vehicleLabel(j.vehicle), j.vehicle.plate].filter(Boolean).join(" · ")}</p>
                <span className="mt-1 flex flex-wrap gap-1 sm:hidden">
                  <Badge tone={statusBadge(j).tone}>{statusBadge(j).label}</Badge>
                  {j.is_insurance ? <Badge>Insurance</Badge> : null}
                  {j.quick ? <Badge>Quick</Badge> : null}
                </span>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="tabular font-medium text-ink">{money(total)}</span>
                <span className="hidden gap-1 sm:flex">
                  {j.is_insurance ? <Badge>Insurance</Badge> : null}
                {j.quick ? <Badge>Quick</Badge> : null}
                  <Badge tone={statusBadge(j).tone}>{statusBadge(j).label}</Badge>
                </span>
              </div>
            </Link>
          ))}
            </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
