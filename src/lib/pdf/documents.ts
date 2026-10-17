// Estimate, work order and invoice PDFs for a job. Letter size, printable in black and white;
// the 613 yellow is only used for thin rules. Totals come from lib/totals, the same numbers the
// job screen shows (an invoice prints its frozen totals).

import { jsPDF } from "jspdf";
import { autoTable, type CellHookData, type RowInput } from "jspdf-autotable";
import { LOGO_PNG_BASE64, LOGO_SIZE, SAIRA_ITALIC_TTF_BASE64 } from "./assets";
import { money, vehicleLabel } from "@/lib/format";
import { APPROVAL_LABEL, INTAKE_BODY, INTAKE_LIGHTS, INTAKE_MECHANICAL, PAYMENT_LABEL, formatDate } from "@/lib/jobs";
import { KIND_LABEL, LABOUR_KINDS, jobTotals, lineAmount, type Totals } from "@/lib/totals";
import type { Customer, Job, JobLine, Payment, ShopSettings, Vehicle } from "@/lib/types";

export type DocKind = "estimate" | "work-order" | "invoice";

export type PdfData = {
  job: Job;
  lines: JobLine[];
  customer: Customer;
  vehicle: Vehicle;
  payments: Payment[];
  shop: ShopSettings;
};

type Doc = jsPDF & { lastAutoTable?: { finalY: number } };
type RGB = [number, number, number];

const INK: RGB = [11, 11, 11];
const MUTED: RGB = [95, 94, 90];
const RULE: RGB = [214, 212, 205];
const SHADE: RGB = [243, 242, 238];
const YELLOW: RGB = [253, 206, 7];

const M = 14; // page margin, mm
const PAGE_W = 215.9;
const PAGE_H = 279.4;
const CONTENT_W = PAGE_W - 2 * M;
const BOTTOM = PAGE_H - 14; // keep clear of the footer

const PREFIX: Record<DocKind, string> = { estimate: "EST", "work-order": "RO", invoice: "INV" };
const TITLE: Record<DocKind, string> = { estimate: "ESTIMATE", "work-order": "WORK ORDER", invoice: "INVOICE" };

export function docNumber(kind: DocKind, job: Pick<Job, "number">): string {
  return `${PREFIX[kind]}-${job.number}`;
}

