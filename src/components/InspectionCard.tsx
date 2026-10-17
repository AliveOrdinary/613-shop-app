"use client";

import Link from "next/link";
import { Badge } from "./ui";
import { summarize } from "@/lib/inspection";
import type { Inspection } from "@/lib/types";

export function InspectionCard({ jobId, inspection }: { jobId: string; inspection: Inspection | null }) {
  const s = inspection ? summarize(inspection.results) : null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        {s ? (
          <>
            <p className="text-sm text-ink">
              {s.done} of {s.total} items checked
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {s.ok ? <Badge tone="ok">{s.ok} OK</Badge> : null}
              {s.attention ? <Badge tone="warn">{s.attention} attention</Badge> : null}
              {s.urgent ? <Badge tone="bad">{s.urgent} urgent</Badge> : null}
              {s.na ? <Badge>{s.na} N/A</Badge> : null}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">Full mechanical check: engine, brakes, tires, electrical and road test, 46 items.</p>
        )}
      </div>
      <Link
        href={`/jobs/${jobId}/inspection`}
        className="inline-flex h-11 shrink-0 items-center rounded-lg border border-line bg-surface px-4 text-[15px] font-medium text-ink hover:bg-canvas"
      >
        {s ? "Open inspection" : "Start inspection"}
      </Link>
    </div>
  );
}
