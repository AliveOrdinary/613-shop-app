"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, EmptyState, Field, Input, Notice, NumberInput, PageTitle, Select } from "./ui";
import { money } from "@/lib/format";
import { labourRate, savedItemPrice, toReusable, type Rates, type ReusableLine, type SavedItem } from "@/lib/reuse";
import { supabaseBrowser } from "@/lib/supabase/client";
import { KIND_LABEL, LABOUR_KINDS, type LineKind } from "@/lib/totals";
import type { PartCondition } from "@/lib/types";

type Line = ReusableLine & { key: string };
/** The item being written: a new one (maybe a copy), or one already saved */
type Draft = { id: string | null; name: string; lines: Line[] };

const KINDS = Object.keys(KIND_LABEL) as LineKind[];
const CONDITIONS: PartCondition[] = ["new", "used", "reconditioned"];
const CONDITION_LABEL: Record<PartCondition, string> = { new: "New", used: "Used", reconditioned: "Reconditioned" };
let keys = 0;
const nextKey = () => `s${++keys}`;
const withKeys = (lines: ReusableLine[]): Line[] => lines.map((l) => ({ ...toReusable(l), key: nextKey() }));
const blankLine = (): Line => ({ key: nextKey(), kind: "labour_mechanical", description: "", quantity: 1, unit_price: 0, markup_pct: 0, part_condition: null, oem: null, part_number: "" });

/**
 * Settings → Saved items: the one-tap buttons on jobs and quick sales. Add, change, copy,
 * remove, and put them in the order they show (the busiest first).
 */