export function pdfFileName(kind: DocKind, d: Pick<PdfData, "job" | "customer">): string {
  const name = d.customer.name.replace(/[^\p{L}\p{N} .'-]/gu, "").trim();
  return `${docNumber(kind, d.job)} ${name}.pdf`;
}

/** Totals to print: an invoice prints what was frozen when it was issued. */
export function printedTotals(kind: DocKind, d: PdfData): Totals {
  if (kind === "invoice" && d.job.invoice_totals) return d.job.invoice_totals;
  return jobTotals(d.job, d.lines);
}

function shopAddress(s: ShopSettings): string {
  return [s.address_line, [s.city, s.province].filter(Boolean).join(" "), s.postal_code].filter(Boolean).join(", ");
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

function display(doc: Doc, size: number) {
  doc.setFont("Saira", "italic");
  doc.setFontSize(size);
}

function body(doc: Doc, size = 9, style: "normal" | "bold" = "normal", color: RGB = INK) {
  doc.setFont("helvetica", style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
}

/** Section heading: a short yellow bar, then the title in small bold capitals. */
function section(doc: Doc, y: number, title: string): number {
  doc.setFillColor(...YELLOW);
  doc.rect(M, y - 3.1, 1.6, 3.6, "F");
  body(doc, 8.5, "bold");
  doc.text(title.toUpperCase(), M + 3.4, y);
  return y + 4.5;
}

function checkbox(doc: Doc, x: number, y: number, checked: boolean) {
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.25);
  doc.rect(x, y - 2.8, 3, 3);
  if (checked) {
    doc.setLineWidth(0.5);
    doc.line(x + 0.6, y - 1.3, x + 1.3, y - 0.5);
    doc.line(x + 1.3, y - 0.5, x + 2.6, y - 2.3);
  }
}

/** A row of labelled checkboxes; wraps onto the next line. Returns the y after the row. */
function checkRow(doc: Doc, y: number, label: string, options: string[], ticked: string[], other?: string): number {
  body(doc, 8.5, "bold");
  doc.text(label, M, y);
  let x = M + 34;
  body(doc, 8.5);
  const items = [...options.map((o) => ({ o, on: ticked.includes(o) })), ...(other ? [{ o: `Other: ${other}`, on: true }] : [])];
  for (const { o, on } of items) {
    const w = doc.getTextWidth(o) + 9;
    if (x + w > PAGE_W - M) {
      x = M + 34;
      y += 5;
    }
    checkbox(doc, x, y, on);
    doc.text(o, x + 4.2, y);
    x += w;
  }
  return y + 6;
}

function signatureLine(doc: Doc, x: number, y: number, w: number, label: string) {
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.line(x, y, x + w, y);
  body(doc, 7.5, "normal", MUTED);
  doc.text(label, x, y + 3.5);
}

function paragraph(doc: Doc, y: number, text: string, size = 9, color: RGB = INK, width = CONTENT_W): number {
  body(doc, size, "normal", color);
  const lines = doc.splitTextToSize(text, width) as string[];
  const lh = size * 0.42;
  for (const l of lines) {
    y = ensure(doc, y, lh);
    body(doc, size, "normal", color);
    doc.text(l, M, y);
    y += lh;
  }
  return y;
}

/** Starts a new page if `needed` mm won't fit; returns the y to continue at. */
function ensure(doc: Doc, y: number, needed: number): number {
  if (y + needed <= BOTTOM) return y;
  doc.addPage();
  return continuationHeader(doc);
}

let currentTitle = "";
function continuationHeader(doc: Doc): number {
  const logoH = 7;
  doc.addImage(`data:image/png;base64,${LOGO_PNG_BASE64}`, "PNG", M, 9, (logoH * LOGO_SIZE.width) / LOGO_SIZE.height, logoH);
  body(doc, 9, "bold");
  doc.text(`${currentTitle} (continued)`, PAGE_W - M, 14, { align: "right" });
  doc.setFillColor(...YELLOW);
  doc.rect(M, 19, CONTENT_W, 0.6, "F");
  return 26;
}

function header(doc: Doc, kind: DocKind, d: PdfData): number {
  const { shop, job } = d;
  const logoH = 15;
  doc.addImage(`data:image/png;base64,${LOGO_PNG_BASE64}`, "PNG", M, 11, (logoH * LOGO_SIZE.width) / LOGO_SIZE.height, logoH);

  display(doc, 24);
  doc.setTextColor(...INK);
  doc.text(TITLE[kind], PAGE_W - M, 19, { align: "right" });
  display(doc, 14);
  doc.text(docNumber(kind, job), PAGE_W - M, 26, { align: "right" });

  body(doc, 8, "normal", MUTED);
  const contact = [shopAddress(shop), shop.phone, shop.email].filter(Boolean).join("  ·  ");
  doc.text(contact, M, 32);
  if (shop.hst_number) doc.text(`HST # ${shop.hst_number}`, PAGE_W - M, 32, { align: "right" });

  doc.setFillColor(...YELLOW);
  doc.rect(M, 35, CONTENT_W, 1.1, "F");
  return 43;
}

function footer(doc: Doc, kind: DocKind, d: PdfData) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.2);
    doc.line(M, PAGE_H - 11, PAGE_W - M, PAGE_H - 11);
    body(doc, 7.5, "normal", MUTED);
    doc.text([d.shop.shop_name, shopAddress(d.shop)].filter(Boolean).join("  ·  "), M, PAGE_H - 7);
    doc.text(`${docNumber(kind, d.job)}  ·  Page ${i} of ${pages}`, PAGE_W - M, PAGE_H - 7, { align: "right" });
  }
}

