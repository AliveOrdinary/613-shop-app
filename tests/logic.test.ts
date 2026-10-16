import { describe, expect, it } from "vitest";
import { formatPhone, formatPostal, money, vehicleLabel } from "@/lib/format";
import { checkVin, normalizeVin, vinModelYear } from "@/lib/vin";

describe("VIN", () => {
  it("normalizes spacing and case, and treats blank as no VIN", () => {
    expect(normalizeVin(" 1m8gdm9a-xkp042788 ")).toBe("1M8GDM9AXKP042788");
    expect(normalizeVin("  ")).toBeNull();
  });

  it("accepts a VIN with a correct check digit", () => {
    expect(checkVin("1M8GDM9AXKP042788")).toEqual({ ok: true, checkDigitOk: true });
  });

  it("flags a bad check digit without rejecting the VIN", () => {
    expect(checkVin("1M8GDM9A1KP042788")).toEqual({ ok: true, checkDigitOk: false });
  });

  it("rejects the wrong length and the letters VINs never use", () => {
    expect(checkVin("1M8GDM9AXKP04278").ok).toBe(false);
    expect(checkVin("1M8GDM9AXKP04278O").ok).toBe(false);
  });

  it("reads the model year from the 10th character", () => {
    const now = new Date("2026-10-16");
    expect(vinModelYear("2T3P1RFV8MW123456", now)).toBe(2021);
    expect(vinModelYear("1M8GDM9AXKP042788", now)).toBe(2019);
    expect(vinModelYear("1M8GDM9AXTP042788", now)).toBe(2026);
  });
});

describe("formatting", () => {
  it("formats North American phone numbers and leaves others alone", () => {
    expect(formatPhone("(613) 555 0100")).toBe("613-555-0100");
    expect(formatPhone("+1 437 457 2268")).toBe("437-457-2268");
    expect(formatPhone("+44 20 7946 0958")).toBe("+44 20 7946 0958");
  });

  it("formats Canadian postal codes", () => {
    expect(formatPostal("k7m5w3")).toBe("K7M 5W3");
  });

  it("labels vehicles without blanks", () => {
    expect(vehicleLabel({ year: 2021, make: "Toyota", model: "RAV4", trim: "" })).toBe("2021 Toyota RAV4");
    expect(vehicleLabel({ year: null, make: "", model: "", trim: "" })).toBe("Vehicle");
  });

  it("formats money in Canadian dollars", () => {
    expect(money(2525.5)).toBe("$2,525.50");
  });
});
