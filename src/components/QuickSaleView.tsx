"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { DocumentButtons } from "./DocumentButtons";
import { Button, Card, Field, Input, Notice, NumberInput, PageTitle, Select, cx } from "./ui";
import { formatPhone, money, vehicleLabel } from "@/lib/format";
import { PAYMENT_LABEL } from "@/lib/jobs";
import { reuseLines, toReusable, type Rates, type ReusableLine, type SavedItem } from "@/lib/reuse";
import { supabaseBrowser } from "@/lib/supabase/client";
import { KIND_LABEL, jobTotals, lineAmount, type LineKind } from "@/lib/totals";
import { checkVin, normalizeVin } from "@/lib/vin";
import { MAKES } from "@/lib/vpic";
import type { CustomerWithVehicles, PaymentMethod } from "@/lib/types";

export type QuickSettings = Rates & {
  hst_rate: number;
  shop_supplies_enabled: boolean;
  shop_supplies_pct: number;
  shop_supplies_cap: number | null;
};

type Line = ReusableLine & { key: string };
type Vehicle = CustomerWithVehicles["vehicles"][number];
/** A customer, and maybe one of their cars, picked from what's on file */
type OnFile = { customer: CustomerWithVehicles; vehicle: Vehicle | null };

const KINDS: LineKind[] = ["labour_mechanical", "part", "sublet", "fee"];
const METHODS: PaymentMethod[] = ["cash", "debit", "credit", "etransfer"];
const compact = (s: string) => s.replace(/[\s-]/g, "").toUpperCase();
const digits = (s: string) => s.replace(/\D/g, "");
let keys = 0;
const nextKey = () => `l${++keys}`;

/**
 * Quick sale: for small walk-in jobs (oil change, alignment). Name, phone, plate and car, the
 * work, how they paid, and one tap saves the customer, car, invoice (with HST) and payment.
 * Skips the estimate, work order and quality check that bigger jobs go through.
 */
