"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Card, EmptyState, Input, PageTitle, cx } from "./ui";
import { money, vehicleLabel } from "@/lib/format";
import { STATUS_LABEL, STATUS_TONE, formatDate, jobNumber } from "@/lib/jobs";
import { jobTotals, type Totals, type TotalsJob, type TotalsLine } from "@/lib/totals";
import type { Customer, JobStatus, Vehicle } from "@/lib/types";

export type JobRow = TotalsJob & {
  id: string;
  number: number;
  status: JobStatus;
  estimate_date: string;
  invoice_date: string | null;
  invoice_totals: Totals | null;
  concern: string;
  customer: Pick<Customer, "name" | "phone" | "company" | "kind">;
  vehicle: Pick<Vehicle, "year" | "make" | "model" | "trim" | "plate" | "vin">;
  job_lines: TotalsLine[];
};

const FILTERS: { key: string; label: string; statuses: JobStatus[] }[] = [
  { key: "open", label: "In the shop", statuses: ["estimate", "approved", "ready"] },
  { key: "unpaid", label: "Unpaid", statuses: ["invoiced"] },
  { key: "paid", label: "Paid", statuses: ["paid"] },
  { key: "declined", label: "Declined", statuses: ["declined"] },
  { key: "all", label: "All", statuses: ["estimate", "approved", "ready", "invoiced", "paid", "declined"] },
];

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

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, jobs.filter((j) => f.statuses.includes(j.status)).length])), [jobs]);

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  // A search looks across every status
  const statuses = words.length ? FILTERS[4].statuses : FILTERS.find((f) => f.key === filter)!.statuses;
  const shown = rows.filter(({ j, text }) => statuses.includes(j.status) && words.every((w) => text.includes(w)));

  return (
    <div>
      <PageTitle
        action={
          <Link href="/jobs/new" className="inline-flex h-11 items-center rounded-lg bg-brand px-4 text-[15px] font-medium text-ink hover:bg-brand-hover">
            New job
          </Link>
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
              <span className={cx("tabular text-xs", filter === f.key ? "text-brand" : "text-faint")}>{counts[f.key]}</span>
            </button>
          ))}
        </div>
      ) : null}

      {jobs.length === 0 ? (
        <EmptyState title="Start your first job">Pick the customer and vehicle, then write the estimate.</EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState title={words.length ? `No job matches “${q}”` : "Nothing here right now"} />
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {shown.map(({ j, total }) => (
            <Link key={j.id} href={`/jobs/${j.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-canvas">
              <div className="w-[78px] shrink-0 sm:w-[88px]">
                <p className="display tabular text-[17px] leading-tight text-ink">{jobNumber(j)}</p>
                <p className="text-xs text-muted">{formatDate(j.invoice_date ?? j.estimate_date)}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{j.customer.name}</p>
                <p className="truncate text-sm text-muted">{[vehicleLabel(j.vehicle), j.vehicle.plate].filter(Boolean).join(" · ")}</p>
                <span className="mt-1 flex flex-wrap gap-1 sm:hidden">
                  <Badge tone={STATUS_TONE[j.status]}>{STATUS_LABEL[j.status]}</Badge>
                  {j.is_insurance ? <Badge>Insurance</Badge> : null}
                </span>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="tabular font-medium text-ink">{money(total)}</span>
                <span className="hidden gap-1 sm:flex">
                  {j.is_insurance ? <Badge>Insurance</Badge> : null}
                  <Badge tone={STATUS_TONE[j.status]}>{STATUS_LABEL[j.status]}</Badge>
                </span>
              </div>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