export function SavedItemsView({ initial, rates }: { initial: SavedItem[]; rates: Rates }) {
  const router = useRouter();
  const sb = supabaseBrowser();
  const [items, setItems] = useState<SavedItem[]>(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function edit(item: SavedItem) {
    setDraft({ id: item.id, name: item.name, lines: withKeys(item.lines) });
    setError(null);
  }

  function copy(item: SavedItem) {
    setDraft({ id: null, name: `${item.name} (copy)`, lines: withKeys(item.lines) });
    setError(null);
  }

  async function move(i: number, by: -1 | 1) {
    const a = items[i];
    const b = items[i + by];
    if (!a || !b) return;
    setBusy(true);
    setError(null);
    const { error: err } = await sb.rpc("swap_saved_items", { p_a: a.id, p_b: b.id });
    setBusy(false);
    if (err) return setError(err.message);
    setItems((xs) => {
      const next = [...xs];
      next[i] = { ...b, position: a.position };
      next[i + by] = { ...a, position: b.position };
      return next;
    });
    router.refresh();
  }

  async function remove(item: SavedItem) {
    if (!window.confirm(`Remove “${item.name}” from saved items? Jobs that already use its lines keep them.`)) return;
    setBusy(true);
    setError(null);
    const { error: err } = await sb.from("saved_items").delete().eq("id", item.id);
    setBusy(false);
    if (err) return setError(err.message);
    setItems((xs) => xs.filter((x) => x.id !== item.id));
    router.refresh();
  }

  function onSaved(item: SavedItem) {
    setItems((xs) => (xs.some((x) => x.id === item.id) ? xs.map((x) => (x.id === item.id ? item : x)) : [...xs, item]));
    setDraft(null);
    router.refresh();
  }

  if (draft) return <Editor draft={draft} setDraft={setDraft} rates={rates} onSaved={onSaved} onCancel={() => setDraft(null)} />;

  return (
    <div className="space-y-4 pb-4">
      <div>
        <Link href="/settings" className="mb-2 inline-block text-sm text-muted hover:text-ink">
          ← Settings
        </Link>
        <PageTitle
          sub="One-tap buttons under the lines on every job and on quick sales, in this order. Labour uses the rates in Settings at the time."
          action={
            <Button variant="primary" onClick={() => setDraft({ id: null, name: "", lines: [blankLine()] })}>
              + New item
            </Button>
          }
        >
          Saved items
        </PageTitle>
      </div>

      {error ? <Notice tone="bad">{error}</Notice> : null}

      {items.length === 0 ? (
        <EmptyState title="No saved items yet">Add the jobs you do often, like an oil change or a tire swap, so they&apos;re one tap on a job or quick sale.</EmptyState>
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {items.map((item, i) => (
            <div key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  onClick={() => void move(i, -1)}
                  disabled={busy || i === 0}
                  className="flex h-8 w-9 items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-ink disabled:opacity-30"
                  aria-label={`Move ${item.name} up`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => void move(i, 1)}
                  disabled={busy || i === items.length - 1}
                  className="flex h-8 w-9 items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-ink disabled:opacity-30"
                  aria-label={`Move ${item.name} down`}
                >
                  ↓
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{item.name}</p>
                <p className="truncate text-sm text-muted">
                  {item.lines.length} {item.lines.length === 1 ? "line" : "lines"} · about {money(savedItemPrice(item.lines, rates))} before tax
                </p>
              </div>
              <div className="flex w-full gap-1 sm:w-auto">
                <Button size="sm" onClick={() => edit(item)} disabled={busy} className="flex-1 sm:flex-none">
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => copy(item)} disabled={busy} className="flex-1 sm:flex-none">
                  Duplicate
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void remove(item)} disabled={busy} className="flex-1 text-bad sm:flex-none">
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

/** Adding or changing one saved item: its name and its lines */
function Editor({
  draft,
  setDraft,
  rates,
  onSaved,
  onCancel,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  rates: Rates;
  onSaved: (item: SavedItem) => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lines = draft.lines;

  const setLines = (ls: Line[]) => setDraft({ ...draft, lines: ls });
  function setLine(key: string, patch: Partial<Line>) {
    setLines(
      lines.map((l) => {
        if (l.key !== key) return l;
        const n = { ...l, ...patch };
        if (patch.kind && patch.kind !== l.kind) {
          n.part_condition = patch.kind === "part" ? "new" : null;
          n.oem = patch.kind === "part" ? false : null;
          n.part_number = "";
        }
        return n;
      }),
    );
  }
  function moveLine(i: number, by: -1 | 1) {
    const next = [...lines];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    setLines(next);
  }

  async function save() {
    const name = draft.name.trim();
    if (!name) return setError("Give it a name, like “Oil change” or “Front brakes”.");
    if (!lines.length) return setError("Add at least one line.");
    if (lines.some((l) => !l.description.trim())) return setError("Every line needs a description; it's printed on the estimate and invoice.");
    if (lines.some((l) => !(Number(l.quantity) > 0))) return setError("Every line needs hours or a quantity more than 0.");
    setBusy(true);
    setError(null);
    const row = { name, lines: lines.map(toReusable) };
    const sb = supabaseBrowser();
    const { data, error: err } = await (draft.id ? sb.from("saved_items").update(row).eq("id", draft.id) : sb.from("saved_items").insert(row)).select("*").single<SavedItem>();
    setBusy(false);
    if (err || !data) {
      return setError(err?.code === "23505" ? `There's already a saved item called “${name}”. Pick another name.` : (err?.message ?? "Couldn't save."));
    }
    onSaved(data);
  }

  return (
    <div className="space-y-4 pb-4">
      <div>
        <button type="button" onClick={onCancel} className="mb-2 inline-block text-sm text-muted hover:text-ink">
          ← Saved items
        </button>
        <PageTitle sub="Labour lines take the hours; the hourly rate comes from Settings when the item is used.">{draft.id ? "Edit saved item" : "New saved item"}</PageTitle>
      </div>

      <Card className="p-4 md:p-5">
        <Field label="Name" hint="The button's label.">
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Oil change" maxLength={80} autoFocus={!draft.id} />
        </Field>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="font-semibold text-ink">Lines</h2>
          <span className="tabular text-sm text-muted">about {money(savedItemPrice(lines, rates))} before tax</span>
        </div>
        <div className="divide-y divide-line">
          {lines.map((l, i) => {
            const labour = LABOUR_KINDS.includes(l.kind);
            const rate = labourRate(l.kind, rates);
            return (
              <div key={l.key} className="space-y-2 px-4 py-3">
                <div className="flex items-start gap-2">
                  <Input value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} placeholder="Oil and filter change" aria-label="Description" />
                  <button
                    type="button"
                    onClick={() => moveLine(i, -1)}
                    disabled={i === 0}
                    className="flex h-11 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-ink disabled:opacity-30"
                    aria-label="Move line up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => setLines(lines.filter((x) => x.key !== l.key))}
                    className="flex h-11 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-bad"
                    aria-label={`Remove ${l.description || "line"}`}
                  >
                    ×
                  </button>
                </div>
                <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[12rem_7rem_1fr]">
                  <Select value={l.kind} onChange={(e) => setLine(l.key, { kind: e.target.value as LineKind })} aria-label="Type" className="col-span-2 sm:col-span-1">
                    {KINDS.map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </Select>
                  <Field label={labour ? "Hours" : "Qty"}>
                    <NumberInput value={Number(l.quantity)} onValue={(v) => setLine(l.key, { quantity: v ?? 0 })} min={0} step={labour ? "0.1" : "1"} />
                  </Field>
                  {labour ? (
                    <p className="self-center pt-5 text-sm text-muted">at {money(rate ?? 0)}/h from Settings</p>
                  ) : (
                    <Field label={l.kind === "paint_materials" ? `Cost ($), +${Number(rates.paint_markup_pct) || 0}% markup` : "Price each ($)"}>
                      <NumberInput value={Number(l.unit_price)} onValue={(v) => setLine(l.key, { unit_price: v ?? 0 })} min={0} step="0.01" />
                    </Field>
                  )}
                </div>
                {l.kind === "part" ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <Field label="Condition">
                      <Select value={l.part_condition ?? "new"} onChange={(e) => setLine(l.key, { part_condition: e.target.value as PartCondition })}>
                        {CONDITIONS.map((c) => (
                          <option key={c} value={c}>
                            {CONDITION_LABEL[c]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Brand">
                      <Select value={l.oem ? "oem" : "aftermarket"} onChange={(e) => setLine(l.key, { oem: e.target.value === "oem" })}>
                        <option value="oem">OEM</option>
                        <option value="aftermarket">Aftermarket</option>
                      </Select>
                    </Field>
                    <Field label="Part number" className="col-span-2 sm:col-span-1">
                      <Input value={l.part_number} onChange={(e) => setLine(l.key, { part_number: e.target.value })} placeholder="Optional" />
                    </Field>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="border-t border-line px-4 py-3">
          <Button size="sm" onClick={() => setLines([...lines, blankLine()])}>
            + Add line
          </Button>
        </div>
      </Card>

      {error ? <Notice tone="bad">{error}</Notice> : null}
      <div className="flex gap-2">
        <Button variant="primary" size="lg" onClick={() => void save()} disabled={busy} className="flex-1">
          {busy ? "Saving…" : draft.id ? "Save changes" : "Save item"}
        </Button>
        <Button variant="ghost" size="lg" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
