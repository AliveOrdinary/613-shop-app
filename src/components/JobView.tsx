"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { LinesEditor, type Rates } from "./LinesEditor";
import { PaymentsPanel } from "./PaymentsPanel";
import { StatusActions } from "./StatusActions";
import { TotalsPanel } from "./TotalsPanel";
import { Badge, Button, Card, ChipToggles, Modal, Field, Input, Notice, NumberInput, Textarea, cx } from "./ui";
import { money, vehicleLabel } from "@/lib/format";
import { APPROVAL_LABEL, INTAKE_BODY, INTAKE_LIGHTS, INTAKE_MECHANICAL, PAYMENT_LABEL, STATUS_LABEL, STATUS_TONE, formatDate, isLocked, jobNumber } from "@/lib/jobs";
import { supabaseBrowser } from "@/lib/supabase/client";
import { jobTotals } from "@/lib/totals";
import { useAutosave } from "@/lib/useAutosave";
import type { Intake, Job, JobFull, JobLine, Payment } from "@/lib/types";
import { useRouter } from "next/navigation";

function Section({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cx("overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="font-semibold text-ink">{title}</h2>
        {aside}
      </div>
      {children}
    </Card>
  );
}

/** <input type="datetime-local"> wants local "YYYY-MM-DDTHH:mm" */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STEPS: Job["status"][] = ["estimate", "approved", "ready", "invoiced", "paid"];

export function JobView({ initial, rates }: { initial: JobFull; rates: Rates }) {
  const { customer, vehicle, job_lines: initialLines, payments: initialPayments, ...initialJob } = initial;
  const router = useRouter();
  const [payments, setPayments] = useState<Payment[]>(initialPayments ?? []);
  const [payOpen, setPayOpen] = useState(false);
  const [deleting, setDeleting] = useState<"ask" | "busy" | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [job, setJob] = useState<Job>(initialJob);
  const [lines, setLines] = useState<JobLine[]>(initialLines);
  const save = useAutosave("jobs", job.id);
  const locked = isLocked(job.status);
  const sb = supabaseBrowser();

  const set = <K extends keyof Job>(k: K, v: Job[K]) => {
    setJob((j) => ({ ...j, [k]: v }));
    save.queue({ [k]: v });
  };
  const setIntake = (patch: Partial<Intake>) => {
    const next = { ...job.intake, ...patch };
    set("intake", next);
  };

  const live = useMemo(() => jobTotals(job, lines), [job, lines]);
  // An invoice shows its frozen totals; payments still update the balance.
  const totals = useMemo(() => {
    if (!locked || !job.invoice_totals) return live;
    const paid = Number(job.amount_paid) || 0;
    return { ...job.invoice_totals, amountPaid: paid, balance: Math.round((job.invoice_totals.total - paid) * 100) / 100 };
  }, [locked, job.invoice_totals, job.amount_paid, live]);

  /** After a payment is added or removed: the database works out the job's paid status. */
  async function reloadPayments() {
    const [{ data: j }, { data: ps }] = await Promise.all([
      sb.from("jobs").select("*").eq("id", job.id).single<Job>(),
      sb.from("payments").select("*").eq("job_id", job.id).order("paid_on").returns<Payment[]>(),
    ]);
    if (j) setJob(j);
    if (ps) setPayments(ps);
  }

  async function deleteJob() {
    setDeleting("busy");
    setDeleteError(null);
    await save.flush();
    const { error } = await sb.from("jobs").delete().eq("id", job.id);
    if (error) {
      setDeleting("ask");
      return setDeleteError(error.code === "23503" ? "This job has payments recorded, so it can't be deleted." : error.message);
    }
    router.replace("/jobs");
    router.refresh();
  }

  async function apply(patch: Partial<Job>, opts?: { vehicleOdometer?: number }): Promise<string | null> {
    if (!(await save.flush())) return save.error ?? "Couldn't save your last changes.";
    const { data, error } = await sb.from("jobs").update(patch).eq("id", job.id).select("*").single<Job>();
    if (error || !data) return error?.message ?? "Couldn't update the job.";
    setJob(data);
    if (opts?.vehicleOdometer !== undefined) {
      await sb.from("vehicles").update({ odometer_km: opts.vehicleOdometer }).eq("id", vehicle.id);
    }
    return null;
  }

  const intake = job.intake ?? {};
  const stepIndex = STEPS.indexOf(job.status);

  return (
    <div className="pb-20 lg:pb-6">
      <Link href="/jobs" className="mb-2 inline-block text-sm text-muted hover:text-ink">
        ← Jobs
      </Link>

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="display tabular text-[30px] leading-none text-ink">{jobNumber(job)}</h1>
            <Badge tone={STATUS_TONE[job.status]}>{job.status === "invoiced" && Number(job.amount_paid) > 0 ? "Part paid" : STATUS_LABEL[job.status]}</Badge>
            {job.is_insurance ? <Badge>Insurance</Badge> : null}
          </div>
          <p className="mt-1.5 text-sm text-muted">
            {job.status === "declined"
              ? `Declined ${formatDate(job.declined_at)}`
              : locked && job.invoice_date
                ? `Invoiced ${formatDate(job.invoice_date)}`
                : `Estimate ${formatDate(job.estimate_date)}`}
            {job.approved_at && job.approval_method ? ` · Approved ${formatDate(job.approved_at)} (${APPROVAL_LABEL[job.approval_method].toLowerCase()})` : ""}
            {job.paid_at && job.payment_method ? ` · Paid ${formatDate(job.paid_at)} by ${PAYMENT_LABEL[job.payment_method].toLowerCase()}` : ""}
          </p>
        </div>
        <span className="pt-1 text-xs text-muted" aria-live="polite">
          {save.state === "saving" ? "Saving…" : save.state === "saved" ? "All changes saved" : save.state === "error" ? <span className="text-bad">Not saved: {save.error}</span> : ""}
        </span>
      </div>

      {/* Progress */}
      {job.status !== "declined" ? (
        <ol className="mb-5 grid grid-cols-5 gap-1.5" aria-label="Job progress">
          {STEPS.map((s, i) => (
            <li key={s} className="min-w-0">
              <div className={cx("h-1.5 rounded-full", i <= stepIndex ? "bg-brand" : "bg-line")} />
              <p className={cx("mt-1 truncate text-[11px] font-medium", i === stepIndex ? "text-ink" : "text-faint")}>{STATUS_LABEL[s]}</p>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="mb-6">
        <StatusActions job={job} totals={live} apply={apply} onPay={() => setPayOpen(true)} />
      </div>

      {locked ? (
        <div className="mb-4">
          <Notice tone="neutral">Lines and amounts are locked on an invoice. Reopen it for correction to change them; notes and work details can still be edited.</Notice>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          {/* Customer and vehicle */}
          <Card className="grid gap-4 p-4 sm:grid-cols-2">
            <Link href={`/customers/${customer.id}`} className="min-w-0 rounded-lg hover:bg-canvas">
              <p className="text-[13px] text-muted">Customer</p>
              <p className="truncate font-medium text-ink">{customer.name}</p>
              <p className="truncate text-sm text-muted">{[customer.phone, customer.email].filter(Boolean).join(" · ")}</p>
            </Link>
            <div className="min-w-0">
              <p className="text-[13px] text-muted">Vehicle</p>
              <p className="display truncate text-ink">{vehicleLabel(vehicle)}</p>
              <p className="truncate text-sm text-muted">{[vehicle.plate, vehicle.colour].filter(Boolean).join(" · ")}</p>
              {vehicle.vin ? <p className="truncate font-mono text-xs tracking-wider text-charcoal">{vehicle.vin}</p> : <p className="text-xs text-warn">No VIN yet. Ontario requires it on estimates and invoices.</p>}
            </div>
          </Card>

          <Section title="Customer's concern">
            <div className="space-y-4 p-4">
              <Field label="What the customer wants done" hint="Printed on the estimate and work order.">
                <Textarea rows={3} value={job.concern} onChange={(e) => set("concern", e.target.value)} disabled={locked} placeholder="Rear bumper scuffed in parking lot; replace textured trim and refinish." />
              </Field>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <Field label="Estimate date">
                  <Input type="date" value={job.estimate_date} onChange={(e) => set("estimate_date", e.target.value)} disabled={locked} />
                </Field>
                <Field label="Valid until">
                  <Input type="date" value={job.valid_until ?? ""} onChange={(e) => set("valid_until", e.target.value || null)} disabled={locked} />
                </Field>
                <Field label="Expected completion" className="col-span-2 md:col-span-1">
                  <Input type="date" value={job.expected_completion ?? ""} onChange={(e) => set("expected_completion", e.target.value || null)} />
                </Field>
              </div>
            </div>
          </Section>

          <Section
            title="Line items"
            aside={<span className="tabular text-sm text-muted">{lines.length} {lines.length === 1 ? "line" : "lines"}</span>}
          >
            <LinesEditor jobId={job.id} lines={lines} setLines={setLines} rates={rates} locked={locked} />
          </Section>

          <Section title="Insurance">
            <div className="space-y-4 p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" checked={job.is_insurance} onChange={(e) => set("is_insurance", e.target.checked)} disabled={locked} className="mt-0.5 h-5 w-5 accent-ink" />
                <span>
                  <span className="block font-medium text-ink">Insurance claim</span>
                  <span className="block text-sm text-muted">The invoice shows the insurer&apos;s share and the customer&apos;s deductible separately.</span>
                </span>
              </label>
              {job.is_insurance ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Insurer">
                    <Input value={job.insurer} onChange={(e) => set("insurer", e.target.value)} />
                  </Field>
                  <Field label="Claim number">
                    <Input value={job.claim_number} onChange={(e) => set("claim_number", e.target.value)} />
                  </Field>
                  <Field label="Deductible ($)">
                    <NumberInput value={Number(job.deductible) || null} onValue={(v) => set("deductible", v ?? 0)} min={0} step="0.01" disabled={locked} />
                  </Field>
                  <Field label="Insurer pays ($)" hint={job.insurer_pays === null ? `Leave blank: total minus deductible (${money(live.insurerPays)}).` : "Customer pays the rest."}>
                    <NumberInput value={job.insurer_pays === null ? null : Number(job.insurer_pays)} onValue={(v) => set("insurer_pays", v)} min={0} step="0.01" disabled={locked} />
                  </Field>
                </div>
              ) : null}
            </div>
          </Section>

          <Section title="Vehicle at drop-off">
            <div className="space-y-5 p-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Odometer in (km)">
                  <NumberInput value={job.odometer_in} onValue={(v) => set("odometer_in", v === null ? null : Math.round(v))} inputMode="numeric" min={0} step="1" disabled={locked} />
                </Field>
                <Field label="Odometer out (km)">
                  <NumberInput value={job.odometer_out} onValue={(v) => set("odometer_out", v === null ? null : Math.round(v))} inputMode="numeric" min={0} step="1" disabled={locked} />
                </Field>
              </div>
              <div>
                <p className="mb-2 text-[13px] font-medium text-muted">Exterior and body</p>
                <ChipToggles options={INTAKE_BODY} value={intake.body ?? []} onChange={(v) => setIntake({ body: v })} />
                <Input className="mt-2" value={intake.body_other ?? ""} onChange={(e) => setIntake({ body_other: e.target.value })} placeholder="Other, or where the damage is" aria-label="Other body condition" />
              </div>
              <div>
                <p className="mb-2 text-[13px] font-medium text-muted">Mechanical concerns</p>
                <ChipToggles options={INTAKE_MECHANICAL} value={intake.mechanical ?? []} onChange={(v) => setIntake({ mechanical: v })} />
                <Input className="mt-2" value={intake.mechanical_other ?? ""} onChange={(e) => setIntake({ mechanical_other: e.target.value })} placeholder="Other" aria-label="Other mechanical concern" />
              </div>
              <div>
                <p className="mb-2 text-[13px] font-medium text-muted">Warning lights on</p>
                <ChipToggles
                  options={INTAKE_LIGHTS}
                  value={intake.lights ?? []}
                  onChange={(v) => {
                    // "None" and a light can't both be ticked
                    const added = v.find((x) => !(intake.lights ?? []).includes(x));
                    setIntake({ lights: added === "None" ? ["None"] : v.filter((x) => x !== "None") });
                  }}
                />
                <Input className="mt-2" value={intake.lights_other ?? ""} onChange={(e) => setIntake({ lights_other: e.target.value })} placeholder="Other light" aria-label="Other warning light" />
              </div>
              <Field label="Belongings and pre-existing damage notes">
                <Textarea rows={2} value={job.belongings} onChange={(e) => set("belongings", e.target.value)} placeholder="Child seat in rear; crack in windshield, driver side" />
              </Field>
            </div>
          </Section>

          <Section title="Work">
            <div className="grid grid-cols-2 gap-3 p-4">
              <Field label="Technician">
                <Input value={job.technician} onChange={(e) => set("technician", e.target.value)} />
              </Field>
              <Field label="Bay">
                <Input value={job.bay} onChange={(e) => set("bay", e.target.value)} />
              </Field>
              <Field label="Started">
                <Input type="datetime-local" value={toLocalInput(job.work_started_at)} onChange={(e) => set("work_started_at", e.target.value ? new Date(e.target.value).toISOString() : null)} />
              </Field>
              <Field label="Finished">
                <Input type="datetime-local" value={toLocalInput(job.work_finished_at)} onChange={(e) => set("work_finished_at", e.target.value ? new Date(e.target.value).toISOString() : null)} />
              </Field>
              <Field label="Technician notes" hint="Printed on the work order." className="col-span-2">
                <Textarea rows={3} value={job.tech_notes} onChange={(e) => set("tech_notes", e.target.value)} />
              </Field>
              <Field label="Internal notes" hint="Never printed." className="col-span-2">
                <Textarea rows={2} value={job.notes} onChange={(e) => set("notes", e.target.value)} />
              </Field>
            </div>
          </Section>

          {job.status === "estimate" || job.status === "declined" ? (
            <div className="border-t border-line pt-5">
              <Button variant="danger" size="sm" onClick={() => setDeleting("ask")}>
                Delete {jobNumber(job)}
              </Button>
              <p className="mt-2 text-xs text-muted">Only estimates and declined jobs can be deleted. Invoices stay on file as tax records.</p>
            </div>
          ) : null}
        </div>

        <aside id="totals" className="scroll-mt-20 lg:sticky lg:top-20 lg:self-start">
          <TotalsPanel
            totals={totals}
            hstRate={Number(job.hst_rate)}
            isInsurance={job.is_insurance}
            approvedTotal={job.approved_total === null ? null : Number(job.approved_total)}
            paid={false}
            locked={locked}
            discount={Number(job.discount)}
            onDiscount={(n) => set("discount", n)}
          />
          {locked || payments.length ? (
            <PaymentsPanel job={job} totals={totals} payments={payments} open={payOpen} onOpen={setPayOpen} onChanged={reloadPayments} />
          ) : null}
        </aside>
      </div>

      {deleting ? (
        <Modal title={`Delete ${jobNumber(job)}?`} onClose={() => { setDeleting(null); setDeleteError(null); }}>
          <p className="mb-4 text-sm text-muted">
            The estimate for {customer.name}&apos;s {vehicleLabel(vehicle)} and its {lines.length} {lines.length === 1 ? "line" : "lines"} will be deleted. This can&apos;t be undone. The number {job.number} won&apos;t be reused.
          </p>
          {deleteError ? <div className="mb-3"><Notice tone="bad">{deleteError}</Notice></div> : null}
          <div className="flex gap-2">
            <Button variant="danger" onClick={deleteJob} disabled={deleting === "busy"}>
              {deleting === "busy" ? "Deleting…" : "Delete job"}
            </Button>
            <Button variant="ghost" onClick={() => { setDeleting(null); setDeleteError(null); }}>Keep it</Button>
          </div>
        </Modal>
      ) : null}

      {/* Phones: the total stays in view while editing lines */}
      <a
        href="#totals"
        className="fixed inset-x-0 bottom-[calc(57px+env(safe-area-inset-bottom))] z-10 flex items-center justify-between gap-3 bg-ink px-4 py-3 lg:hidden"
      >
        <span className="text-sm text-[#b4b2a9]">
          {job.is_insurance ? `Customer pays ${money(totals.customerPays)}` : `${lines.length} ${lines.length === 1 ? "line" : "lines"} · incl. HST`}
        </span>
        <span className="flex items-baseline gap-2">
          <span className="display text-white">Total</span>
          <span className="display tabular text-xl text-brand">{money(totals.total)}</span>
        </span>
      </a>
    </div>
  );
}