/** Three columns of label/value blocks. Returns the y below the tallest. */
function infoColumns(doc: Doc, y: number, cols: { title: string; lines: { text: string; bold?: boolean; mono?: boolean }[] }[]): number {
  const gap = 6;
  const w = (CONTENT_W - gap * (cols.length - 1)) / cols.length;
  let bottom = y;
  cols.forEach((c, i) => {
    const x = M + i * (w + gap);
    body(doc, 7, "bold", MUTED);
    doc.text(c.title.toUpperCase(), x, y);
    let cy = y + 4.6;
    for (const l of c.lines) {
      if (l.mono) doc.setFont("courier", "normal");
      else body(doc, 9, l.bold ? "bold" : "normal");
      doc.setFontSize(l.mono ? 8.5 : 9);
      doc.setTextColor(...INK);
      for (const part of doc.splitTextToSize(l.text, w) as string[]) {
        doc.text(part, x, cy);
        cy += 4.1;
      }
    }
    bottom = Math.max(bottom, cy);
  });
  return bottom + 2;
}

function kv(label: string, value: string | null | undefined): { text: string } | null {
  return value ? { text: `${label}: ${value}` } : null;
}

function customerColumn(c: Customer) {
  const cityLine = [c.city, c.province, c.postal_code].filter(Boolean).join(" ");
  return {
    title: "Customer",
    lines: [
      { text: c.name, bold: true },
      ...(c.kind === "business" && c.company ? [{ text: c.company }] : []),
      ...(c.address_line ? [{ text: c.address_line }] : []),
      ...(c.address_line || c.city ? [{ text: cityLine }] : []),
      ...(c.phone ? [{ text: c.phone }] : []),
      ...(c.email ? [{ text: c.email }] : []),
    ],
  };
}

function vehicleColumn(v: Vehicle, job: Job, withOut: boolean) {
  const km = (n: number | null) => (n === null ? null : `${n.toLocaleString("en-CA")} km`);
  return {
    title: "Vehicle",
    lines: [
      { text: vehicleLabel(v), bold: true },
      { text: `VIN: ${v.vin ?? "not recorded"}` },
      ...[kv("Plate", v.plate), kv("Colour", v.colour), kv("Odometer in", km(job.odometer_in)), withOut ? kv("Odometer out", km(job.odometer_out)) : null].filter(
        (x): x is { text: string } => x !== null,
      ),
    ],
  };
}

function insuranceLines(job: Job) {
  return job.is_insurance ? [kv("Insurer", job.insurer), kv("Claim #", job.claim_number)].filter((x): x is { text: string } => x !== null) : [];
}

// ---------------------------------------------------------------------------
// Line items and totals
// ---------------------------------------------------------------------------

function lineRows(lines: JobLine[]): RowInput[] {
  if (lines.length === 0) return [[{ content: "No work listed yet.", colSpan: 5, styles: { textColor: MUTED, fontStyle: "italic" } }]];
  return lines.map((l) => {
    const labour = LABOUR_KINDS.includes(l.kind);
    const qty = Number(l.quantity);
    const amount = lineAmount(l);
    let detail: string = KIND_LABEL[l.kind];
    if (l.kind === "part") {
      const cond = l.part_condition ? l.part_condition[0].toUpperCase() + l.part_condition.slice(1) : "New";
      detail = `Part · ${cond} · ${l.oem ? "OEM" : "Aftermarket"}`;
    }
    const desc = [l.description || KIND_LABEL[l.kind], l.part_number ? `Part # ${l.part_number}` : ""].filter(Boolean).join("\n");
    // Paint materials print at the customer's price only; the shop's cost and markup stay private.
    const unit = l.kind === "paint_materials" ? (qty ? amount / qty : amount) : Number(l.unit_price);
    return [
      desc,
      detail,
      labour ? `${qty.toFixed(1)} h` : String(qty % 1 === 0 ? qty : qty.toFixed(2)),
      labour ? `${money(unit)}/h` : money(unit),
      money(amount),
    ];
  });
}

