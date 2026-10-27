"use client";

import { useEffect, useId, useState, type Dispatch, type SetStateAction } from "react";
import { Button, Field, Input, Notice, NumberInput, Spinner, Textarea } from "./ui";
import { checkVin, normalizeVin, vinModelYear } from "@/lib/vin";
import { MAKES, decodeVin, lookupLabel, modelsFor, type VinLookup } from "@/lib/vpic";
import type { VehicleDraft } from "@/lib/types";

type Lookup = { vin: string; result: VinLookup | null | "error" };

/** The lookup's values that differ from what's in the form (empty lookup values never count) */
function differences(d: VehicleDraft, l: VinLookup): Partial<VehicleDraft> {
  const out: Partial<VehicleDraft> = {};
  if (l.year !== null && d.year !== l.year) out.year = l.year;
  for (const k of ["make", "model", "trim", "engine"] as const) {
    if (l[k] && d[k].trim() !== l[k]) out[k] = l[k];
  }
  return out;
}

/** Tidies a vehicle before saving */
export function cleanVehicle(d: VehicleDraft): VehicleDraft {
  return {
    ...d,
    vin: d.vin ? normalizeVin(d.vin) : null,
    make: d.make.trim(),
    model: d.model.trim(),
    trim: d.trim.trim(),
    engine: d.engine.trim(),
    plate: d.plate.trim().toUpperCase(),
    colour: d.colour.trim(),
    notes: d.notes.trim(),
    year: d.year === null ? null : Math.round(d.year),
    odometer_km: d.odometer_km === null ? null : Math.round(d.odometer_km),
  };
}

/** What's wrong or missing before a vehicle can be saved, or null */
export function vehicleProblem(clean: VehicleDraft): string | null {
  if (clean.vin) {
    const c = checkVin(clean.vin);
    if (!c.ok) return c.reason;
  }
  if (!clean.make && !clean.model && !clean.vin && !clean.plate) return "Add the plate, the VIN, or the make and model.";
  return null;
}

export function vinTakenMessage(err: string): string {
  return err.includes("vehicles_vin_key") ? "Another vehicle already has this VIN. Search for it instead of adding it again." : err;
}

/**
 * A vehicle's fields: plate, VIN (looked up to fill year, make, model, trim and engine), the
 * rest, with make and model suggestions. Controlled: pass the draft and its setter.
 */
