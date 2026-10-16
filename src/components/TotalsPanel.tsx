"use client";

import { Card, Notice, NumberInput, cx } from "./ui";
import { money } from "@/lib/format";
import type { Totals } from "@/lib/totals";

function Row({ label, value, sub, strong, muted }: { label: string; value: string; sub?: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={cx("flex items-baseline justify-between gap-3 py-1", muted && "text-muted")}>
      <span className={cx(strong ? "font-semibold text-ink" : "text-charcoal")}>
        {label}
        {sub ? <span className="ml-1 text-xs text-muted">{sub}</span> : null}
      </span>
      <span className={cx("tabular", strong ? "font-semibold text-ink" : "text-ink")}>{value}</span>
    </div>
  );
}

export function TotalsPanel({
  totals,
  hstRate,
  isInsurance,
  approvedTotal,
  paid,
  locked,
  discount,
  onDiscount,
}: {
  totals: Totals;
  hstRate: number;
  isInsurance: boolean;
  approvedTotal: number | null;
  paid: boolean;
  locked: boolean;
  discount: number;
  onDiscount: (n: number) => void;
}) {
  const t = totals;
  return (
    <Card className="overflow-hidden">
      <div className="px-4 pb-3 pt-4 text-[15px]">
        <Row label="Labour" sub={t.labourHours ? `${t.labourHours} h` : undefined} value={money(t.labour)} />
        {t.parts ? <Row label="Parts" value={money(t.parts)} /> : null}
        {t.paintMaterials ? <Row label="Paint materials" value={money(t.paintMaterials)} /> : null}
        {t.sublet ? <Row label="Sublet" value={money(t.sublet)} /> : null}
        {t.fees ? <Row label="Fees" value={money(t.fees)} /> : null}
        {t.shopSupplies ? <Row label="Shop supplies" value={money(t.shopSupplies)} /> : null}
        <div className="flex items-center justify-between gap-3 py-1">
          <label htmlFor="discount" className="text-charcoal">
            Discount
          </label>
          {locked ? (
            <span className="tabular text-ink">{t.discount ? `−${money(t.discount)}` : money(0)}</span>
          ) : (
            <div className="relative w-28">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted">−$</span>
              <NumberInput id="discount" value={discount || null} onValue={(v) => onDiscount(v ?? 0)} min={0} step="0.01" className="h-9 w-full pl-7 text-right text-[15px]" placeholder="0.00" />
            </div>
          )}
        </div>
        <div className="my-2 border-t border-line" />
        <Row label="Subtotal" value={money(t.subtotal)} />
        <Row label="HST" sub={`${Number(hstRate)}%`} value={money(t.hst)} />
      </div>
      <div className="flex items-baseline justify-between gap-3 bg-ink px-4 py-3.5">
        <span className="display text-lg text-white">Total</span>
        <span className="display tabular text-2xl text-brand">{money(t.total)}</span>
      </div>
      {isInsurance || paid || approvedTotal !== null ? (
        <div className="space-y-0.5 px-4 py-3 text-[15px]">
          {isInsurance ? (
            <>
              <Row label="Insurance pays" value={money(t.insurerPays)} />
              <Row label="Customer pays" sub="deductible" value={money(t.customerPays)} />
            </>
          ) : null}
          {paid ? (
            <>
              <Row label="Paid" value={money(t.amountPaid)} />
              <Row label="Balance" value={money(t.balance)} strong />
            </>
          ) : null}
          {approvedTotal !== null ? <Row label="Approved estimate" value={money(approvedTotal)} muted /> : null}
        </div>
      ) : null}
      {t.overEstimate && !locked ? (
        <div className="px-4 pb-4">
          <Notice tone="warn">
            This is more than 10% over the approved estimate (limit {money(t.estimateLimit ?? 0)}). Ontario requires the customer&apos;s OK before charging it.
          </Notice>
        </div>
      ) : null}
    </Card>
  );
}
