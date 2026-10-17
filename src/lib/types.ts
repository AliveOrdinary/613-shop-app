import type { InspectionResults } from "./inspection";
import type { LineKind, Totals } from "./totals";

export type ShopSettings = {
  id: 1;
  shop_name: string;
  address_line: string;
  city: string;
  province: string;
  postal_code: string;
  phone: string;
  email: string;
  hst_number: string;
  rate_body: number;
  rate_paint: number;
  rate_mechanical: number;
  paint_markup_pct: number;
  shop_supplies_enabled: boolean;
  shop_supplies_pct: number;
  shop_supplies_cap: number | null;
  hst_rate: number;
  estimate_valid_days: number;
  payment_terms: string;
  warranty_text: string;
  next_job_number: number;
  updated_at: string;
};

export type CustomerKind = "person" | "business";

export type Customer = {
  id: string;
  kind: CustomerKind;
  name: string;
  company: string;
  phone: string;
  email: string;
  address_line: string;
  city: string;
  province: string;
  postal_code: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type Vehicle = {
  id: string;
  customer_id: string;
  year: number | null;
  make: string;
  model: string;
  trim: string;
  vin: string | null;
  plate: string;
  colour: string;
  odometer_km: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type CustomerWithVehicles = Customer & { vehicles: Vehicle[] };

/** Fields a form edits: everything except ids and timestamps. */
export type CustomerDraft = Omit<Customer, "id" | "created_at" | "updated_at">;
export type VehicleDraft = Omit<Vehicle, "id" | "customer_id" | "created_at" | "updated_at">;

export const EMPTY_CUSTOMER: CustomerDraft = {
  kind: "person",
  name: "",
  company: "",
  phone: "",
  email: "",
  address_line: "",
  city: "",
  province: "ON",
  postal_code: "",
  notes: "",
};

export const EMPTY_VEHICLE: VehicleDraft = {
  year: null,
  make: "",
  model: "",
  trim: "",
  vin: null,
  plate: "",
  colour: "",
  odometer_km: null,
  notes: "",
};


export type JobStatus = "estimate" | "approved" | "ready" | "invoiced" | "paid" | "declined";
export type ApprovalMethod = "signed" | "phone" | "in_person" | "email" | "text";
export type PaymentMethod = "cash" | "debit" | "credit" | "etransfer" | "cheque" | "insurance" | "other";
export type PartCondition = "new" | "used" | "reconditioned";

/** Condition recorded at drop-off; keys match the checkbox lists in lib/jobs.ts */
export type Intake = {
  body?: string[];
  body_other?: string;
  mechanical?: string[];
  mechanical_other?: string;
  lights?: string[];
  lights_other?: string;
};

export type Job = {
  id: string;
  number: number;
  status: JobStatus;
  customer_id: string;
  vehicle_id: string;
  concern: string;
  estimate_date: string;
  valid_until: string | null;
  expected_completion: string | null;
  odometer_in: number | null;
  odometer_out: number | null;
  intake: Intake;
  belongings: string;
  is_insurance: boolean;
  insurer: string;
  claim_number: string;
  deductible: number;
  insurer_pays: number | null;
  discount: number;
  hst_rate: number;
  shop_supplies_pct: number | null;
  shop_supplies_cap: number | null;
  technician: string;
  bay: string;
  work_started_at: string | null;
  work_finished_at: string | null;
  tech_notes: string;
  notes: string;
  approved_at: string | null;
  approval_method: ApprovalMethod | null;
  approved_total: number | null;
  invoice_date: string | null;
  invoiced_at: string | null;
  invoice_totals: Totals | null;
  paid_at: string | null;
  payment_method: PaymentMethod | null;
  payment_reference: string;
  amount_paid: number;
  declined_at: string | null;
  qc: Record<string, boolean>;
  qc_notes: string;
  qc_by: string;
  qc_at: string | null;
  created_at: string;
  updated_at: string;
};

export type JobLine = {
  id: string;
  job_id: string;
  position: number;
  kind: LineKind;
  description: string;
  quantity: number;
  unit_price: number;
  markup_pct: number;
  part_condition: PartCondition | null;
  oem: boolean | null;
  part_number: string;
  created_at: string;
  updated_at: string;
};

export type Payer = "customer" | "insurer" | "other";

export type Payment = {
  id: string;
  job_id: string;
  paid_on: string;
  amount: number;
  payer: Payer;
  method: PaymentMethod;
  reference: string;
  created_at: string;
};

export type JobWithLines = Job & { job_lines: JobLine[] };
export type JobFull = JobWithLines & { customer: Customer; vehicle: Vehicle; payments: Payment[]; files: JobFile[]; inspection: Inspection | null };

export type PhotoStage = "dropoff" | "repair" | "completed";

export type JobFile = {
  id: string;
  job_id: string;
  kind: "photo" | "document";
  stage: PhotoStage | null;
  path: string;
  name: string;
  mime: string;
  size_bytes: number;
  caption: string;
  created_at: string;
};

export type Inspection = {
  job_id: string;
  results: InspectionResults;
  safety_concerns: string;
  recommendations: string;
  measurements: string;
  technician: string;
  odometer_km: number | null;
  customer_notified: boolean | null;
  customer_authorized: boolean | null;
  inspected_on: string;
  created_at: string;
  updated_at: string;
};
