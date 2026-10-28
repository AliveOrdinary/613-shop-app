import { describe, expect, it } from "vitest";
import { reuseLines, toReusable, type ReusableLine } from "@/lib/reuse";

const rates = { rate_body: 110, rate_paint: 115, rate_mechanical: 130, paint_markup_pct: 35 };

const old: ReusableLine[] = [
  { kind: "labour_mechanical", description: " Replace front pads and rotors ", quantity: 1.5, unit_price: 120, markup_pct: 0, part_condition: null, oem: null, part_number: "" },
  { kind: "part", description: "Front rotors", quantity: 2, unit_price: 74.5, markup_pct: 0, part_condition: "used", oem: true, part_number: " R-77 " },
  { kind: "paint_materials", description: "Paint and materials", quantity: 1, unit_price: 210, markup_pct: 25, part_condition: null, oem: null, part_number: "" },
  { kind: "fee", description: "Disposal", quantity: 1, unit_price: 15, markup_pct: 0, part_condition: null, oem: null, part_number: "" },
];

describe("reusing lines on another job", () => {
  const rows = reuseLines(old, rates, "job-1", 4);

  it("keeps hours, quantities, part details and prices", () => {
    expect(rows[0]).toMatchObject({ kind: "labour_mechanical", description: "Replace front pads and rotors", quantity: 1.5 });
    expect(rows[1]).toMatchObject({ quantity: 2, unit_price: 74.5, part_condition: "used", oem: true, part_number: "R-77" });
    expect(rows[3]).toMatchObject({ unit_price: 15 });
  });

  it("takes labour rates and the paint markup from today's settings", () => {
    expect(rows[0].unit_price).toBe(130);
    expect(rows[2]).toMatchObject({ unit_price: 210, markup_pct: 35 });
  });

  it("numbers the lines after the job's own and puts them on the job", () => {
    expect(rows.map((r) => r.position)).toEqual([5, 6, 7, 8]);
    expect(rows.every((r) => r.job_id === "job-1")).toBe(true);
  });

  it("saves only what matters about a line", () => {
    const withExtras = { ...old[0], id: "x", job_id: "y", position: 3, created_at: "", updated_at: "" } as ReusableLine;
    expect(Object.keys(toReusable(withExtras)).sort()).toEqual(["description", "kind", "markup_pct", "oem", "part_condition", "part_number", "quantity", "unit_price"]);
    // Part details are dropped from lines that aren't parts
    expect(toReusable({ ...old[3], part_number: "junk", oem: true })).toMatchObject({ part_number: "", oem: null, part_condition: null });
  });
});
