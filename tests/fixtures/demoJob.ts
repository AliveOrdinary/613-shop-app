// A realistic insurance collision job, used to check the PDFs.
import { jobTotals } from "@/lib/totals";
import type { PdfData } from "@/lib/pdf/documents";
import type { JobLine } from "@/lib/types";

const t = "2026-10-17T13:00:00Z";
let pos = 0;
const L = (kind: JobLine["kind"], description: string, quantity: number, unit_price: number, extra: Partial<JobLine> = {}): JobLine => ({
  id: `l${++pos}`, job_id: "j1", position: pos, kind, description, quantity, unit_price, markup_pct: 0,
  part_condition: kind === "part" ? "new" : null, oem: kind === "part" ? true : null, part_number: "", created_at: t, updated_at: t, ...extra,
});

export const lines: JobLine[] = [
  L("labour_body", "Remove and install front bumper cover", 2.5, 95),
  L("part", "Front bumper cover, primed", 1, 612.4, { part_number: "52119-0R917" }),
  L("part", "Front bumper retainer kit", 1, 49.5, { oem: false }),
  L("labour_body", "Repair left fender, 2 dents", 1.8, 95),
  L("labour_paint", "Refinish front bumper and blend left fender", 4.2, 105),
  L("paint_materials", "Paint and materials", 1, 238, { markup_pct: 15 }),
  L("labour_mechanical", "Reset and calibrate front radar sensor", 1, 120),
  L("sublet", "Four-wheel alignment (Kingston Alignment)", 1, 129.99),
];

const base = {
  discount: 0, hst_rate: 13, shop_supplies_pct: null, shop_supplies_cap: null,
  is_insurance: true, deductible: 500, insurer_pays: null, amount_paid: 500, approved_total: 2780.0,
};

export const demo: PdfData = {
  job: {
    ...base, id: "j1", number: 214, status: "invoiced", customer_id: "c1", vehicle_id: "v1",
    concern: "Low-speed collision in a parking lot. Front bumper cover cracked on the left side, left fender dented. Adaptive cruise warning on since the impact.",
    estimate_date: "2026-10-14", valid_until: "2026-11-13", expected_completion: "2026-10-20",
    odometer_in: 48210, odometer_out: 48236,
    intake: { body: ["Existing damage", "Scratches", "Dents"], body_other: "Front bumper and left fender", mechanical: ["Electrical"], lights: ["Other"], lights_other: "Adaptive cruise / radar" },
    belongings: "Child seat in rear. Small chip in windshield, passenger side, existed before.",
    insurer: "Intact Insurance", claim_number: "CL-2026-88231",
    technician: "Raj", bay: "2", work_started_at: "2026-10-15T13:00:00Z", work_finished_at: "2026-10-17T20:30:00Z",
    tech_notes: "Bumper cover replaced, fender dents pulled and filled. Blended into door edge. Radar recalibrated, no codes after road test.",
    notes: "", approved_at: "2026-10-14T18:00:00Z", approval_method: "phone",
    invoice_date: "2026-10-17", invoiced_at: t, invoice_totals: null, paid_at: null,
    payment_method: null, payment_reference: "", declined_at: null, created_at: t, updated_at: t,
  },
  lines,
  customer: { id: "c1", kind: "person", name: "Priya Raman", company: "", phone: "613-555-0142", email: "priya.raman@example.com", address_line: "48 Union St", city: "Kingston", province: "ON", postal_code: "K7L 2N9", notes: "", created_at: t, updated_at: t },
  vehicle: { id: "v1", customer_id: "c1", year: 2021, make: "Toyota", model: "RAV4", trim: "XLE AWD", vin: "2T3P1RFV8MW123456", plate: "CKLM 123", colour: "Magnetic Grey", odometer_km: 48236, notes: "", created_at: t, updated_at: t },
  payments: [{ id: "p1", job_id: "j1", paid_on: "2026-10-17", amount: 500, payer: "customer", method: "debit", reference: "4421", created_at: t }],
  shop: {
    id: 1, shop_name: "613 Automotive", address_line: "780 Burnett St #4", city: "Kingston", province: "ON", postal_code: "K7M 5W3",
    phone: "437-457-2268", email: "613automotiverepairs@gmail.com", hst_number: "123456789 RT0001",
    rate_body: 95, rate_paint: 105, rate_mechanical: 120, paint_markup_pct: 15, shop_supplies_enabled: false, shop_supplies_pct: 0, shop_supplies_cap: null,
    hst_rate: 13, estimate_valid_days: 30, payment_terms: "Payment due on vehicle pickup. Insurance portion billed to the insurer.",
    warranty_text: "Parts and labour are warranted for 90 days or 5,000 km, whichever comes first, from the date the vehicle is returned. Warranty covers defects in the parts we installed and the labour to install them.",
    next_job_number: 215, updated_at: t,
  },
};
demo.job.invoice_totals = jobTotals(demo.job, lines);
