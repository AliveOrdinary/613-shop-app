"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button, Card, Field, Input, NumberInput, Textarea, cx } from "./ui";
import { vehicleLabel } from "@/lib/format";
import { ALL_ITEMS, DISCLAIMER, SECTIONS, STATUS_HINT, STATUS_LABEL, summarize, type InspectionResults, type InspectionStatus } from "@/lib/inspection";
import { useAutosave } from "@/lib/useAutosave";
import type { Inspection, Vehicle } from "@/lib/types";

const STATUSES: InspectionStatus[] = ["ok", "attention", "urgent", "na"];

const ON: Record<InspectionStatus, string> = {
  ok: "border-ok bg-ok text-white",
  attention: "border-warn bg-warn text-white",
  urgent: "border-bad bg-bad text-white",
  na: "border-charcoal bg-charcoal text-white",
};

function YesNo({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean | null) => void }) {
  return (
    <div>
      <p className="mb-1 text-[13px] font-medium text-muted">{label}</p>
      <div className="inline-flex rounded-lg border border-line bg-canvas p-1">
        {[
          { v: true, l: "Yes" },
          { v: false, l: "No" },
        ].map((o) => (
          <button
            key={o.l}
            type="button"
            aria-pressed={value === o.v}
            onClick={() => onChange(value === o.v ? null : o.v)}
            className={cx("h-9 rounded-md px-4 text-sm font-medium", value === o.v ? "bg-surface text-ink shadow-sm" : "text-muted")}
          >
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}

export function InspectionView({
  jobId,
  jobNumber,
  customerName,
  vehicle,
  initial,
}: {
  jobId: string;
  jobNumber: number;
  customerName: string;
  vehicle: Vehicle;
  initial: Inspection;
}) {
  const [insp, setInsp] = useState<Inspection>(initial);
  const save = useAutosave("inspections", jobId, 600, "job_id");
  const results = useMemo(() => insp.results ?? {}, [insp.results]);
  const sum = useMemo(() => summarize(results), [results]);

  const set = <K extends keyof Inspection>(k: K, v: Inspection[K]) => {
    setInsp((x) => ({ ...x, [k]: v }));
    save.queue({ [k]: v });
  };
  const setResults = (next: InspectionResults) => set("results", next);

  function mark(key: string, status: InspectionStatus) {
    const cur = results[key];
    const next = { ...results };
    if (cur?.status === status) delete next[key];
    else next[key] = { status, ...(cur?.note && status !== "ok" && status !== "na" ? { note: cur.note } : {}) };
    setResults(next);
  }

  function note(key: string, text: string) {
    setResults({ ...results, [key]: { ...results[key], note: text } });
  }

  function restOk(sectionKey: string) {
    const sec = SECTIONS.find((s) => s.key === sectionKey)!;
    const next = { ...results };
    for (const it of sec.items) if (!next[it.key]) next[it.key] = { status: "ok" };
    setResults(next);
  }

  return (
    <div className="pb-24">
      <Link href={`/jobs/${jobId}`} className="mb-2 inline-block text-sm text-muted hover:text-ink">
        ← RO-{jobNumber}
      </Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="display text-[28px] leading-tight text-ink">Mechanical inspection</h1>
          <p className="text-sm text-muted">
            {customerName} · {vehicleLabel(vehicle)}
            {vehicle.plate ? ` · ${vehicle.plate}` : ""}
          </p>
        </div>
        <span className="pt-1 text-xs text-muted" aria-live="polite">
          {save.state === "saving" ? "Saving…" : save.state === "saved" ? "All changes saved" : save.state === "error" ? <span className="text-bad">Not saved: {save.error}</span> : ""}
        </span>
      </div>

      <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-3">
        <Field label="Date">
          <Input type="date" value={insp.inspected_on} onChange={(e) => set("inspected_on", e.target.value)} />
        </Field>
        <Field label="Technician">
          <Input value={insp.technician} onChange={(e) => set("technician", e.target.value)} />
        </Field>
        <Field label="Odometer (km)">
          <NumberInput value={insp.odometer_km} onValue={(v) => set("odometer_km", v === null ? null : Math.round(v))} inputMode="numeric" min={0} step="1" />
        </Field>
      </Card>

      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {STATUSES.map((s) => (
          <span key={s}>
            <strong className="text-ink">{STATUS_LABEL[s]}</strong> {STATUS_HINT[s].toLowerCase()}
          </span>
        ))}
      </div>

      <div className="space-y-4">
        {SECTIONS.map((sec) => {
          const left = sec.items.filter((i) => !results[i.key]).length;
          return (
            <Card key={sec.key} className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                <h2 className="font-semibold text-ink">{sec.title}</h2>
                {left ? (
                  <Button size="sm" variant="ghost" onClick={() => restOk(sec.key)}>
                    Mark {left === sec.items.length ? "all" : `other ${left}`} OK
                  </Button>
                ) : (
                  <span className="text-sm text-ok">Done</span>
                )}
              </div>
              <ul className="divide-y divide-line">
                {sec.items.map((it) => {
                  const r = results[it.key];
                  const flagged = r?.status === "attention" || r?.status === "urgent";
                  return (
                    <li key={it.key} className="px-4 py-3">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <span className="text-[15px] text-ink">{it.label}</span>
                        <div className="grid shrink-0 grid-cols-4 gap-1.5" role="radiogroup" aria-label={it.label}>
                          {STATUSES.map((s) => (
                            <button
                              key={s}
                              type="button"
                              role="radio"
                              aria-checked={r?.status === s}
                              title={STATUS_HINT[s]}
                              onClick={() => mark(it.key, s)}
                              className={cx(
                                "h-10 min-w-[72px] rounded-lg border px-2 text-sm font-medium",
                                r?.status === s ? ON[s] : "border-line bg-surface text-charcoal hover:border-faint",
                              )}
                            >
                              {STATUS_LABEL[s]}
                            </button>
                          ))}
                        </div>
                      </div>
                      {flagged ? (
                        <Input
                          className="mt-2"
                          value={r?.note ?? ""}
                          onChange={(e) => note(it.key, e.target.value)}
                          placeholder={r?.status === "urgent" ? "What's wrong and why it's a safety concern" : "What needs attention, e.g. 4 mm left"}
                          aria-label={`Note for ${it.label}`}
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}

        <Card className="space-y-4 p-4">
          <h2 className="font-semibold text-ink">Findings and recommendations</h2>
          <Field label="Immediate safety concerns">
            <Textarea rows={2} value={insp.safety_concerns} onChange={(e) => set("safety_concerns", e.target.value)} />
          </Field>
          <Field label="Recommended repairs / maintenance">
            <Textarea rows={3} value={insp.recommendations} onChange={(e) => set("recommendations", e.target.value)} />
          </Field>
          <Field label="Measurements / diagnostic codes">
            <Textarea rows={2} value={insp.measurements} onChange={(e) => set("measurements", e.target.value)} placeholder="Pad thickness, tread depth, battery test, codes" />
          </Field>
          <div className="flex flex-wrap gap-6">
            <YesNo label="Customer notified" value={insp.customer_notified} onChange={(v) => set("customer_notified", v)} />
            <YesNo label="Customer authorized recommended work" value={insp.customer_authorized} onChange={(v) => set("customer_authorized", v)} />
          </div>
          <p className="text-xs text-muted">{DISCLAIMER}</p>
        </Card>
      </div>

      {/* Progress bar that stays in view */}
      <div className="fixed inset-x-0 bottom-[calc(57px+env(safe-area-inset-bottom))] z-10 border-t border-line bg-surface/95 backdrop-blur md:bottom-0">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3 text-sm">
            <span className="tabular font-medium text-ink">
              {sum.done} / {ALL_ITEMS.length}
            </span>
            {sum.attention ? <span className="text-warn">{sum.attention} attention</span> : null}
            {sum.urgent ? <span className="font-medium text-bad">{sum.urgent} urgent</span> : null}
          </div>
          <a
            href={`/api/jobs/${jobId}/pdf?doc=inspection`}
            target="_blank"
            rel="noopener"
            onClick={async (e) => {
              // Save the last changes first so the PDF includes them
              e.preventDefault();
              const tab = window.open("", "_blank");
              await save.flush();
              if (tab) tab.location.href = `/api/jobs/${jobId}/pdf?doc=inspection`;
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a PDF, not a page
              else window.location.href = `/api/jobs/${jobId}/pdf?doc=inspection`;
            }}
            className="inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-ink hover:bg-brand-hover"
          >
            Print inspection
          </a>
        </div>
      </div>
    </div>
  );
}
