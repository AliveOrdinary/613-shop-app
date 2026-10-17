"use client";

import { Field, Input, Textarea, cx } from "./ui";
import { QC_ITEMS, qcDone } from "@/lib/jobs";
import type { Job } from "@/lib/types";

/** Final quality check before the car goes back. Ticks print on the work order. */
export function QcPanel({ job, set }: { job: Job; set: <K extends keyof Job>(k: K, v: Job[K]) => void }) {
  const qc = job.qc ?? {};
  const done = qcDone(qc);

  function toggle(key: string) {
    const next = { ...qc, [key]: !qc[key] };
    set("qc", next);
    if (qcDone(next) === QC_ITEMS.length && !job.qc_at) set("qc_at", new Date().toISOString());
    if (qcDone(next) < QC_ITEMS.length && job.qc_at) set("qc_at", null);
  }

  return (
    <div className="space-y-4 p-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {QC_ITEMS.map((i) => {
          const on = Boolean(qc[i.key]);
          return (
            <button
              key={i.key}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(i.key)}
              className={cx(
                "flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-left text-[15px]",
                on ? "border-ok bg-ok-soft text-ink" : "border-line bg-surface text-charcoal hover:border-faint",
              )}
            >
              <span className={cx("flex h-5 w-5 shrink-0 items-center justify-center rounded border", on ? "border-ok bg-ok text-white" : "border-faint")}>
                {on ? (
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3.5" aria-hidden>
                    <path d="m5 12 5 5 9-10" />
                  </svg>
                ) : null}
              </span>
              {i.label}
            </button>
          );
        })}
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <Field label="Checked by">
          <Input value={job.qc_by} onChange={(e) => set("qc_by", e.target.value)} />
        </Field>
        <Field label="Final notes" hint="Printed on the work order.">
          <Textarea rows={2} value={job.qc_notes} onChange={(e) => set("qc_notes", e.target.value)} />
        </Field>
      </div>
      <p className={cx("text-sm", done === QC_ITEMS.length ? "text-ok" : "text-muted")}>
        {done === QC_ITEMS.length ? "Quality check complete." : `${done} of ${QC_ITEMS.length} checked.`}
      </p>
    </div>
  );
}

export function qcSummary(job: Job): string {
  const d = qcDone(job.qc);
  return d === QC_ITEMS.length ? "Complete" : `${d} of ${QC_ITEMS.length}`;
}