function linesTable(doc: Doc, y: number, lines: JobLine[]): number {
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, top: 26, bottom: 18 },
    head: [["Description", "Type", "Qty / Hrs", "Rate / Price", "Amount"]],
    body: lineRows(lines),
    theme: "plain",
    styles: { font: "helvetica", fontSize: 8.8, textColor: INK, cellPadding: { top: 1.7, bottom: 1.7, left: 2, right: 2 }, lineColor: RULE, lineWidth: { bottom: 0.2 } },
    headStyles: { fillColor: SHADE, fontStyle: "bold", fontSize: 8, textColor: INK, lineWidth: { bottom: 0.4 }, lineColor: INK },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 40, textColor: MUTED, fontSize: 8 },
      2: { cellWidth: 20, halign: "right" },
      3: { cellWidth: 26, halign: "right" },
      4: { cellWidth: 26, halign: "right", fontStyle: "bold" },
    },
    didParseCell: (h: CellHookData) => {
      if (h.section === "head" && h.column.index >= 2) h.cell.styles.halign = "right";
    },
    willDrawPage: (h) => {
      if (h.pageNumber > 1) continuationHeader(doc);
    },
  });
  return (doc.lastAutoTable?.finalY ?? y) + 5;
}

type TotalRow = { label: string; value: string; strong?: boolean; muted?: boolean };

function totalRows(t: Totals, hstRate: number): TotalRow[] {
  const rows: TotalRow[] = [{ label: `Labour${t.labourHours ? ` (${t.labourHours} h)` : ""}`, value: money(t.labour) }];
  if (t.parts) rows.push({ label: "Parts", value: money(t.parts) });
  if (t.paintMaterials) rows.push({ label: "Paint and materials", value: money(t.paintMaterials) });
  if (t.sublet) rows.push({ label: "Sublet", value: money(t.sublet) });
  if (t.fees) rows.push({ label: "Fees", value: money(t.fees) });
  if (t.shopSupplies) rows.push({ label: "Shop supplies", value: money(t.shopSupplies) });
  if (t.discount) rows.push({ label: "Discount", value: `-${money(t.discount)}` });
  rows.push({ label: "Subtotal", value: money(t.subtotal), strong: true });
  rows.push({ label: `HST (${Number(hstRate)}%)`, value: money(t.hst) });
  return rows;
}

/** Totals box on the right; `notes` print to its left. Returns the y below both. */
function totalsBlock(doc: Doc, y: number, t: Totals, d: PdfData, after: TotalRow[], notes: (x: number, y: number, w: number) => number): number {
  const rows = totalRows(t, Number(d.job.hst_rate));
  const boxW = 74;
  const x = PAGE_W - M - boxW;
  const rowH = 5.2;
  const needed = (rows.length + after.length) * rowH + 14;
  y = ensure(doc, y, needed);
  const top = y;

  let cy = y + 3;
  for (const r of rows) {
    body(doc, 9, r.strong ? "bold" : "normal");
    if (r.label === "Subtotal") {
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.2);
      doc.line(x, cy - 3.6, x + boxW, cy - 3.6);
    }
    doc.text(r.label, x + 2, cy);
    doc.text(r.value, x + boxW - 2, cy, { align: "right" });
    cy += rowH;
  }
  // Total: the one heavy element on the page
  doc.setFillColor(...INK);
  doc.rect(x, cy - 3.2, boxW, 9, "F");
  display(doc, 12);
  doc.setTextColor(255, 255, 255);
  doc.text("Total", x + 3, cy + 2.7);
  doc.setTextColor(...YELLOW);
  doc.text(money(t.total), x + boxW - 3, cy + 2.7, { align: "right" });
  cy += 11.5;

  for (const r of after) {
    body(doc, 9, r.strong ? "bold" : "normal", r.muted ? MUTED : INK);
    doc.text(r.label, x + 2, cy);
    doc.text(r.value, x + boxW - 2, cy, { align: "right" });
    cy += rowH;
  }

  const notesBottom = notes(M, top + 3, CONTENT_W - boxW - 8);
  return Math.max(cy, notesBottom) + 3;
}

