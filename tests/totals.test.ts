import { describe, expect, it } from "vitest";
import { jobTotals, lineAmount, type TotalsJob, type TotalsLine } from "@/lib/totals";

const job = (over: Partial<TotalsJob> = {}): TotalsJob => ({
  discount: 0,
  hst_rate: 13,
  shop_supplies_pct: null,
  shop_supplies_cap: null,
  is_insurance: false,
  deductible: 0,
  insurer_pays: null,
  amount_paid: 0,
  approved_total: null,
  ...over,
});

// The lines from 613's sample estimate (EST0001), typed the way the app would hold them
const SAMPLE: TotalsLine[] = [
  { kind: "labour_body", quantity: 1, unit_price: 93.5 },
  { kind: "part", quantity: 1, unit_price: 1650 },
  { kind: "labour_body", quantity: 3, unit_price: 121 },
  { kind: "part", quantity: 1, unit_price: 203.5 },
  { kind: "part", quantity: 1, unit_price: 49.5 },
  { kind: "part", quantity: 1, unit_price: 55 },
  { kind: "labour_body", quantity: 3, unit_price: 121 },
];

describe("job totals", () => {
  it("matches 613's sample estimate before tax, then adds 13% HST", () => {
    const t = jobTotals(job({ discount: 252 }), SAMPLE);
    expect(t.beforeDiscount).toBe(2777.5);
    expect(t.discount).toBe(252);
    expect(t.subtotal).toBe(2525.5);
    expect(t.hst).toBe(328.32); // 328.315 rounds up
    expect(t.total).toBe(2853.82);
    expect(t.labour).toBe(819.5);
    expect(t.labourHours).toBe(7);
    expect(t.parts).toBe(1958);
  });

  it("adds the paint markup to paint materials only", () => {
    const lines: TotalsLine[] = [
      { kind: "paint_materials", quantity: 1, unit_price: 180, markup_pct: 25 },
      { kind: "part", quantity: 1, unit_price: 100, markup_pct: 25 },
    ];
    expect(lineAmount(lines[0])).toBe(225);
    const t = jobTotals(job(), lines);
    expect(t.paintMaterials).toBe(225);
    expect(t.parts).toBe(100);
  });

  it("charges shop supplies as a share of labour, up to the cap", () => {
    const lines: TotalsLine[] = [
      { kind: "labour_paint", quantity: 10, unit_price: 100 },
      { kind: "part", quantity: 1, unit_price: 500 },
    ];
    expect(jobTotals(job({ shop_supplies_pct: 5 }), lines).shopSupplies).toBe(50);
    expect(jobTotals(job({ shop_supplies_pct: 5, shop_supplies_cap: 35 }), lines).shopSupplies).toBe(35);
    expect(jobTotals(job({ shop_supplies_pct: null }), lines).shopSupplies).toBe(0);
  });

  it("never lets a discount take the total below zero", () => {
    const t = jobTotals(job({ discount: 999 }), [{ kind: "fee", quantity: 1, unit_price: 50 }]);
    expect(t.discount).toBe(50);
    expect(t.total).toBe(0);
  });

  it("splits an insurance job: customer pays the deductible, insurer pays the rest including HST", () => {
    const t = jobTotals(job({ is_insurance: true, deductible: 500 }), [{ kind: "labour_body", quantity: 10, unit_price: 100 }]);
    expect(t.total).toBe(1130);
    expect(t.customerPays).toBe(500);
    expect(t.insurerPays).toBe(630);
  });

  it("uses the insurer's amount when it's typed in, and the customer covers the rest", () => {
    const t = jobTotals(job({ is_insurance: true, deductible: 500, insurer_pays: 1000 }), [{ kind: "labour_body", quantity: 10, unit_price: 100 }]);
    expect(t.insurerPays).toBe(1000);
    expect(t.customerPays).toBe(130);
  });

  it("caps the deductible at the total on a small job", () => {
    const t = jobTotals(job({ is_insurance: true, deductible: 1000 }), [{ kind: "fee", quantity: 1, unit_price: 100 }]);
    expect(t.customerPays).toBe(113);
    expect(t.insurerPays).toBe(0);
  });

  it("flags an invoice more than 10% over the approved estimate", () => {
    const lines: TotalsLine[] = [{ kind: "labour_body", quantity: 1, unit_price: 100 }];
    expect(jobTotals(job({ approved_total: 113 }), lines).overEstimate).toBe(false);
    expect(jobTotals(job({ approved_total: 103 }), lines).overEstimate).toBe(false); // limit 113.30
    expect(jobTotals(job({ approved_total: 100 }), lines).overEstimate).toBe(true);
    expect(jobTotals(job({ approved_total: 100 }), lines).estimateLimit).toBe(110);
    expect(jobTotals(job(), lines).overEstimate).toBe(false);
  });

  it("works out the balance after a payment, and copes with numbers stored as text", () => {
    const t = jobTotals(job({ amount_paid: "100.00", hst_rate: "13.00" }), [{ kind: "part", quantity: "2", unit_price: "50.00" }]);
    expect(t.total).toBe(113);
    expect(t.balance).toBe(13);
  });

  it("rounds each line to the cent before adding", () => {
    const t = jobTotals(job({ hst_rate: 0 }), [
      { kind: "labour_body", quantity: 0.33, unit_price: 95 }, // 31.35
      { kind: "labour_body", quantity: 0.33, unit_price: 95 },
    ]);
    expect(t.total).toBe(62.7);
  });
});
