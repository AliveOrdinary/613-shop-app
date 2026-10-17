"use client";

import type { JobStatus } from "@/lib/types";

const DOCS: { kind: "estimate" | "work-order" | "invoice" | "inspection"; label: string; prefix: string; when: JobStatus[] }[] = [
  { kind: "estimate", label: "Estimate", prefix: "EST", when: ["estimate", "approved", "ready", "invoiced", "paid", "declined"] },
  { kind: "work-order", label: "Work order", prefix: "RO", when: ["approved", "ready", "invoiced", "paid"] },
  { kind: "invoice", label: "Invoice", prefix: "INV", when: ["invoiced", "paid"] },
  { kind: "inspection", label: "Inspection", prefix: "INSP", when: ["estimate", "approved", "ready", "invoiced", "paid", "declined"] },
];

/** Opens each printable document in a new tab, where it can be printed or saved. */
export function DocumentButtons({ jobId, number, status, hasInspection }: { jobId: string; number: number; status: JobStatus; hasInspection: boolean }) {
  const docs = DOCS.filter((d) => d.when.includes(status) && (d.kind !== "inspection" || hasInspection));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-[13px] font-medium text-muted">Print</span>
      {docs.map((d) => (
        <a
          key={d.kind}
          href={`/api/jobs/${jobId}/pdf?doc=${d.kind}`}
          target="_blank"
          rel="noopener"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink hover:bg-canvas"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z" />
          </svg>
          {d.label}
          <span className="tabular text-xs text-muted">
            {d.prefix}-{number}
          </span>
        </a>
      ))}
    </div>
  );
}