export function VehicleFields({
  value: d,
  onChange: setD,
  odometerLabel = "Odometer (km)",
  showNotes = true,
}: {
  value: VehicleDraft;
  onChange: Dispatch<SetStateAction<VehicleDraft>>;
  odometerLabel?: string;
  showNotes?: boolean;
}) {
  const [vinText, setVinText] = useState(d.vin ?? "");
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [models, setModels] = useState<{ key: string; list: string[] } | null>(null);
  const ids = useId();
  const set = <K extends keyof VehicleDraft>(k: K, v: VehicleDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  const vin = normalizeVin(vinText);
  const vinCheck = vin ? checkVin(vin) : null;
  const vinHint = !vinCheck
    ? "17 characters, on the dashboard or driver's door frame."
    : !vinCheck.ok
      ? vinCheck.reason
      : vinCheck.checkDigitOk
        ? "VIN looks right."
        : "The check digit doesn't match. Fine for some imports; otherwise check for a typo.";

  // Look a complete VIN up once, and fill in only the fields that are still empty
  const lookupVin = vin && vinCheck?.ok ? vin : null;
  useEffect(() => {
    if (!lookupVin) return;
    const ctrl = new AbortController();
    decodeVin(lookupVin, ctrl.signal)
      .then((result) => {
        setLookup({ vin: lookupVin, result });
        if (!result) return;
        setD((x) => ({
          ...x,
          year: x.year ?? result.year,
          make: x.make.trim() ? x.make : result.make,
          model: x.model.trim() ? x.model : result.model,
          trim: x.trim.trim() ? x.trim : result.trim,
          engine: x.engine.trim() ? x.engine : result.engine,
        }));
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setLookup({ vin: lookupVin, result: "error" });
      });
    return () => ctrl.abort();
  }, [lookupVin, setD]);

  const current = lookup && lookup.vin === lookupVin ? lookup.result : undefined;
  const looking = lookupVin !== null && current === undefined;
  const found = current && current !== "error" ? current : null;
  const better = found ? differences(d, found) : {};

  // Model suggestions for the make and year, after a short pause in typing
  const make = d.make.trim();
  const modelKey = make && d.year ? `${make.toLowerCase()}|${d.year}` : null;
  useEffect(() => {
    if (!modelKey) return;
    const [m, y] = modelKey.split("|");
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      modelsFor(m, Number(y), ctrl.signal)
        .then((list) => setModels({ key: modelKey, list }))
        .catch(() => undefined);
    }, 400);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [modelKey]);
  const modelList = models && models.key === modelKey ? models.list : [];

  function onVin(text: string) {
    setVinText(text);
    set("vin", normalizeVin(text));
  }

  function onVinBlur() {
    setVinText(vin ?? "");
    // Fill the year from the VIN when it's blank (works even when the lookup can't be reached)
    if (vin && vinCheck?.ok && d.year === null) set("year", vinModelYear(vin));
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Field label="Licence plate" className="col-span-2 md:col-span-1">
          <Input value={d.plate} onChange={(e) => set("plate", e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" />
        </Field>
        <Field label="VIN" hint={vinHint} className="col-span-2 md:col-span-3">
          <Input
            value={vinText}
            onChange={(e) => onVin(e.target.value.toUpperCase())}
            onBlur={onVinBlur}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={20}
            className="font-mono tracking-wider"
          />
        </Field>
      </div>
      {looking ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Looking up the VIN…
        </p>
      ) : found ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-canvas px-3 py-2 text-sm">
          <span className="text-muted">Found:</span>
          <span className="font-medium text-ink">{lookupLabel(found)}</span>
          {Object.keys(better).length ? (
            <button type="button" onClick={() => setD((x) => ({ ...x, ...better }))} className="font-medium text-ink underline underline-offset-4">
              Use these
            </button>
          ) : null}
        </div>
      ) : current === null ? (
        <p className="text-sm text-muted">The VIN lookup doesn&apos;t know this one. Fill in the details by hand.</p>
      ) : current === "error" ? (
        <p className="text-sm text-muted">Couldn&apos;t reach the VIN lookup. Fill in the details by hand.</p>
      ) : null}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Field label="Year">
          <NumberInput value={d.year} onValue={(v) => set("year", v)} inputMode="numeric" min={1900} max={2100} step="1" />
        </Field>
        <Field label="Make">
          <Input value={d.make} onChange={(e) => set("make", e.target.value)} placeholder="Toyota" list={`${ids}-makes`} autoComplete="off" />
        </Field>
        <Field label="Model">
          <Input value={d.model} onChange={(e) => set("model", e.target.value)} placeholder="RAV4" list={`${ids}-models`} autoComplete="off" />
        </Field>
        <Field label="Trim">
          <Input value={d.trim} onChange={(e) => set("trim", e.target.value)} placeholder="XLE" />
        </Field>
        <Field label="Engine" hint="Filled from the VIN when it's known." className="col-span-2">
          <Input value={d.engine} onChange={(e) => set("engine", e.target.value)} placeholder="2.5L 4-cyl · AWD" />
        </Field>
        <Field label="Colour">
          <Input value={d.colour} onChange={(e) => set("colour", e.target.value)} />
        </Field>
        <Field label={odometerLabel}>
          <NumberInput value={d.odometer_km} onValue={(v) => set("odometer_km", v)} inputMode="numeric" min={0} step="1" />
        </Field>
        {showNotes ? (
          <Field label="Notes" className="col-span-2 md:col-span-4">
            <Textarea rows={2} value={d.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        ) : null}
      </div>
      <datalist id={`${ids}-makes`}>
        {MAKES.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <datalist id={`${ids}-models`}>
        {modelList.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
    </div>
  );
}

export function VehicleForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: VehicleDraft;
  submitLabel: string;
  onSubmit: (d: VehicleDraft) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [d, setD] = useState<VehicleDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = cleanVehicle(d);
    const problem = vehicleProblem(clean);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    const err = await onSubmit(clean);
    setBusy(false);
    if (err) setError(vinTakenMessage(err));
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <VehicleFields value={d} onChange={setD} />
      {error ? <Notice tone="bad">{error}</Notice> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
