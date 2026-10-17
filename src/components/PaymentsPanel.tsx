"use client";

import { useState } from "react";
import { Button, Card, Field, Input, Modal, Notice, Select } from "./ui";
import { money } from "@/lib/format";
import { PAYMENT_LABEL, formatDate, todayLocal } from "@/lib/jobs";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Totals } from "@/lib/totals";
import type { Job, Payer, Payment, PaymentMethod } from "@/lib/types";

export const PAYER_LABEL: Record<Payer, string> = { customer: "Customer", insurer: "Insurer", other: "Other" };

/** What each party still owes on an insurance job, given the payments so far. */
export function owing(totals: Totals, payments: Payment[], isInsurance: boolean) {
  const paidBy = (p: Payer) => payments.filter((x) => x.payer === p).reduce((s, x) => s + Number(x.amount), 0);
  const balance = Math.max(0, Math.round((totals.total - payments.reduce((s, x) => s + Number(x.amount), 0)) * 100) / 100);
  if (!isInsurance) return { balance, customer: balance, insurer: 0 };
  const r = (n: number) => Math.max(0, Math.round(n * 100) / 100);
  return { balance, customer: r(totals.customerPays - paidBy("customer")), insurer: r(totals.insurerPays - paidBy("insurer") - paidBy("other")) };
}

export function PaymentsPanel({
  job,
  totals,
  payments,
  open,
  onOpen,
  onChanged,
}: {
  job: Job;
  totals: Totals;
  payments: Payment[];
  open: boolean;
  onOpen: (open: boolean) => void;
  onChanged: () => Promise<void>;
}) {
  const sb = supabaseBrowser();
  const left = owing(totals, payments, job.is_insurance);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Payment | null>(null);

  async function remove(p: Payment) {
    setBusy(true);
    const { error } = await sb.from("payments").delete().eq("id", p.id);
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    await onChanged();
    setBusy(false);
    setRemoving(null);
  }

  const canRecord = job.status === "invoiced";
  if (payments.length === 0 && !canRecord) return null;

  return (
    <Card className="mt-3 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="font-semibold text-ink">Payments</h2>
        {canRecord ? (
          <Button size="sm" onClick={() => onOpen(true)}>
            Record payment
          </Button>
        ) : null}
      </div>
      {payments.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted">No payments yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {payments.map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0 text-sm">
                <p className="font-medium text-ink">
                  {PAYER_LABEL[p.payer]} · {PAYMENT_LABEL[p.method]}
                </p>
                <p className="truncate text-muted">{[formatDate(p.paid_on), p.reference].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <span className="tabular font-medium text-ink">{money(Number(p.amount))}</span>
                <button onClick={() => setRemoving(p)} className="text-xs text-bad hover:underline">
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-1 border-t border-line bg-canvas/60 px-4 py-3 text-sm">
        {job.is_insurance && left.balance > 0 ? (
          <>
            <div className="flex justify-between">
              <span className="text-charcoal">Customer owes</span>
              <span className="tabular text-ink">{money(left.customer)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-charcoal">Insurer owes</span>
              <span className="tabular text-ink">{money(left.insurer)}</span>
            </div>
          </>
        ) : null}
        <div className="flex justify-between font-semibold">
          <span className="text-ink">Balance</span>
          <span className={left.balance > 0 ? "tabular text-bad" : "tabular text-ok"}>{left.balance > 0 ? money(left.balance) : "Paid in full"}</span>
        </div>
      </div>
      {error ? (
        <div className="px-4 pb-3">
          <Notice tone="bad">{error}</Notice>
        </div>
      ) : null}

      {open ? <RecordPayment job={job} left={left} onClose={() => onOpen(false)} onSaved={onChanged} /> : null}

      {removing ? (
        <Modal title="Remove payment" onClose={() => setRemoving(null)}>
          <p className="mb-5 text-sm text-muted">
            Remove the {money(Number(removing.amount))} {PAYMENT_LABEL[removing.method].toLowerCase()} payment from {PAYER_LABEL[removing.payer].toLowerCase()} on {formatDate(removing.paid_on)}? Use this to fix a mistake.
          </p>
          <div className="flex gap-2">
            <Button variant="danger" onClick={() => remove(removing)} disabled={busy}>
              {busy ? "Removing…" : "Remove payment"}
            </Button>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Keep it
            </Button>
          </div>
        </Modal>
      ) : null}
    </Card>
  );
}

/** Mounted fresh each time it opens, so its defaults come from what's owing right now. */
function RecordPayment({
  job,
  left,
  onClose,
  onSaved,
}: {
  job: Job;
  left: { balance: number; customer: number; insurer: number };
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const suggested = (p: Payer) => (p === "customer" ? left.customer : p === "insurer" ? left.insurer : left.balance);
  const first: Payer = job.is_insurance && left.customer === 0 && left.insurer > 0 ? "insurer" : "customer";
  const [payer, setPayer] = useState<Payer>(first);
  const [method, setMethod] = useState<PaymentMethod>(first === "insurer" ? "cheque" : "debit");
  const [amount, setAmount] = useState(suggested(first).toFixed(2));
  const [paidOn, setPaidOn] = useState(todayLocal());
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickPayer(p: Payer) {
    setPayer(p);
    setMethod(p === "insurer" ? "cheque" : "debit");
    setAmount(suggested(p).toFixed(2));
  }

  async function save() {
    const n = Math.round(Number(amount) * 100) / 100;
    if (!(n > 0)) return setError("Enter the amount paid.");
    if (n > left.balance + 0.005) return setError(`That's more than the ${money(left.balance)} still owing.`);
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser()
      .from("payments")
      .insert({ job_id: job.id, amount: n, payer, method, paid_on: paidOn, reference: reference.trim() });
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    await onSaved();
    onClose();
  }

  return (
    <Modal title="Record payment" onClose={onClose}>
      <div className="grid gap-3">
        {job.is_insurance ? (
          <div>
            <p className="mb-1 text-[13px] font-medium text-muted">Paid by</p>
            <div className="grid grid-cols-2 gap-2">
              {(["customer", "insurer"] as Payer[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => pickPayer(p)}
                  className={`rounded-lg border px-3 py-2.5 text-left ${payer === p ? "border-ink bg-ink text-white" : "border-line text-ink"}`}
                >
                  <span className="block font-medium">{PAYER_LABEL[p]}</span>
                  <span className={`tabular block text-sm ${payer === p ? "text-brand" : "text-muted"}`}>owes {money(suggested(p))}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount ($)">
            <Input type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} onFocus={(e) => e.target.select()} className="tabular" />
          </Field>
          <Field label="Method">
            <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_LABEL[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date paid">
            <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} max={todayLocal()} />
          </Field>
          <Field label="Reference">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={40} placeholder="Optional" />
          </Field>
        </div>
        <p className="text-xs text-muted">Reference: last 4 digits, e-transfer or cheque number. Never a full card number.</p>
      </div>
      {error ? (
        <div className="mt-3">
          <Notice tone="bad">{error}</Notice>
        </div>
      ) : null}
      <div className="mt-5 flex gap-2">
        <Button variant="primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : `Record ${money(Number(amount) || 0)}`}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
