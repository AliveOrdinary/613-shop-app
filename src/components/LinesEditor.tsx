"use client";

import { useState } from "react";
import { Badge, Button, Field, Input, Modal, Notice, NumberInput, Select, cx } from "./ui";
import { money } from "@/lib/format";
import { formatDate, jobNumber } from "@/lib/jobs";
import { reuseLines, toReusable, type PreviousJob, type Rates, type ReusableLine, type SavedItem } from "@/lib/reuse";
import { supabaseBrowser } from "@/lib/supabase/client";
import { KIND_LABEL, LABOUR_KINDS, lineAmount, type LineKind } from "@/lib/totals";
import { useAutosave } from "@/lib/useAutosave";
import type { JobLine, PartCondition } from "@/lib/types";

export type { Rates };

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

function lineDetail(line: Pick<JobLine, "kind" | "quantity" | "unit_price" | "markup_pct">): string {
  if (LABOUR_KINDS.includes(line.kind)) return `${Number(line.quantity)} h × ${money(Number(line.unit_price))}`;
  if (line.kind === "paint_materials") {
    return Number(line.markup_pct) > 0 ? `Cost ${money(Number(line.unit_price) * Number(line.quantity))} + ${Number(line.markup_pct)}%` : "At cost";
  }
  return `${Number(line.quantity)} × ${money(Number(line.unit_price))}`;
}

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
  const detail = lineDetail(line);

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

/** Lines on a saved item or another job, said briefly: "2 lines" */
const nLines = (n: number) => `${n} ${n === 1 ? "line" : "lines"}`;

