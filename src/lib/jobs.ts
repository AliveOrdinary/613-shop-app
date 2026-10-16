import type { ApprovalMethod, Job, JobStatus, PaymentMethod } from "./types";

export const STATUS_LABEL: Record<JobStatus, string> = {
  estimate: "Estimate",
  approved: "Approved",
  ready: "Ready",
  invoiced: "Invoiced",
  paid: "Paid",
  declined: "Declined",
};

export const STATUS_TONE: Record<JobStatus, "neutral" | "ok" | "warn" | "bad" | "brand"> = {
  estimate: "neutral",
  approved: "brand",
  ready: "ok",
  invoiced: "warn",
  paid: "ok",
  declined: "bad",
};

/** Which document a job "is" right now: an estimate, a work order (RO) or an invoice. */
export function docPrefix(status: JobStatus): "EST" | "RO" | "INV" {
  if (status === "invoiced" || status === "paid") return "INV";
  if (status === "approved" || status === "ready") return "RO";
  return "EST";
}

export function jobNumber(job: Pick<Job, "number" | "status">, prefix: "EST" | "RO" | "INV" = docPrefix(job.status)): string {
  return `${prefix}-${job.number}`;
}

export const APPROVAL_LABEL: Record<ApprovalMethod, string> = {
  signed: "Signed the estimate",
  in_person: "In person",
  phone: "By phone",
  email: "By email",
  text: "By text",
};

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  debit: "Debit",
  credit: "Credit card",
  cash: "Cash",
  etransfer: "E-transfer",
  cheque: "Cheque",
  insurance: "Insurance",
  other: "Other",
};

// Intake checklists, matching the 613 work order
export const INTAKE_BODY = ["Existing damage", "Scratches", "Dents", "Rust", "Glass damage"];
export const INTAKE_MECHANICAL = ["Engine", "Transmission", "Brakes", "Suspension", "Steering", "Electrical", "HVAC"];
export const INTAKE_LIGHTS = ["None", "Check engine", "ABS", "Airbag", "TPMS"];

/** Statuses whose money is locked. */
export function isLocked(status: JobStatus): boolean {
  return status === "invoiced" || status === "paid";
}

/** Today's date in Toronto as YYYY-MM-DD. */
export function todayLocal(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-CA", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}
