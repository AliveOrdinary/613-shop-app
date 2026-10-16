"use client";

import { useState } from "react";
import { Button, Field, Input, Notice, Textarea, cx } from "./ui";
import { formatPhone, formatPostal } from "@/lib/format";
import type { CustomerDraft, CustomerKind } from "@/lib/types";

export function cleanCustomer(d: CustomerDraft): CustomerDraft {
  return {
    ...d,
    name: d.name.trim(),
    company: d.kind === "business" ? d.company.trim() : "",
    phone: formatPhone(d.phone),
    email: d.email.trim().toLowerCase(),
    address_line: d.address_line.trim(),
    city: d.city.trim(),
    province: d.province.trim().toUpperCase() || "ON",
    postal_code: formatPostal(d.postal_code),
    notes: d.notes.trim(),
  };
}

export function CustomerForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: CustomerDraft;
  submitLabel: string;
  onSubmit: (d: CustomerDraft) => Promise<string | null>;
  onCancel?: () => void;
}) {
  const [d, setD] = useState<CustomerDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof CustomerDraft>(k: K, v: CustomerDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = cleanCustomer(d);
    if (!clean.name) return setError("Enter the customer's name.");
    if (!clean.phone && !clean.email) return setError("Add a phone number or email so the shop can reach them.");
    setBusy(true);
    setError(null);
    const err = await onSubmit(clean);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="inline-flex rounded-lg border border-line bg-canvas p-1" role="radiogroup" aria-label="Customer type">
        {(["person", "business"] as CustomerKind[]).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={d.kind === k}
            onClick={() => set("kind", k)}
            className={cx("h-9 rounded-md px-4 text-sm font-medium", d.kind === k ? "bg-surface text-ink shadow-sm" : "text-muted")}
          >
            {k === "person" ? "Person" : "Business"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label={d.kind === "business" ? "Contact name" : "Name"}>
          <Input value={d.name} onChange={(e) => set("name", e.target.value)} autoComplete="off" autoFocus />
        </Field>
        {d.kind === "business" ? (
          <Field label="Business name">
            <Input value={d.company} onChange={(e) => set("company", e.target.value)} />
          </Field>
        ) : null}
        <Field label="Phone">
          <Input type="tel" inputMode="tel" value={d.phone} onChange={(e) => set("phone", e.target.value)} onBlur={(e) => set("phone", formatPhone(e.target.value))} />
        </Field>
        <Field label="Email">
          <Input type="email" inputMode="email" value={d.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Street address" className="md:col-span-2">
          <Input value={d.address_line} onChange={(e) => set("address_line", e.target.value)} />
        </Field>
        <Field label="City">
          <Input value={d.city} onChange={(e) => set("city", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Province">
            <Input value={d.province} onChange={(e) => set("province", e.target.value.toUpperCase())} maxLength={2} />
          </Field>
          <Field label="Postal code">
            <Input value={d.postal_code} onChange={(e) => set("postal_code", e.target.value)} onBlur={(e) => set("postal_code", formatPostal(e.target.value))} />
          </Field>
        </div>
        <Field label="Notes" className="md:col-span-2">
          <Textarea rows={2} value={d.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>

      {error ? <Notice tone="bad">{error}</Notice> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