export function LinesEditor({
  jobId,
  lines,
  setLines,
  rates,
  locked,
  savedItems,
  previous,
}: {
  jobId: string;
  lines: JobLine[];
  setLines: (fn: (ls: JobLine[]) => JobLine[]) => void;
  rates: Rates;
  locked: boolean;
  /** Lines the shop saved for reuse */
  savedItems: SavedItem[];
  /** The car's last job with lines, to copy from */
  previous: PreviousJob | null;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedItem[]>(savedItems);
  const [editingSaved, setEditingSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  /** The last batch added, so it can be undone */
  const [added, setAdded] = useState<{ ids: string[]; label: string; copy: boolean } | null>(null);
  const sb = supabaseBrowser();
  const lastPosition = () => lines.reduce((m, l) => Math.max(m, l.position), 0);

  async function add(kind: LineKind) {
    setAdding(true);
    setError(null);
    setAdded(null);
    const { data, error } = await sb.from("job_lines").insert({ job_id: jobId, position: lastPosition() + 1, ...defaults(kind, rates) }).select("*").single<JobLine>();
    setAdding(false);
    if (error || !data) return setError(error?.message ?? "Couldn't add the line.");
    setLines((ls) => [...ls, data]);
    setOpen(data.id);
  }

  /** Adds several lines at once: a saved item, or the car's last job */
  async function addMany(source: ReusableLine[], label: string, copy = false) {
    setAdding(true);
    setError(null);
    setOpen(null);
    const { data, error } = await sb.from("job_lines").insert(reuseLines(source, rates, jobId, lastPosition())).select("*").returns<JobLine[]>();
    setAdding(false);
    if (error || !data) return setError(error?.message ?? "Couldn't add the lines.");
    const sorted = [...data].sort((a, b) => a.position - b.position);
    setLines((ls) => [...ls, ...sorted]);
    setAdded({ ids: sorted.map((l) => l.id), label, copy });
    if (copy) setCopied(true);
  }

  async function undoAdded() {
    if (!added) return;
    const { error } = await sb.from("job_lines").delete().in("id", added.ids);
    if (error) return setError(error.message);
    setLines((ls) => ls.filter((l) => !added.ids.includes(l.id)));
    if (added.copy) setCopied(false);
    setAdded(null);
  }

  async function remove(line: JobLine) {
    const { error } = await sb.from("job_lines").delete().eq("id", line.id);
    if (error) return setError(error.message);
    setLines((ls) => ls.filter((l) => l.id !== line.id));
    setOpen(null);
  }

  async function removeSaved(item: SavedItem) {
    if (!window.confirm(`Remove “${item.name}” from saved items? Jobs that already use its lines keep them.`)) return;
    const { error } = await sb.from("saved_items").delete().eq("id", item.id);
    if (error) return setError(error.message);
    setSaved((xs) => {
      const left = xs.filter((x) => x.id !== item.id);
      if (left.length === 0) setEditingSaved(false);
      return left;
    });
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
      {added && !locked ? (
        <div className="flex items-center justify-between gap-3 border-t border-line bg-canvas px-4 py-2.5 text-sm" role="status">
          <span className="text-charcoal">
            Added {nLines(added.ids.length)} from {added.label}.
          </span>
          <button type="button" onClick={undoAdded} className="font-medium text-ink underline underline-offset-4">
            Undo
          </button>
        </div>
      ) : null}
      {error ? <p className="px-4 pb-2 pt-2 text-sm text-bad">{error}</p> : null}
      {locked ? null : (
        <div className="space-y-4 border-t border-line px-4 py-3">
          <div>
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

          {saved.length ? (
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[13px] font-medium text-muted">Saved</p>
                <button type="button" onClick={() => setEditingSaved((e) => !e)} className="text-[13px] font-medium text-muted underline underline-offset-4 hover:text-ink">
                  {editingSaved ? "Done" : "Edit"}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {saved.map((item) =>
                  editingSaved ? (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => removeSaved(item)}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-bad/40 bg-surface px-3 text-sm font-medium text-bad"
                      aria-label={`Remove ${item.name}`}
                    >
                      {item.name}
                      <span aria-hidden>×</span>
                    </button>
                  ) : (
                    <button
                      key={item.id}
                      type="button"
                      disabled={adding}
                      onClick={() => addMany(item.lines, item.name)}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-brand-soft px-3 text-sm font-medium text-ink hover:border-faint disabled:opacity-50"
                    >
                      + {item.name}
                      {item.lines.length > 1 ? <span className="tabular text-xs text-muted">{item.lines.length}</span> : null}
                    </button>
                  ),
                )}
              </div>
            </div>
          ) : null}

          {(previous && !copied) || lines.length ? (
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {previous && !copied ? (
                <button
                  type="button"
                  disabled={adding}
                  onClick={() => addMany(previous.lines, jobNumber(previous), true)}
                  className="text-sm font-medium text-ink underline underline-offset-4 disabled:opacity-50"
                >
                  Copy {nLines(previous.lines.length)} from this car&apos;s {jobNumber(previous)} ({formatDate(previous.estimate_date)})
                </button>
              ) : null}
              {lines.length ? (
                <button type="button" onClick={() => setSaving(true)} className="text-sm font-medium text-ink underline underline-offset-4">
                  Save lines for reuse
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
      {saving ? (
        <SaveForReuse
          lines={lines}
          onClose={() => setSaving(false)}
          onSaved={(item) => {
            setSaved((xs) => [...xs, item].sort((a, b) => a.name.localeCompare(b.name)));
            setSaving(false);
          }}
        />
      ) : null}
    </div>
  );
}

/** Saves some of this job's lines under a name, to add to another job in one tap */
function SaveForReuse({ lines, onClose, onSaved }: { lines: JobLine[]; onClose: () => void; onSaved: (item: SavedItem) => void }) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>(lines.map((l) => l.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const n = name.trim();
    if (!n) return setError("Give it a name, like “Front brakes” or “Oil and filter change”.");
    const chosen = lines.filter((l) => picked.includes(l.id));
    if (!chosen.length) return setError("Tick at least one line.");
    setBusy(true);
    setError(null);
    const { data, error } = await supabaseBrowser()
      .from("saved_items")
      .insert({ name: n, lines: chosen.map(toReusable) })
      .select("*")
      .single<SavedItem>();
    setBusy(false);
    if (error || !data) {
      return setError(error?.code === "23505" ? `There's already a saved item called “${n}”. Pick another name, or remove the old one first.` : (error?.message ?? "Couldn't save."));
    }
    onSaved(data);
  }

  return (
    <Modal title="Save for reuse" onClose={onClose}>
      <p className="mb-4 text-sm text-muted">
        Adds a button under the lines on every job. One tap adds these lines. Labour uses the rates in Settings at the time.
      </p>
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Front brakes" maxLength={80} autoFocus />
      </Field>
      <p className="mb-1 mt-4 text-[13px] font-medium text-muted">Lines to save</p>
      <div className="max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line">
        {lines.map((l) => (
          <label key={l.id} className="flex cursor-pointer items-start gap-3 px-3 py-2.5">
            <input
              type="checkbox"
              checked={picked.includes(l.id)}
              onChange={(e) => setPicked((p) => (e.target.checked ? [...p, l.id] : p.filter((x) => x !== l.id)))}
              className="mt-0.5 h-5 w-5 shrink-0 accent-ink"
            />
            <span className="min-w-0">
              <span className={cx("block truncate font-medium", l.description ? "text-ink" : "text-faint")}>{l.description || "No description"}</span>
              <span className="tabular block text-sm text-muted">
                {KIND_LABEL[l.kind]} · {lineDetail(l)}
              </span>
            </span>
          </label>
        ))}
      </div>
      {error ? (
        <div className="mt-3">
          <Notice tone="bad">{error}</Notice>
        </div>
      ) : null}
      <div className="mt-5 flex gap-2">
        <Button variant="primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : `Save ${nLines(picked.length)}`}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
