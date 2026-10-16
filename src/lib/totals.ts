// The one place a job's money is worked out. The job screen, the jobs list and the PDFs all
// call jobTotals, so they can't disagree. Everything is done in whole cents.

export type LineKind = "labour_body" | "labour_paint" | "labour_mechanical" | "part" | "paint_materials" | "sublet" | "fee";

export const LABOUR_KINDS: LineKind[] = ["labour_body", "labour_paint", "labour_mechanical"];

export const KIND_LABEL: Record<LineKind, string> = {
  labour_body: "Body labour",
  labour_paint: "Paint labour",
  labour_mechanical: "Mechanical labour",
  part: "Part",
  paint_materials: "Paint materials",
  sublet: "Sublet",
  fee: "Fee",
};

export type TotalsLine = {
  kind: LineKind;
  quantity: number | string;
  unit_price: number | string;
  markup_pct?: number | string | null;
};

export type TotalsJob = {
  discount: number | string;
  hst_rate: number | string;
  shop_supplies_pct: number | string | null;
  shop_supplies_cap: number | string | null;
  is_insurance: boolean;
  deductible: number | string;
  insurer_pays: number | string | null;
  amount_paid: number | string;
  approved_total?: number | string | null;
};

export type Totals = {
  labourBody: number;
  labourPaint: number;
  labourMechanical: number;
  labour: number;
  labourHours: number;
  parts: number;
  paintMaterials: number;
  sublet: number;
  fees: number;
  shopSupplies: number;
  beforeDiscount: number;
  discount: number;
  subtotal: number;
  hst: number;
  total: number;
  /** Insurance jobs only; both 0 otherwise */
  insurerPays: number;
  customerPays: number;
  amountPaid: number;
  balance: number;
  /** Total is more than 10% over the approved estimate (Ontario's limit) */
  overEstimate: boolean;
  /** The most the invoice can be without going over the 10% limit, when an estimate was approved */
  estimateLimit: number | null;
};

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const cents = (dollars: number): number => Math.round(dollars * 100);
const dollars = (c: number): number => c / 100;

/** A line's amount in cents. Paint materials carry their markup. */
export function lineCents(l: TotalsLine): number {
  const base = num(l.quantity) * num(l.unit_price);
  const factor = l.kind === "paint_materials" ? 1 + num(l.markup_pct) / 100 : 1;
  return cents(base * factor);
}

export function lineAmount(l: TotalsLine): number {
  return dollars(lineCents(l));
}

export function jobTotals(job: TotalsJob, lines: TotalsLine[]): Totals {
  const sum = (kind: LineKind) => lines.filter((l) => l.kind === kind).reduce((s, l) => s + lineCents(l), 0);
  const labourBody = sum("labour_body");
  const labourPaint = sum("labour_paint");
  const labourMechanical = sum("labour_mechanical");
  const labour = labourBody + labourPaint + labourMechanical;
  const labourHours = lines.filter((l) => LABOUR_KINDS.includes(l.kind)).reduce((s, l) => s + num(l.quantity), 0);
  const parts = sum("part");
  const paintMaterials = sum("paint_materials");
  const sublet = sum("sublet");
  const fees = sum("fee");

  let shopSupplies = 0;
  if (job.shop_supplies_pct !== null && num(job.shop_supplies_pct) > 0) {
    shopSupplies = Math.round((labour * num(job.shop_supplies_pct)) / 100);
    if (job.shop_supplies_cap !== null && job.shop_supplies_cap !== "") shopSupplies = Math.min(shopSupplies, cents(num(job.shop_supplies_cap)));
  }

  const beforeDiscount = labour + parts + paintMaterials + sublet + fees + shopSupplies;
  const discount = Math.min(cents(num(job.discount)), beforeDiscount);
  const subtotal = beforeDiscount - discount;
  const hst = Math.round((subtotal * num(job.hst_rate)) / 100);
  const total = subtotal + hst;

  let insurerPays = 0;
  let customerPays = total;
  if (job.is_insurance) {
    if (job.insurer_pays !== null && job.insurer_pays !== "") {
      insurerPays = Math.min(cents(num(job.insurer_pays)), total);
      customerPays = total - insurerPays;
    } else {
      customerPays = Math.min(cents(num(job.deductible)), total);
      insurerPays = total - customerPays;
    }
  }

  const amountPaid = cents(num(job.amount_paid));
  const approved = job.approved_total === null || job.approved_total === undefined || job.approved_total === "" ? null : cents(num(job.approved_total));
  const estimateLimit = approved === null ? null : Math.floor(approved * 1.1);

  return {
    labourBody: dollars(labourBody),
    labourPaint: dollars(labourPaint),
    labourMechanical: dollars(labourMechanical),
    labour: dollars(labour),
    labourHours: Math.round(labourHours * 100) / 100,
    parts: dollars(parts),
    paintMaterials: dollars(paintMaterials),
    sublet: dollars(sublet),
    fees: dollars(fees),
    shopSupplies: dollars(shopSupplies),
    beforeDiscount: dollars(beforeDiscount),
    discount: dollars(discount),
    subtotal: dollars(subtotal),
    hst: dollars(hst),
    total: dollars(total),
    insurerPays: dollars(insurerPays),
    customerPays: dollars(customerPays),
    amountPaid: dollars(amountPaid),
    balance: dollars(total - amountPaid),
    overEstimate: estimateLimit !== null && total > estimateLimit,
    estimateLimit: estimateLimit === null ? null : dollars(estimateLimit),
  };
}
