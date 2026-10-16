"use client";

import { useState } from "react";
import { Button, Field, Input, Notice, NumberInput, Textarea } from "./ui";
import { checkVin, normalizeVin, vinModelYear } from "@/lib/vin";
import type { VehicleDraft } from "@/lib/types";

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
  const [vinText, setVinText] = useState(initial.vin ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  function onVinBlur() {
    setVinText(vin ?? "");
    // Fill the year from the VIN when it's blank
    if (vin && vinCheck?.ok && d.year === null) set("year", vinModelYear(vin));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (vin && vinCheck && !vinCheck.ok) return setError(vinCheck.reason);
    const clean: VehicleDraft = {
      ...d,
      vin,
      make: d.make.trim(),
      model: d.model.trim(),
      trim: d.trim.trim(),
      plate: d.plate.trim().toUpperCase(),
      colour: d.colour.trim(),
      notes: d.notes.trim(),
      year: d.year === null ? null : Math.round(d.year),
      odometer_km: d.odometer_km === null ? null : Math.round(d.odometer_km),
    };
    if (!clean.make && !clean.model && !clean.vin && !clean.plate) return setError("Add at least the make and model, a plate or a VIN.");
    setBusy(true);
    setError(null);
    const err = await onSubmit(clean);
    setBusy(false);
    if (err) setError(err.includes("vehicles_vin_key") ? "Another vehicle already has this VIN. Search for it under Customers." : err);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="VIN" hint={vinHint}>
        <Input
          value={vinText}
          onChange={(e) => setVinText(e.target.value.toUpperCase())}
          onBlur={onVinBlur}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={20}
          className="font-mono tracking-wider"
        />
      </Field>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Field label="Year">
          <NumberInput value={d.year} onValue={(v) => set("year", v)} inputMode="numeric" min={1900} max={2100} step="1" />
        </Field>
        <Field label="Make">
          <Input value={d.make} onChange={(e) => set("make", e.target.value)} placeholder="Toyota" />
        </Field>
        <Field label="Model">
          <Input value={d.model} onChange={(e) => set("model", e.target.value)} placeholder="RAV4" />
        </Field>
        <Field label="Trim">
          <Input value={d.trim} onChange={(e) => set("trim", e.target.value)} placeholder="XLE" />
        </Field>
        <Field label="Licence plate">
          <Input value={d.plate} onChange={(e) => set("plate", e.target.value.toUpperCase())} autoCapitalize="characters" />
        </Field>
        <Field label="Colour">
          <Input value={d.colour} onChange={(e) => set("colour", e.target.value)} />
        </Field>
        <Field label="Odometer (km)" className="col-span-2">
          <NumberInput value={d.odometer_km} onValue={(v) => set("odometer_km", v)} inputMode="numeric" min={0} step="1" />
        </Field>
        <Field label="Notes" className="col-span-2 md:col-span-4">
          <Textarea rows={2} value={d.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>
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
