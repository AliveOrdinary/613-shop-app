"use client";

import { useState, type ReactNode } from "react";
import { SignOutButton } from "./SignOutButton";
import { ChangePassword } from "./ChangePassword";
import { Button, Card, Field, Input, Notice, NumberInput, PageTitle, Textarea, cx } from "./ui";
import { formatPhone, formatPostal, money } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { ShopSettings } from "@/lib/types";

type Draft = Omit<ShopSettings, "id" | "updated_at">;

function toDraft(s: ShopSettings): Draft {
  const { id: _id, updated_at: _u, ...rest } = s;
  void _id;
  void _u;
  // Postgres numerics arrive as strings; the form works in numbers.
  return {
    ...rest,
    rate_body: Number(rest.rate_body),
    rate_paint: Number(rest.rate_paint),
    rate_mechanical: Number(rest.rate_mechanical),
    paint_markup_pct: Number(rest.paint_markup_pct),
    shop_supplies_pct: Number(rest.shop_supplies_pct),
    shop_supplies_cap: rest.shop_supplies_cap === null ? null : Number(rest.shop_supplies_cap),
    hst_rate: Number(rest.hst_rate),
  };
}

function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <Card className="p-4 md:p-5">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {sub ? <p className="mb-4 mt-0.5 text-sm text-muted">{sub}</p> : <div className="mb-4" />}
      {children}
    </Card>
  );
}

function Rate({ label, value, onValue, suffix = "/ hr" }: { label: string; value: number; onValue: (n: number) => void; suffix?: string }) {
  return (
    <Field label={label}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
        <NumberInput value={value} onValue={(v) => onValue(v ?? 0)} min={0} step="0.01" className="w-full pl-7 pr-14" />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">{suffix}</span>
      </div>
    </Field>
  );
}

function Percent({ label, value, onValue, hint }: { label: string; value: number; onValue: (n: number) => void; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <NumberInput value={value} onValue={(v) => onValue(v ?? 0)} min={0} step="0.1" className="w-full pr-9" />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">%</span>
      </div>
    </Field>
  );
}