export function QuickSaleView({
  customers,
  savedItems,
  settings,
  nextNumber,
}: {
  customers: CustomerWithVehicles[];
  savedItems: SavedItem[];
  settings: QuickSettings;
  nextNumber: number;
}) {
  const router = useRouter();
  const ids = useId();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [plate, setPlate] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [more, setMore] = useState(false);
  const [year, setYear] = useState<number | null>(null);
  const [vin, setVin] = useState("");
  const [odometer, setOdometer] = useState<number | null>(null);
  const [picked, setPicked] = useState<OnFile | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; number: number; total: number; method: PaymentMethod } | null>(null);
  const [number, setNumber] = useState(nextNumber);

  // Cars and customers already on file that match the plate or phone typed so far
  const suggestions = useMemo((): OnFile[] => {
    if (picked) return [];
    const p = compact(plate);
    const d = digits(phone);
    const out: OnFile[] = [];
    if (p.length >= 3) {
      for (const c of customers) for (const v of c.vehicles) if (compact(v.plate).startsWith(p)) out.push({ customer: c, vehicle: v });
    }
    if (d.length >= 4) {
      for (const c of customers) if (digits(c.phone).includes(d) && !out.some((o) => o.customer.id === c.id)) out.push({ customer: c, vehicle: null });
    }
    return out.slice(0, 4);
  }, [customers, plate, phone, picked]);

  const job = {
    discount: 0,
    hst_rate: Number(settings.hst_rate),
    shop_supplies_pct: settings.shop_supplies_enabled ? Number(settings.shop_supplies_pct) : null,
    shop_supplies_cap: settings.shop_supplies_enabled && settings.shop_supplies_cap !== null ? Number(settings.shop_supplies_cap) : null,
    is_insurance: false,
    deductible: 0,
    insurer_pays: null,
    amount_paid: 0,
  };
  const totals = jobTotals(job, lines);

  function use(o: OnFile) {
    setPicked(o);
    setName(o.customer.name);
    setPhone(o.customer.phone);
    if (o.vehicle) {
      setPlate(o.vehicle.plate);
      setMake(o.vehicle.make);
      setModel(o.vehicle.model);
    }
    setError(null);
  }

  function unpick() {
    setPicked(null);
    setError(null);
  }

  function addSaved(item: SavedItem) {
    const rows = reuseLines(item.lines, settings, "", 0).map((r) => ({ ...toReusable(r), key: nextKey() }));
    setLines((ls) => [...ls, ...rows]);
  }

  function addBlank() {
    setLines((ls) => [
      ...ls,
      { key: nextKey(), kind: "labour_mechanical", description: "", quantity: 1, unit_price: Number(settings.rate_mechanical) || 0, markup_pct: 0, part_condition: null, oem: null, part_number: "" },
    ]);
  }

  function setLine(key: string, patch: Partial<Line>) {
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const n = { ...l, ...patch };
        if (patch.kind && patch.kind !== l.kind) {
          n.part_condition = patch.kind === "part" ? "new" : null;
          n.oem = patch.kind === "part" ? false : null;
          if (patch.kind === "labour_mechanical") n.unit_price = Number(settings.rate_mechanical) || n.unit_price;
        }
        return n;
      }),
    );
  }

  function problem(): string | null {
    if (!picked && !name.trim()) return "Enter the customer's name.";
    if (!picked?.vehicle && !compact(plate) && !make.trim() && !model.trim()) return "Add the plate, or the make and model.";
    const v = normalizeVin(vin);
    if (!picked?.vehicle && v) {
      const c = checkVin(v);
      if (!c.ok) return c.reason;
    }
    if (!lines.length) return "Add the work done.";
    if (lines.some((l) => !l.description.trim())) return "Every item needs a description; it's printed on the invoice.";
    if (totals.total <= 0) return "The total must be more than $0.";
    if (!method) return "Pick how the customer paid.";
    return null;
  }

  async function save() {
    const p = problem();
    if (p) return setError(p);
    setBusy(true);
    setError(null);
    const newVehicle = picked?.vehicle
      ? null
      : { plate: plate.trim().toUpperCase(), make: make.trim(), model: model.trim(), year: year === null ? "" : String(Math.round(year)), vin: normalizeVin(vin) ?? "" };
    const { data, error: err } = await supabaseBrowser()
      .rpc("quick_sale", {
        p_customer: picked?.customer.id ?? null,
        p_new_customer: picked ? null : { name: name.trim(), phone: formatPhone(phone) },
        p_vehicle: picked?.vehicle?.id ?? null,
        p_new_vehicle: newVehicle,
        p_odometer: odometer === null ? null : Math.round(odometer),
        p_lines: lines.map(toReusable),
        p_totals: { ...totals, overEstimate: false },
        p_rates: { hst_rate: job.hst_rate, shop_supplies_pct: job.shop_supplies_pct, shop_supplies_cap: job.shop_supplies_cap },
        p_method: method,
        p_reference: reference.trim(),
      })
      .single<{ id: string; number: number }>();
    setBusy(false);
    if (err || !data) {
      const m = err?.message ?? "Couldn't save the sale.";
      return setError(m.includes("vehicles_vin_key") ? "Another car on file already has this VIN. Find it by its plate instead." : m);
    }
    setDone({ id: data.id, number: data.number, total: totals.total, method: method! });
    setNumber(data.number + 1);
    router.refresh();
  }

  function startOver() {
    setName("");
    setPhone("");
    setPlate("");
    setMake("");
    setModel("");
    setYear(null);
    setVin("");
    setOdometer(null);
    setMore(false);
    setPicked(null);
    setLines([]);
    setMethod(null);
    setReference("");
    setError(null);
    setDone(null);
  }

  if (done) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Card className="space-y-4 p-5 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ok-soft text-ok" aria-hidden>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12 5 5 9-10" />
            </svg>
          </div>
          <div>
            <h1 className="display text-2xl text-ink">INV-{done.number} paid</h1>
            <p className="mt-1 text-muted">
              {money(done.total)} by {PAYMENT_LABEL[done.method].toLowerCase()}
            </p>
          </div>
          <p className="text-sm text-muted">
            {done.method === "cash" ? "Saved with its invoice. Print or share a copy if the customer wants one." : "Print or share the invoice for the customer."}
          </p>
          <div className="flex justify-center">
            <DocumentButtons jobId={done.id} number={done.number} status="paid" hasInspection={false} quick />
          </div>
        </Card>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="lg" onClick={startOver} className="flex-1">
            New quick sale
          </Button>
          <Link href={`/jobs/${done.id}`} className="inline-flex h-12 flex-1 items-center justify-center rounded-lg border border-line bg-surface px-5 font-medium text-ink hover:bg-canvas">
            Open INV-{done.number}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      <div>
        <Link href="/jobs" className="mb-2 inline-block text-sm text-muted hover:text-ink">
          ← Jobs
        </Link>
        <PageTitle sub={`For small jobs like an oil change: the work, the payment, and the invoice in one step. This will be INV-${number}.`}>Quick sale</PageTitle>
      </div>

      {/* Customer and car */}
      <Card className="space-y-4 p-4 md:p-5">
        <h2 className="font-semibold text-ink">Customer and car</h2>
        {picked ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-canvas px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate font-medium text-ink">{picked.customer.name}</p>
              <p className="truncate text-sm text-muted">
                {[picked.customer.phone, picked.vehicle ? [picked.vehicle.plate, vehicleLabel(picked.vehicle)].filter(Boolean).join(" · ") : "New car below"].filter(Boolean).join(" · ")}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={unpick}>
              Change
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" autoFocus />
            </Field>
            <Field label="Phone" hint="Optional.">
              <Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={(e) => setPhone(formatPhone(e.target.value))} />
            </Field>
          </div>
        )}

        {picked?.vehicle ? null : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label="Plate" className="col-span-2 sm:col-span-1">
                <Input value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" />
              </Field>
              <Field label="Make">
                <Input value={make} onChange={(e) => setMake(e.target.value)} list={`${ids}-makes`} autoComplete="off" placeholder="Toyota" />
              </Field>
              <Field label="Model">
                <Input value={model} onChange={(e) => setModel(e.target.value)} autoComplete="off" placeholder="Corolla" />
              </Field>
            </div>
            <datalist id={`${ids}-makes`}>
              {MAKES.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </>
        )}

        {suggestions.length ? (
          <div>
            <p className="mb-2 text-[13px] font-medium text-muted">On file</p>
            <div className="flex flex-col gap-2">
              {suggestions.map((o) => (
                <button
                  key={`${o.customer.id}-${o.vehicle?.id ?? "c"}`}
                  type="button"
                  onClick={() => use(o)}
                  className="flex items-center justify-between gap-3 rounded-lg border border-ink bg-brand-soft px-3 py-2.5 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">
                      {o.vehicle ? [o.vehicle.plate, vehicleLabel(o.vehicle)].filter(Boolean).join(" · ") : o.customer.name}
                    </span>
                    <span className="block truncate text-sm text-charcoal">
                      {o.vehicle ? [o.customer.name, o.customer.phone].filter(Boolean).join(" · ") : `${o.customer.phone} · add this car to them`}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-medium text-ink underline underline-offset-4">Use</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {more ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {picked?.vehicle ? null : (
              <>
                <Field label="Year">
                  <NumberInput value={year} onValue={setYear} inputMode="numeric" min={1900} max={2100} step="1" />
                </Field>
                <Field label="VIN" className="col-span-2 sm:col-span-1">
                  <Input value={vin} onChange={(e) => setVin(e.target.value.toUpperCase())} className="font-mono tracking-wider" maxLength={20} autoCapitalize="characters" spellCheck={false} />
                </Field>
              </>
            )}
            <Field label="Odometer (km)">
              <NumberInput value={odometer} onValue={setOdometer} inputMode="numeric" min={0} step="1" />
            </Field>
          </div>
        ) : (
          <button type="button" onClick={() => setMore(true)} className="text-sm font-medium text-ink underline underline-offset-4">
            {picked?.vehicle ? "Add odometer" : "More (year, VIN, odometer)"}
          </button>
        )}
      </Card>

      {/* The work */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="font-semibold text-ink">The work</h2>
          <span className="tabular text-sm text-muted">{lines.length ? money(totals.subtotal - totals.shopSupplies) : ""}</span>
        </div>
        {lines.length ? (
          <div className="divide-y divide-line">
            {lines.map((l) => (
              <div key={l.key} className="space-y-2 px-4 py-3">
                <div className="flex items-start gap-2">
                  <Input value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} placeholder="Oil and filter change" aria-label="Description" autoFocus={!l.description} />
                  <button
                    type="button"
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-bad"
                    aria-label={`Remove ${l.description || "item"}`}
                  >
                    ×
                  </button>
                </div>
                <div className="grid grid-cols-[1fr_5rem_6.5rem] items-end gap-2 sm:grid-cols-[10rem_6rem_8rem_1fr]">
                  <Select value={l.kind} onChange={(e) => setLine(l.key, { kind: e.target.value as LineKind })} aria-label="Type" className="col-span-3 sm:col-span-1">
                    {(KINDS.includes(l.kind) ? KINDS : [l.kind, ...KINDS]).map((k) => (
                      <option key={k} value={k}>
                        {k === "labour_mechanical" ? "Labour" : KIND_LABEL[k]}
                      </option>
                    ))}
                  </Select>
                  <Field label={l.kind === "labour_mechanical" ? "Hours" : "Qty"}>
                    <NumberInput value={Number(l.quantity)} onValue={(v) => setLine(l.key, { quantity: v ?? 0 })} min={0} step={l.kind === "labour_mechanical" ? "0.1" : "1"} />
                  </Field>
                  <Field label={l.kind === "labour_mechanical" ? "Rate ($/h)" : "Price ($)"}>
                    <NumberInput value={Number(l.unit_price)} onValue={(v) => setLine(l.key, { unit_price: v ?? 0 })} min={0} step="0.01" />
                  </Field>
                  <p className="tabular self-center pt-5 text-right font-medium text-ink sm:pt-5">{money(lineAmount(l))}</p>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        <div className={cx("space-y-3 px-4 py-3", lines.length > 0 && "border-t border-line")}>
          {savedItems.length ? (
            <div className="flex flex-wrap gap-2">
              {savedItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => addSaved(item)}
                  className="inline-flex h-11 items-center gap-2 rounded-lg border border-line bg-brand-soft px-3.5 text-[15px] font-medium text-ink hover:border-faint"
                >
                  + {item.name}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">Tip: lines saved for reuse on a job (like “Oil change”) show here as one-tap buttons.</p>
          )}
          <Button size="sm" onClick={addBlank}>
            + Add item
          </Button>
        </div>
      </Card>

      {/* Payment */}
      <Card className="space-y-4 p-4 md:p-5">
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between text-charcoal">
            <span>Subtotal</span>
            <span className="tabular">{money(totals.subtotal - totals.shopSupplies)}</span>
          </div>
          {totals.shopSupplies ? (
            <div className="flex justify-between text-charcoal">
              <span>Shop supplies</span>
              <span className="tabular">{money(totals.shopSupplies)}</span>
            </div>
          ) : null}
          <div className="flex justify-between text-charcoal">
            <span>HST {Number(settings.hst_rate)}%</span>
            <span className="tabular">{money(totals.hst)}</span>
          </div>
          <div className="flex items-baseline justify-between border-t border-line pt-2">
            <span className="display text-lg text-ink">Total</span>
            <span className="display tabular text-2xl text-ink">{money(totals.total)}</span>
          </div>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-medium text-muted">Paid by</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Paid by">
            {METHODS.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={method === m}
                onClick={() => setMethod(m)}
                className={cx("h-12 rounded-lg border text-[15px] font-medium", method === m ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink hover:border-ink")}
              >
                {m === "credit" ? "Credit" : PAYMENT_LABEL[m]}
              </button>
            ))}
          </div>
        </div>
        {method && method !== "cash" ? (
          <Field label="Reference" hint="Last 4 digits or e-transfer number. Never a full card number.">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={40} placeholder="Optional" />
          </Field>
        ) : null}

        {error ? <Notice tone="bad">{error}</Notice> : null}
        <Button variant="primary" size="lg" onClick={save} disabled={busy} className="w-full">
          {busy ? "Saving…" : `Paid · create INV-${number} · ${money(totals.total)}`}
        </Button>
      </Card>
    </div>
  );
}
