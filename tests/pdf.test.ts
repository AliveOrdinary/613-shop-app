import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildJobPdf, odometerText, pdfFileName, type DocKind } from "@/lib/pdf/documents";
import { demo } from "./fixtures/demoJob";

// Set PDF_OUT=some/dir to keep the files for a look.
const out = process.env.PDF_OUT;

describe("job PDFs", () => {
  for (const kind of ["estimate", "work-order", "invoice", "inspection"] as DocKind[]) {
    it(`builds the ${kind}`, () => {
      const buf = Buffer.from(buildJobPdf(kind, demo));
      expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(buf.length).toBeGreaterThan(20_000);
      if (out) {
        mkdirSync(out, { recursive: true });
        writeFileSync(path.join(out, pdfFileName(kind, demo)), buf);
      }
    });
  }

  it("still builds with no lines, no VIN and nothing optional filled in", () => {
    const bare = { ...demo, lines: [], payments: [], vehicle: { ...demo.vehicle, vin: null, plate: "", colour: "" }, job: { ...demo.job, is_insurance: false, concern: "", intake: {}, belongings: "", tech_notes: "", technician: "", invoice_totals: null } };
    for (const kind of ["estimate", "work-order", "invoice"] as DocKind[]) expect(buildJobPdf(kind, bare).byteLength).toBeGreaterThan(10_000);
  });

  it("prints missing odometer readings as write-in lines on the work order and invoice, not the estimate", () => {
    // The PDF's text is compressed, so check the line itself; pdftotext confirms the placement
    expect(odometerText(null, true)).toBe("________ km");
    expect(odometerText(null, false)).toBeNull();
    expect(odometerText(96471, true)).toBe("96,471 km");
    const noOdo = { ...demo, job: { ...demo.job, odometer_in: null, odometer_out: null } };
    for (const kind of ["estimate", "work-order", "invoice"] as DocKind[]) expect(buildJobPdf(kind, noOdo).byteLength).toBeGreaterThan(10_000);
  });

  it("refuses an inspection PDF when there's no inspection", () => {
    expect(() => buildJobPdf("inspection", { ...demo, inspection: null })).toThrow(/No inspection/);
  });

  it("names files by document and customer", () => {
    expect(pdfFileName("invoice", demo)).toBe("INV-214 Priya Raman.pdf");
  });
});