export function SettingsView({ initial, email }: { initial: ShopSettings; email: string | null }) {
  const [saved, setSaved] = useState<Draft>(() => toDraft(initial));
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setMessage(null);
  };

  async function save() {
    setBusy(true);
    setMessage(null);
    const clean: Draft = {
      ...draft,
      shop_name: draft.shop_name.trim() || "613 Automotive",
      phone: formatPhone(draft.phone),
      postal_code: formatPostal(draft.postal_code),
      hst_number: draft.hst_number.trim().toUpperCase(),
      next_job_number: Math.max(1, Math.round(draft.next_job_number)),
      estimate_valid_days: Math.min(365, Math.max(1, Math.round(draft.estimate_valid_days))),
    };
    const { error } = await supabaseBrowser().from("shop_settings").update(clean).eq("id", 1);
    setBusy(false);
    if (error) return setMessage({ tone: "bad", text: `Couldn't save: ${error.message}` });
    setSaved(clean);
    setDraft(clean);
    setMessage({ tone: "ok", text: "Settings saved" });
  }

  const hstLooksRight = draft.hst_number === "" || /^\d{9}\s?RT\s?\d{4}$/i.test(draft.hst_number.trim());

  return (
    <div className="pb-20">
      <PageTitle sub="These details print on every estimate, work order and invoice.">Shop settings</PageTitle>

      <div className="space-y-4">
        <Section title="Shop details">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Shop name" className="md:col-span-2">
              <Input value={draft.shop_name} onChange={(e) => set("shop_name", e.target.value)} />
            </Field>
            <Field label="Street address" className="md:col-span-2">
              <Input value={draft.address_line} onChange={(e) => set("address_line", e.target.value)} autoComplete="street-address" />
            </Field>
            <Field label="City">
              <Input value={draft.city} onChange={(e) => set("city", e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Province">
                <Input value={draft.province} onChange={(e) => set("province", e.target.value.toUpperCase())} maxLength={2} />
              </Field>
              <Field label="Postal code">
                <Input value={draft.postal_code} onChange={(e) => set("postal_code", e.target.value)} onBlur={(e) => set("postal_code", formatPostal(e.target.value))} />
              </Field>
            </div>
            <Field label="Phone">
              <Input type="tel" inputMode="tel" value={draft.phone} onChange={(e) => set("phone", e.target.value)} onBlur={(e) => set("phone", formatPhone(e.target.value))} />
            </Field>
            <Field label="Email">
              <Input type="email" inputMode="email" value={draft.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field
              label="HST number"
              hint={hstLooksRight ? "Printed on every invoice. Format: 123456789 RT0001." : "This doesn't look like an HST number (9 digits, RT, 4 digits)."}
              className="md:col-span-2"
            >
              <Input value={draft.hst_number} onChange={(e) => set("hst_number", e.target.value)} placeholder="123456789 RT0001" className={cx(!hstLooksRight && "border-warn")} />
            </Field>
          </div>
        </Section>

        <Section title="Labour rates" sub="Hourly, before tax. Each labour line on a job picks one of these.">
          <div className="grid gap-4 md:grid-cols-3">
            <Rate label="Body" value={draft.rate_body} onValue={(n) => set("rate_body", n)} />
            <Rate label="Paint" value={draft.rate_paint} onValue={(n) => set("rate_paint", n)} />
            <Rate label="Mechanical" value={draft.rate_mechanical} onValue={(n) => set("rate_mechanical", n)} />
          </div>
        </Section>

        <Section title="Paint and shop supplies">
          <div className="grid gap-4 md:grid-cols-2">
            <Percent
              label="Paint markup"
              value={draft.paint_markup_pct}
              onValue={(n) => set("paint_markup_pct", n)}
              hint="Added on top of what the paint for a job cost. 0% charges it at cost."
            />
          </div>
          <div className="mt-5 border-t border-line pt-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={draft.shop_supplies_enabled}
                onChange={(e) => set("shop_supplies_enabled", e.target.checked)}
                className="mt-0.5 h-5 w-5 accent-ink"
              />
              <span>
                <span className="block font-medium text-ink">Charge shop supplies</span>
                <span className="block text-sm text-muted">A percentage of labour, shown as its own line on invoices as Ontario requires.</span>
              </span>
            </label>
            {draft.shop_supplies_enabled ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Percent label="Shop supplies" value={draft.shop_supplies_pct} onValue={(n) => set("shop_supplies_pct", n)} hint="Of the labour total." />
                <Field label="Maximum per job (optional)" hint={draft.shop_supplies_cap ? `Never more than ${money(draft.shop_supplies_cap)}.` : "Leave blank for no maximum."}>
                  <NumberInput value={draft.shop_supplies_cap} onValue={(v) => set("shop_supplies_cap", v)} min={0} step="0.01" />
                </Field>
              </div>
            ) : null}
          </div>
        </Section>

        <Section title="Documents" sub="Wording and numbers used on estimates, work orders and invoices.">
          <div className="grid gap-4 md:grid-cols-3">
            <Percent label="HST rate" value={draft.hst_rate} onValue={(n) => set("hst_rate", n)} hint="13% in Ontario." />
            <Field label="Estimates valid for" hint="Days. Ontario requires an expiry date on estimates.">
              <NumberInput value={draft.estimate_valid_days} onValue={(v) => set("estimate_valid_days", v ?? 30)} min={1} max={365} step="1" inputMode="numeric" />
            </Field>
            <Field label="Next job number" hint={`The next job will be EST-${draft.next_job_number}.`}>
              <NumberInput value={draft.next_job_number} onValue={(v) => set("next_job_number", v ?? 200)} min={1} step="1" inputMode="numeric" />
            </Field>
            <Field label="Payment terms" className="md:col-span-3">
              <Input value={draft.payment_terms} onChange={(e) => set("payment_terms", e.target.value)} />
            </Field>
            <Field label="Warranty" hint="Ontario's minimum is 90 days or 5,000 km on parts and labour." className="md:col-span-3">
              <Textarea rows={4} value={draft.warranty_text} onChange={(e) => set("warranty_text", e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="Account">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">Signed in as {email ?? "staff"}</p>
              <SignOutButton />
            </div>
            <div className="border-t border-line pt-4">
              <ChangePassword email={email} />
            </div>
          </div>
        </Section>
      </div>

      {dirty || message ? (
      <div className="fixed inset-x-0 bottom-[calc(57px+env(safe-area-inset-bottom))] z-10 border-t border-line bg-surface/95 backdrop-blur md:bottom-0">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          {message ? <Notice tone={message.tone}>{message.text}</Notice> : <span className="text-sm text-muted">You have unsaved changes</span>}
          <div className="flex gap-2">
            {dirty ? (
              <Button variant="ghost" onClick={() => setDraft(saved)} disabled={busy}>
                Undo
              </Button>
            ) : null}
            <Button variant="primary" onClick={save} disabled={!dirty || busy}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </div>
      ) : null}
    </div>
  );
}
