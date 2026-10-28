"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Field, Input, Modal, Notice, NumberInput, Select } from "./ui";
import { money } from "@/lib/format";
import { APPROVAL_LABEL, PAYMENT_LABEL, QC_ITEMS, qcDone, todayLocal } from "@/lib/jobs";
import type { Totals } from "@/lib/totals";
import type { ApprovalMethod, Job, PaymentMethod } from "@/lib/types";

type Patch = Partial<Job>;

/**
 * The buttons that move a job along: approve, mark ready, invoice, record payment, and the
 * ways back. Each one hands its patch to `apply`, which saves it and reports any error.
 * With `primaryOnly`, just the next step, short enough for the phone's bottom bar.
 */
export function StatusActions({
  job,
  totals,
  apply,
  onPay,
  hstNumber,
  customerOwes,
  payNow,
  primaryOnly = false,
}: {
  job: Job;
  totals: Totals;
  /** The shop's HST number from Settings; CRA wants it on invoices of $100 or more */
  hstNumber: string;
  apply: (patch: Patch, opts?: { vehicleOdometer?: number }) => Promise<string | null>;
  onPay: () => void;
  /** What the customer owes once invoiced (their share on insurance jobs), for "Paid now" */
  customerOwes: number;
  payNow: (p: { amount: number; method: PaymentMethod; reference: string; paid_on: string }) => Promise<string | null>;
  primaryOnly?: boolean;
}) {
  const [dialog, setDialog] = useState<null | "approve" | "invoice" | "reopen" | "decline" | "ready">(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [method, setMethod] = useState<ApprovalMethod>("signed");
  const [invoiceDate, setInvoiceDate] = useState(todayLocal());
  const [odoIn, setOdoIn] = useState<number | null>(job.odometer_in);
  const [odoOut, setOdoOut] = useState<number | null>(job.odometer_out);
  const [extraOk, setExtraOk] = useState(false);
  const [paidNow, setPaidNow] = useState(false);
  const [payMethod, setPayMethod] = useState<PaymentMethod>("debit");
  const [payRef, setPayRef] = useState("");

  async function run(patch: Patch, opts?: { vehicleOdometer?: number }) {
    setBusy(true);
    setError(null);
    const err = await apply(patch, opts);
    setBusy(false);
    if (err) return setError(err);
    setDialog(null);
  }

  const close = () => {
    setDialog(null);
    setError(null);
  };
  const now = () => new Date().toISOString();
  const s = job.status;
  const markReady = () => (qcDone(job.qc) < QC_ITEMS.length ? setDialog("ready") : run({ status: "ready", work_finished_at: job.work_finished_at ?? now() }));

  async function invoice() {
    if (odoIn !== null && odoOut !== null && odoOut < odoIn) return setError("Odometer out is lower than odometer in.");
    const paying = paidNow && customerOwes > 0;
    setBusy(true);
    setError(null);
    const err = await apply(
      {
        status: "invoiced",
        odometer_in: odoIn,
        odometer_out: odoOut,
        invoice_date: invoiceDate,
        invoiced_at: now(),
        invoice_totals: { ...totals, overEstimate: false },
        ...(totals.overEstimate ? { approved_total: totals.total } : {}),
      },
      // The vehicle keeps the latest reading there is, for its next job
      { vehicleOdometer: odoOut ?? odoIn ?? undefined },
    );
    if (err) {
      setBusy(false);
      return setError(err);
    }
    const payErr = paying ? await payNow({ amount: customerOwes, method: payMethod, reference: payRef.trim(), paid_on: invoiceDate }) : null;
    setBusy(false);
    setDialog(null);
    if (payErr) setError(`INV-${job.number} was created, but the payment wasn't recorded: ${payErr} Use Record payment.`);
  }

  if (primaryOnly) {
    const primary =
      s === "estimate"
        ? { label: "Approve", onClick: () => setDialog("approve"), disabled: totals.total <= 0 }
        : s === "approved"
          ? { label: "Mark ready", onClick: markReady, disabled: busy }
          : s === "ready"
            ? { label: "Invoice", onClick: () => setDialog("invoice"), disabled: false }
            : s === "invoiced"
              ? { label: "Record payment", onClick: onPay, disabled: false }
              : null;
    if (!primary) return null;
    return (
      <>
        <Button variant="primary" onClick={primary.onClick} disabled={primary.disabled} className="shrink-0">
          {primary.label}
        </Button>
        {error && !dialog ? (
          <Modal title="Couldn't update the job" onClose={() => setError(null)}>
            <Notice tone="bad">{error}</Notice>
            <div className="mt-5">
              <Button onClick={() => setError(null)}>OK</Button>
            </div>
          </Modal>
        ) : null}
        {dialogs()}
      </>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {s === "estimate" ? (
        <>
          <Button variant="primary" onClick={() => setDialog("approve")} disabled={totals.total <= 0}>
            Approve estimate
          </Button>
          <Button onClick={() => setDialog("decline")}>Declined</Button>
        </>
      ) : null}
      {s === "declined" ? <Button onClick={() => run({ status: "estimate", declined_at: null })}>Back to estimate</Button> : null}
      {s === "approved" ? (
        <>
          <Button variant="primary" onClick={markReady} disabled={busy}>
            Mark ready for pickup
          </Button>
          <Button variant="ghost" onClick={() => run({ status: "estimate", approved_at: null, approval_method: null, approved_total: null })} disabled={busy}>
            Back to estimate
          </Button>
        </>
      ) : null}
      {s === "ready" ? (
        <>
          <Button variant="primary" onClick={() => setDialog("invoice")}>
            Create invoice
          </Button>
          <Button variant="ghost" onClick={() => run({ status: "approved" })} disabled={busy}>
            Back to work order
          </Button>
        </>
      ) : null}
      {s === "invoiced" ? (
        <Button variant="primary" onClick={onPay}>
          Record payment
        </Button>
      ) : null}
      {s === "invoiced" || s === "paid" ? (
        <Button variant="ghost" onClick={() => setDialog("reopen")}>
          Reopen for correction
        </Button>
      ) : null}
      {error && !dialog ? <div className="w-full"><Notice tone="bad">{error}</Notice></div> : null}
      {dialogs()}
    </div>
  );

  function dialogs() {
    return (
      <>
      {dialog === "approve" ? (
        <Modal title="Approve estimate" onClose={close}>
          <p className="mb-4 text-sm text-muted">
            The customer agrees to {money(totals.total)}. Ontario requires a written record of how they approved it. The final bill can be up to 10% more without asking again.
          </p>
          <Field label="How did they approve it?">
            <Select value={method} onChange={(e) => setMethod(e.target.value as ApprovalMethod)}>
              {(Object.keys(APPROVAL_LABEL) as ApprovalMethod[]).map((m) => (
                <option key={m} value={m}>{APPROVAL_LABEL[m]}</option>
              ))}
            </Select>
          </Field>
          {error ? <div className="mt-3"><Notice tone="bad">{error}</Notice></div> : null}
          <div className="mt-5 flex gap-2">
            <Button variant="primary" disabled={busy} onClick={() => run({ status: "approved", approval_method: method, approved_at: now(), approved_total: totals.total })}>
              {busy ? "Saving…" : "Approve — create work order"}
            </Button>
            <Button variant="ghost" onClick={close}>Cancel</Button>
          </div>
        </Modal>
      ) : null}

      {dialog === "ready" ? (
        <Modal title="Quality check isn't finished" onClose={close}>
          <p className="mb-2 text-sm text-muted">
            {qcDone(job.qc)} of {QC_ITEMS.length} quality checks are ticked. Not done yet:
          </p>
          <ul className="mb-5 list-disc pl-5 text-sm text-ink">
            {QC_ITEMS.filter((i) => !job.qc?.[i.key]).map((i) => (
              <li key={i.key}>{i.label}</li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button variant="primary" onClick={close}>
              Finish the check
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => run({ status: "ready", work_finished_at: job.work_finished_at ?? now() })}>
              Mark ready anyway
            </Button>
          </div>
        </Modal>
      ) : null}

      {dialog === "decline" ? (
        <Modal title="Estimate declined" onClose={close}>
          <p className="mb-5 text-sm text-muted">The estimate stays on file under EST-{job.number}. You can bring it back later.</p>
          <div className="flex gap-2">
            <Button variant="primary" disabled={busy} onClick={() => run({ status: "declined", declined_at: now() })}>Mark declined</Button>
            <Button variant="ghost" onClick={close}>Cancel</Button>
          </div>
        </Modal>
      ) : null}

      {dialog === "invoice" ? (
        <Modal title={`Create INV-${job.number}`} onClose={close}>
          <p className="mb-4 text-sm text-muted">
            The invoice locks the lines and totals so the printed copy always matches. You can reopen it for a correction later.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Odometer in (km)">
              <NumberInput value={odoIn} onValue={setOdoIn} inputMode="numeric" min={0} step="1" />
            </Field>
            <Field label="Odometer out (km)">
              <NumberInput value={odoOut} onValue={setOdoOut} inputMode="numeric" min={0} step="1" />
            </Field>
            <Field label="Invoice date" className="col-span-2">
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </Field>
          </div>
          {odoIn === null || odoOut === null ? (
            <div className="mt-3">
              <Notice tone="warn">
                {odoIn === null && odoOut === null ? "Both odometer readings are" : odoIn === null ? "Odometer in is" : "Odometer out is"} blank. Ontario expects both on the invoice; a blank prints as a line to fill in by hand.
              </Notice>
            </div>
          ) : null}
          <div className="my-4 flex items-baseline justify-between rounded-lg bg-canvas px-3 py-2.5">
            <span className="text-charcoal">Invoice total</span>
            <span className="display tabular text-xl text-ink">{money(totals.total)}</span>
          </div>
          {totals.total >= 100 && !hstNumber.trim() ? (
            <div className="mb-3">
              <Notice tone="warn">
                The shop&apos;s HST number isn&apos;t set, so it won&apos;t print on this invoice. CRA requires it on invoices of $100 or more.{" "}
                <Link href="/settings" className="font-medium underline underline-offset-2">
                  Add it in Settings
                </Link>
              </Notice>
            </div>
          ) : null}
          {totals.overEstimate ? (
            <label className="mb-3 flex cursor-pointer items-start gap-3 rounded-lg bg-warn-soft px-3 py-2.5 text-sm text-warn">
              <input type="checkbox" checked={extraOk} onChange={(e) => setExtraOk(e.target.checked)} className="mt-0.5 h-5 w-5 accent-ink" />
              <span>
                This is more than 10% over the approved estimate of {money(job.approved_total ?? 0)}. Tick to confirm the customer approved the new total.
              </span>
            </label>
          ) : null}
          {customerOwes > 0 ? (
            <div className="mb-3 rounded-lg border border-line px-3 py-2.5">
              <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" checked={paidNow} onChange={(e) => setPaidNow(e.target.checked)} className="mt-0.5 h-5 w-5 accent-ink" />
                <span>
                  <span className="block font-medium text-ink">
                    {job.is_insurance ? `Customer paid their share now (${money(customerOwes)})` : `Paid in full now (${money(customerOwes)})`}
                  </span>
                  <span className="block text-sm text-muted">
                    {job.is_insurance ? "Record the insurer's payment when it arrives." : "For part payments, use Record payment after."}
                  </span>
                </span>
              </label>
              {paidNow ? (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Field label="Method">
                    <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}>
                      {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
                        <option key={m} value={m}>{PAYMENT_LABEL[m]}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Reference">
                    <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} maxLength={40} placeholder="Optional" />
                  </Field>
                  <p className="col-span-2 text-xs text-muted">Reference: last 4 digits, e-transfer or cheque number. Never a full card number.</p>
                </div>
              ) : null}
            </div>
          ) : null}
          {error ? <div className="mb-3"><Notice tone="bad">{error}</Notice></div> : null}
          <div className="flex gap-2">
            <Button variant="primary" disabled={busy || (totals.overEstimate && !extraOk)} onClick={() => void invoice()}>
              {busy ? "Creating…" : paidNow && customerOwes > 0 ? `Invoice and record ${money(customerOwes)}` : "Create invoice"}
            </Button>
            <Button variant="ghost" onClick={close}>Cancel</Button>
          </div>
        </Modal>
      ) : null}

      {dialog === "reopen" ? (
        <Modal title="Reopen for correction" onClose={close}>
          <p className="mb-5 text-sm text-muted">
            INV-{job.number} goes back to Ready so you can fix lines or amounts, then invoice it again under the same number. Payments already recorded stay on the job. If the customer already has a printed copy, give them the corrected one.
          </p>
          <div className="flex gap-2">
            <Button variant="primary" disabled={busy} onClick={() => run({ status: "ready" })}>Reopen</Button>
            <Button variant="ghost" onClick={close}>Cancel</Button>
          </div>
        </Modal>
      ) : null}
      </>
    );
  }
}