/** Wrapped text in a column (used beside the totals box). */
function columnText(doc: Doc, x: number, y: number, w: number, blocks: { title?: string; text: string }[]): number {
  for (const b of blocks) {
    if (b.title) {
      body(doc, 7, "bold", MUTED);
      doc.text(b.title.toUpperCase(), x, y);
      y += 4;
    }
    body(doc, 8.3);
    for (const l of b.text.split("\n").flatMap((t) => doc.splitTextToSize(t, w) as string[])) {
      doc.text(l, x, y);
      y += 3.7;
    }
    y += 2.5;
  }
  return y;
}

function concernBlock(doc: Doc, y: number, job: Job): number {
  y = ensure(doc, y, 14);
  y = section(doc, y, "Customer concern / requested work");
  y = paragraph(doc, y, job.concern.trim() || "—");
  return y + 4;
}

function authorization(doc: Doc, y: number, d: PdfData, text: string): number {
  y = ensure(doc, y, 30);
  y = section(doc, y, "Customer authorization");
  y = paragraph(doc, y, text, 8.3, INK);
  y += 12;
  const half = (CONTENT_W - 10) / 2;
  signatureLine(doc, M, y, half - 30, "Customer signature");
  signatureLine(doc, M + half - 24, y, 24, "Date");
  signatureLine(doc, M + half + 10, y, half - 30, `Shop representative, ${d.shop.shop_name}`);
  signatureLine(doc, M + 2 * half + 10 - 24, y, 24, "Date");
  return y + 9;
}

// ---------------------------------------------------------------------------
// The three documents
// ---------------------------------------------------------------------------

function estimate(doc: Doc, d: PdfData) {
  const { job, customer, vehicle } = d;
  let y = header(doc, "estimate", d);
  y = infoColumns(doc, y, [
    customerColumn(customer),
    vehicleColumn(vehicle, job, false),
    {
      title: "Estimate",
      lines: [
        { text: `Date given: ${formatDate(job.estimate_date)}` },
        { text: `Valid until: ${formatDate(job.valid_until)}` },
        { text: `Expected completion: ${job.expected_completion ? formatDate(job.expected_completion) : "to be confirmed"}` },
        ...insuranceLines(job),
      ],
    },
  ]);
  y = concernBlock(doc, y + 2, job);
  y = section(doc, ensure(doc, y, 20), "Estimated repairs");
  y = linesTable(doc, y, d.lines);

  const t = printedTotals("estimate", d);
  const after: TotalRow[] = job.is_insurance
    ? [
        { label: "Insurance pays", value: money(t.insurerPays) },
        { label: "Customer pays (deductible)", value: money(t.customerPays), strong: true },
      ]
    : [];
  y = totalsBlock(doc, y, t, d, after, (x, ny, w) =>
    columnText(doc, x, ny, w, [
      {
        title: "About this estimate",
        text: `Labour is charged by the hour at the rates shown. Parts are new unless marked used or reconditioned, and aftermarket unless marked OEM. This estimate is valid until ${formatDate(job.valid_until)}. The final bill won't be more than 10% over this estimate without your approval.`,
      },
      ...(d.shop.payment_terms ? [{ title: "Payment", text: d.shop.payment_terms }] : []),
    ]),
  );

  authorization(
    doc,
    y + 2,
    d,
    `I authorize ${d.shop.shop_name} to carry out the work described in this estimate for a total of ${money(t.total)} including HST. I understand that if more work is needed, the shop will ask for my approval before going more than 10% over this amount.`,
  );
}

