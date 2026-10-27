import { describe, expect, it } from "vitest";
import { guessEntry } from "@/components/NewJobView";

describe("check-in search carries the entry into a new customer", () => {
  it("reads plates", () => {
    expect(guessEntry("cnrt 482")).toEqual({ plate: "CNRT 482" });
    expect(guessEntry("BXRT552")).toEqual({ plate: "BXRT552" });
    expect(guessEntry("ab-12-cd")).toEqual({ plate: "AB-12-CD" });
  });
  it("reads phone numbers", () => {
    expect(guessEntry("613-555-0187")).toEqual({ phone: "613-555-0187" });
    expect(guessEntry("(613) 555 0187")).toEqual({ phone: "(613) 555 0187" });
  });
  it("reads names, and leaves anything else alone", () => {
    expect(guessEntry("Daniel Okafor")).toEqual({ name: "Daniel Okafor" });
    expect(guessEntry("Okafor")).toEqual({ name: "Okafor" });
    expect(guessEntry("123")).toEqual({});
    expect(guessEntry("  ")).toEqual({});
  });
});
