"use client";

import { useState } from "react";
import { Badge, Button, Field, Input, NumberInput, Select, cx } from "./ui";
import { money } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { KIND_LABEL, LABOUR_KINDS, lineAmount, type LineKind } from "@/lib/totals";
import { useAutosave } from "@/lib/useAutosave";
import type { JobLine, PartCondition } from "@/lib/types";

export type Rates = { rate_body: number; rate_paint: number; rate_mechanical: number; paint_markup_pct: number };

const DEFAULT_DESCRIPTION: Partial<Record<LineKind, string>> = {
  paint_materials: "Paint and materials",
};

function defaults(kind: LineKind, rates: Rates): Pick<JobLine, "kind" | "description" | "quantity" | "unit_price" | "markup_pct" | "part_condition" | "oem"> {
  const rate = kind === "labour_body" ? rates.rate_body : kind === "labour_paint" ? rates.rate_paint : kind === "labour_mechanical" ? rates.rate_mechanical : 0;
  return {
    kind,
    description: DEFAULT_DESCRIPTION[kind] ?? "",
    quantity: 1,
    unit_price: Number(rate) || 0,
    markup_pct: kind === "paint_materials" ? Number(rates.paint_markup_pct) || 0 : 0,
    part_condition: kind === "part" ? "new" : null,
    oem: kind === "part" ? false : null,
  };
}

const CONDITION_LABEL: Record<PartCondition, string> = { new: "New", used: "Used", reconditioned: "Reconditioned" };