function workOrder(doc: Doc, d: PdfData) {
  const { job, customer, vehicle } = d;
  let y = header(doc, "work-order", d);
  const approved = job.approved_at && job.approval_method ? `${formatDate(job.approved_at)} (${APPROVAL_LABEL[job.approval_method].toLowerCase()})` : "Not yet approved";
  y = infoColumns(doc, y, [
    customerColumn(customer),
    vehicleColumn(vehicle, job, false),
    {
      title: "Work order",
      lines: [
        { text: `Opened: ${formatDate(job.estimate_date)}` },
        { text: `Approved: ${approved}` },
        { text: `Expected completion: ${job.expected_completion ? formatDate(job.expected_completion) : "to be confirmed"}` },
        ...[kv("Technician", job.technician), kv("Bay", job.bay)].filter((x): x is { text: string } => x !== null),
        ...insuranceLines(job),
      ],
    },
  ]);
  y = concernBlock(doc, y + 2, job);

  y = section(doc, ensure(doc, y, 30), "Vehicle condition at drop-off");
  const intake = job.intake ?? {};
  y += 1;
  y = checkRow(doc, y, "Exterior / body", INTAKE_BODY, intake.body ?? [], intake.body_other || undefined);
  y = checkRow(doc, y, "Mechanical", INTAKE_MECHANICAL, intake.mechanical ?? [], intake.mechanical_other || undefined);
  y = checkRow(doc, y, "Warning lights", INTAKE_LIGHTS, intake.lights ?? [], intake.lights_other || undefined);
  if (job.belongings.trim()) {
    body(doc, 8.5, "bold");
    doc.text("Belongings / notes", M, y);
    y = paragraph(doc, y + 4.2, job.belongings.trim(), 8.8);
  }
  y += 3;

  y = section(doc, ensure(doc, y, 20), "Authorized repairs");
  y = linesTable(doc, y, d.lines);
  const t = jobTotals(job, d.lines);
  y = totalsBlock(doc, y, t, d, job.approved_total !== null ? [{ label: "Approved estimate", value: money(Number(job.approved_total)), muted: true }] : [], (x, ny, w) =>
    columnText(doc, x, ny, w, [{ title: "Approval", text: `Approved ${approved}. Any work beyond 10% over the approved amount needs the customer's OK first, recorded below.` }]),
  );

  // Supplements: blank rows to fill in by hand
  y = section(doc, ensure(doc, y + 2, 38), "Supplement / additional authorization");
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, top: 26, bottom: 18 },
    head: [["Date", "Additional work / reason", "Estimate", "Approved by"]],
    body: [0, 1, 2].map(() => ["", "", "", ""]),
    theme: "grid",
    styles: { fontSize: 8.5, minCellHeight: 7.5, lineColor: RULE, lineWidth: 0.2, textColor: INK },
    headStyles: { fillColor: SHADE, textColor: INK, fontStyle: "bold", fontSize: 8 },
    columnStyles: { 0: { cellWidth: 26 }, 2: { cellWidth: 28 }, 3: { cellWidth: 38 } },
    willDrawPage: (h) => {
      if (h.pageNumber > 1) continuationHeader(doc);
    },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 7;

  y = section(doc, ensure(doc, y, 40), "Repair / technician notes");
  const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "________");
  body(doc, 8.8);
  doc.text(`Technician: ${job.technician || "____________"}     Start: ${fmtTime(job.work_started_at)}     Finish: ${fmtTime(job.work_finished_at)}     Bay: ${job.bay || "____"}`, M, y);
  y += 5.5;
  if (job.tech_notes.trim()) y = paragraph(doc, y, job.tech_notes.trim(), 8.8) + 1;
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.2);
  for (let i = 0; i < 3; i++) {
    y = ensure(doc, y, 7);
    y += 6;
    doc.line(M, y, PAGE_W - M, y);
  }
  y += 7;

  y = section(doc, ensure(doc, y, 30), "Quality control / final inspection");
  y += 1;
  const qc = [
    "Road test completed",
    "Brakes checked",
    "Fluid levels checked",
    "Lights checked",
    "Codes checked / cleared",
    "Panel fit checked",
    "Paint / refinish inspected",
    "Vehicle cleaned",
    "Belongings checked",
    "Final inspection done",
  ];
  body(doc, 8.5);
  const colW = CONTENT_W / 3;
  qc.forEach((q, i) => {
    const cx = M + (i % 3) * colW;
    const cy = y + Math.floor(i / 3) * 5.5;
    checkbox(doc, cx, cy, false);
    body(doc, 8.5);
    doc.text(q, cx + 4.5, cy);
  });
  y += Math.ceil(qc.length / 3) * 5.5 + 4;

  authorization(
    doc,
    y,
    d,
    `I authorize ${d.shop.shop_name} to inspect, diagnose, service and/or repair the vehicle as described above. I understand that additional repairs may be required and that my approval will be asked for before work outside the approved scope is done. I accept responsibility for authorized charges and agree to the shop's payment and warranty terms.`,
  );
}

