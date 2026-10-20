"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Field, Input, Modal, Notice, NumberInput, Select } from "./ui";
import { money } from "@/lib/format";
import { APPROVAL_LABEL, QC_ITEMS, qcDone, todayLocal } from "@/lib/jobs";
import type { Totals } from "@/lib/totals";
import type { ApprovalMethod, Job } from "@/lib/types";

type Patch = Partial<Job>;

/**
 * The buttons that move a job along: approve, mark ready, invoice, record payment, and the
 * ways back. Each one hands its patch to `apply`, which saves it and reports any error.
 */
export function StatusActions({
  job,
  totals,
  apply,
  onPay,
  hstNumber,
}: {
  job: Job;
  totals: Totals;
  /** The shop's HST number from Settings; CRA wants it on invoices of $100 or more */
  hstNumber: string;
  apply: (patch: Patch, opts?: { vehicleOdometer?: number }) => Promise<string | null>;
  onPay: () => void;
}) {
  const [dialog, setDialog] = useState<null | "approve" | "invoice" | "reopen" | "decline" | "ready">(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [method, setMethod] = useState<ApprovalMethod>("signed");
  const [invoiceDate, setInvoiceDate] = useState(todayLocal());
  const [odoIn, setOdoIn] = useState<number | null>(job.odometer_in);
  const [odoOut, setOdoOut] = useState<number | null>(job.odometer_out);
  const [extraOk, setExtraOk] = useState(false);

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
          <Button
            variant="primary"
            onClick={() => (qcDone(job.qc) < QC_ITEMS.length ? setDialog("ready") : run({ status: "ready", work_finished_at: job.work_finished_at ?? now() }))}
            disabled={busy}
          >
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
          {error ? <div className="mb-3"><Notice tone="bad">{error}</Notice></div> : null}
          <div className="flex gap-2">
            <Button
              variant="primary"
              disabled={busy || (totals.overEstimate && !extraOk)}
              onClick={() => {
                if (odoIn !== null && odoOut !== null && odoOut < odoIn) return setError("Odometer out is lower than odometer in.");
                void run(
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
              }}
            >
              {busy ? "Creating…" : "Create invoice"}
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
    </div>
  );
}