function LineRow({
  line,
  locked,
  open,
  onOpen,
  onChange,
  onDelete,
}: {
  line: JobLine;
  locked: boolean;
  open: boolean;
  onOpen: (open: boolean) => void;
  onChange: (l: JobLine) => void;
  onDelete: () => void;
}) {
  const save = useAutosave("job_lines", line.id);
  const set = <K extends keyof JobLine>(k: K, v: JobLine[K]) => {
    onChange({ ...line, [k]: v });
    save.queue({ [k]: v });
  };
  const labour = LABOUR_KINDS.includes(line.kind);
  const amount = lineAmount(line);
  const detail = labour
    ? `${Number(line.quantity)} h × ${money(Number(line.unit_price))}`
    : line.kind === "paint_materials"
      ? Number(line.markup_pct) > 0
        ? `Cost ${money(Number(line.unit_price) * Number(line.quantity))} + ${Number(line.markup_pct)}%`
        : "At cost"
      : `${Number(line.quantity)} × ${money(Number(line.unit_price))}`;

  if (!open || locked) {
    return (
      <button
        type="button"
        onClick={() => !locked && onOpen(true)}
        className={cx("flex w-full items-start gap-3 px-4 py-3 text-left", !locked && "hover:bg-canvas")}
        disabled={locked}
      >
        <div className="min-w-0 flex-1">
          <p className={cx("font-medium", line.description ? "text-ink" : "text-faint")}>{line.description || "No description"}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <Badge tone={labour ? "brand" : "neutral"}>{KIND_LABEL[line.kind]}</Badge>
            <span className="tabular">{detail}</span>
            {line.kind === "part" && line.part_condition ? <span>{CONDITION_LABEL[line.part_condition]}{line.oem ? " · OEM" : ""}</span> : null}
          </p>
        </div>
        <span className="tabular shrink-0 pt-0.5 font-medium text-ink">{money(amount)}</span>
      </button>
    );
  }

  return (
    <div className="space-y-3 bg-canvas/60 px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <Select value={line.kind} onChange={(e) => set("kind", e.target.value as LineKind)} className="w-auto" aria-label="Line type">
          {(Object.keys(KIND_LABEL) as LineKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </Select>
        <span className="text-xs text-muted">{save.state === "saving" ? "Saving…" : save.state === "error" ? "Not saved" : save.state === "saved" ? "Saved" : ""}</span>
      </div>
      <Field label="Description">
        <Input value={line.description} onChange={(e) => set("description", e.target.value)} autoFocus={!line.description} placeholder={labour ? "Remove and replace front bumper" : line.kind === "part" ? "Front bumper cover" : ""} />
      </Field>

      {line.kind === "paint_materials" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Paint cost ($)" hint="What the paint for this job cost.">
            <NumberInput value={Number(line.unit_price)} onValue={(v) => set("unit_price", v ?? 0)} min={0} step="0.01" />
          </Field>
          <Field label="Markup (%)" hint={`Customer pays ${money(amount)}`}>
            <NumberInput value={Number(line.markup_pct)} onValue={(v) => set("markup_pct", v ?? 0)} min={0} step="0.1" />
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label={labour ? "Hours" : "Quantity"}>
            <NumberInput value={Number(line.quantity)} onValue={(v) => set("quantity", v ?? 0)} min={0} step={labour ? "0.1" : "1"} />
          </Field>
          <Field label={labour ? "Rate ($ / hr)" : "Price each ($)"} hint={`Line total ${money(amount)}`}>
            <NumberInput value={Number(line.unit_price)} onValue={(v) => set("unit_price", v ?? 0)} min={0} step="0.01" />
          </Field>
        </div>
      )}

      {line.kind === "part" ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Field label="Condition">
            <Select value={line.part_condition ?? "new"} onChange={(e) => set("part_condition", e.target.value as PartCondition)}>
              {(Object.keys(CONDITION_LABEL) as PartCondition[]).map((c) => (
                <option key={c} value={c}>
                  {CONDITION_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Maker">
            <Select value={line.oem ? "oem" : "aftermarket"} onChange={(e) => set("oem", e.target.value === "oem")}>
              <option value="oem">OEM</option>
              <option value="aftermarket">Aftermarket</option>
            </Select>
          </Field>
          <Field label="Part number" className="col-span-2 md:col-span-1">
            <Input value={line.part_number} onChange={(e) => set("part_number", e.target.value)} />
          </Field>
        </div>
      ) : null}

      {save.error ? <p className="text-sm text-bad">Couldn&apos;t save: {save.error}</p> : null}
      <div className="flex justify-between gap-2 pt-1">
        <Button size="sm" variant="primary" onClick={async () => { await save.flush(); onOpen(false); }}>
          Done
        </Button>
        <Button size="sm" variant="dangerGhost" onClick={onDelete}>
          Remove line
        </Button>
      </div>
    </div>
  );
}

export function LinesEditor({
  jobId,
  lines,
  setLines,
  rates,
  locked,
}: {
  jobId: string;
  lines: JobLine[];
  setLines: (fn: (ls: JobLine[]) => JobLine[]) => void;
  rates: Rates;
  locked: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sb = supabaseBrowser();

  async function add(kind: LineKind) {
    setAdding(true);
    setError(null);
    const position = lines.reduce((m, l) => Math.max(m, l.position), 0) + 1;
    const { data, error } = await sb.from("job_lines").insert({ job_id: jobId, position, ...defaults(kind, rates) }).select("*").single<JobLine>();
    setAdding(false);
    if (error || !data) return setError(error?.message ?? "Couldn't add the line.");
    setLines((ls) => [...ls, data]);
    setOpen(data.id);
  }

  async function remove(line: JobLine) {
    const { error } = await sb.from("job_lines").delete().eq("id", line.id);
    if (error) return setError(error.message);
    setLines((ls) => ls.filter((l) => l.id !== line.id));
    setOpen(null);
  }

  return (
    <div>
      {lines.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted">No lines yet. Add the labour, parts and paint for this job.</p>
      ) : (
        <div className="divide-y divide-line">
          {lines.map((l) => (
            <LineRow
              key={l.id}
              line={l}
              locked={locked}
              open={open === l.id}
              onOpen={(o) => setOpen(o ? l.id : null)}
              onChange={(nl) => setLines((ls) => ls.map((x) => (x.id === nl.id ? nl : x)))}
              onDelete={() => remove(l)}
            />
          ))}
        </div>
      )}
      {error ? <p className="px-4 pb-2 text-sm text-bad">{error}</p> : null}
      {locked ? null : (
        <div className="border-t border-line px-4 py-3">
          <p className="mb-2 text-[13px] font-medium text-muted">Add</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => add("labour_body")} disabled={adding}>+ Body labour</Button>
            <Button size="sm" onClick={() => add("labour_paint")} disabled={adding}>+ Paint labour</Button>
            <Button size="sm" onClick={() => add("labour_mechanical")} disabled={adding}>+ Mechanical</Button>
            <Button size="sm" onClick={() => add("part")} disabled={adding}>+ Part</Button>
            <Button size="sm" onClick={() => add("paint_materials")} disabled={adding}>+ Paint materials</Button>
            <Button size="sm" onClick={() => add("sublet")} disabled={adding}>+ Sublet</Button>
            <Button size="sm" onClick={() => add("fee")} disabled={adding}>+ Fee</Button>
          </div>
        </div>
      )}
    </div>
  );
}