function invoice(doc: Doc, d: PdfData) {
  const { job, customer, vehicle, shop } = d;
  let y = header(doc, "invoice", d);
  y = infoColumns(doc, y, [
    { ...customerColumn(customer), title: "Bill to" },
    vehicleColumn(vehicle, job, true),
    {
      title: "Invoice",
      lines: [
        { text: `Invoice date: ${formatDate(job.invoice_date)}` },
        { text: `Work order: RO-${job.number}` },
        { text: `Estimate: EST-${job.number}` },
        ...insuranceLines(job),
      ],
    },
  ]);
  y = concernBlock(doc, y + 2, job);
  y = section(doc, ensure(doc, y, 20), "Labour, parts and services");
  y = linesTable(doc, y, d.lines);

  const t = printedTotals("invoice", d);
  const paid = d.payments.reduce((s, p) => s + Number(p.amount), 0);
  const balance = Math.max(0, Math.round((t.total - paid) * 100) / 100);
  const after: TotalRow[] = [];
  if (job.is_insurance) {
    after.push({ label: "Insurance pays", value: money(t.insurerPays) });
    after.push({ label: "Customer pays (deductible)", value: money(t.customerPays) });
  }
  if (paid > 0) after.push({ label: "Paid", value: `-${money(paid)}` });
  after.push({ label: balance > 0 ? "Balance due" : "Paid in full", value: money(balance), strong: true });

  const paymentLines = d.payments.map(
    (p) =>
      `${formatDate(p.paid_on)}  ${p.payer === "insurer" ? job.insurer || "Insurer" : p.payer === "customer" ? "Customer" : "Other"}, ${PAYMENT_LABEL[p.method].toLowerCase()}${p.reference ? ` (${p.reference})` : ""}  ${money(Number(p.amount))}`,
  );
  y = totalsBlock(doc, y, t, d, after, (x, ny, w) =>
    columnText(doc, x, ny, w, [
      ...(paymentLines.length ? [{ title: "Payments received", text: paymentLines.join("\n") }] : []),
      { title: "Warranty", text: shop.warranty_text },
      ...(shop.payment_terms ? [{ title: "Payment terms", text: shop.payment_terms }] : []),
    ]),
  );

  y = ensure(doc, y + 2, 10);
  display(doc, 12);
  doc.setTextColor(...INK);
  doc.text("Thank you for choosing 613 Automotive.", M, y + 4);
}

/** Builds one document for a job. */
export function buildJobPdf(kind: DocKind, d: PdfData): ArrayBuffer {
  const doc = new jsPDF({ unit: "mm", format: "letter", compress: true }) as Doc;
  doc.addFileToVFS("Saira-SemiBoldItalic.ttf", SAIRA_ITALIC_TTF_BASE64);
  doc.addFont("Saira-SemiBoldItalic.ttf", "Saira", "italic");
  doc.setProperties({
    title: `${docNumber(kind, d.job)} ${d.customer.name}`,
    subject: `${TITLE[kind].toLowerCase()} for ${vehicleLabel(d.vehicle)}`,
    author: d.shop.shop_name,
    creator: d.shop.shop_name,
  });
  currentTitle = `${TITLE[kind][0]}${TITLE[kind].slice(1).toLowerCase()} ${docNumber(kind, d.job)}`;

  if (kind === "estimate") estimate(doc, d);
  else if (kind === "work-order") workOrder(doc, d);
  else invoice(doc, d);

  footer(doc, kind, d);
  return doc.output("arraybuffer");
}
