import { describe, expect, it } from "vitest";
import { brandName, engineLine, fromDecode, lookupLabel, type VpicDecode } from "@/lib/vpic";

// Trimmed from real DecodeVinValues responses (Oct 2026)
const civic: VpicDecode = {
  Make: "HONDA",
  Model: "Civic",
  ModelYear: "2018",
  Trim: "LX",
  DisplacementL: "2.0",
  EngineCylinders: "4",
  EngineConfiguration: "In-Line",
  FuelTypePrimary: "Gasoline",
  DriveType: "4x2",
  ErrorCode: "0",
};
const rav4: VpicDecode = {
  Make: "TOYOTA",
  Model: "RAV4",
  ModelYear: "2021",
  Trim: "XLE",
  DisplacementL: "2.5",
  EngineCylinders: "4",
  EngineConfiguration: "In-Line",
  FuelTypePrimary: "Gasoline",
  DriveType: "4WD/4-Wheel Drive/4x4",
  ErrorCode: "0",
};

describe("VIN lookup", () => {
  it("turns a decode into the form's fields", () => {
    expect(fromDecode(civic)).toEqual({ year: 2018, make: "Honda", model: "Civic", trim: "LX", engine: "2.0L 4-cyl" });
    expect(fromDecode(rav4)).toEqual({ year: 2021, make: "Toyota", model: "RAV4", trim: "XLE", engine: "2.5L 4-cyl · 4WD" });
    expect(lookupLabel(fromDecode(rav4)!)).toBe("2021 Toyota RAV4 XLE · 2.5L 4-cyl · 4WD");
  });

  it("ignores Series, which is often a factory code rather than a trim", () => {
    expect(fromDecode({ ...rav4, Trim: "", ...({ Series: "AXAA52L / AXAA54L" } as VpicDecode) })?.trim).toBe("");
  });

  it("returns nothing when the VIN is unknown", () => {
    expect(fromDecode({ Make: "", Model: "", ModelYear: "", ErrorCode: "1,7,11" })).toBeNull();
  });

  it("writes brand names the way they're printed", () => {
    expect(brandName("MERCEDES-BENZ")).toBe("Mercedes-Benz");
    expect(brandName("LAND ROVER")).toBe("Land Rover");
    expect(brandName("BMW")).toBe("BMW");
    expect(brandName("GMC")).toBe("GMC");
    expect(brandName("KIA")).toBe("Kia");
  });

  it("describes V engines, hybrids, diesels and electrics", () => {
    expect(engineLine({ DisplacementL: "3.5", EngineCylinders: "6", EngineConfiguration: "V-Shaped", DriveType: "AWD/All-Wheel Drive" })).toBe("3.5L V6 · AWD");
    expect(engineLine({ DisplacementL: "2.5", EngineCylinders: "4", ElectrificationLevel: "Strong HEV (Hybrid Electric Vehicle)", DriveType: "FWD/Front-Wheel Drive" })).toBe("2.5L 4-cyl Hybrid · FWD");
    expect(engineLine({ DisplacementL: "2.0", EngineCylinders: "4", ElectrificationLevel: "PHEV (Plug-in Hybrid Electric Vehicle)" })).toBe("2.0L 4-cyl Plug-in hybrid");
    expect(engineLine({ DisplacementL: "6.7", EngineCylinders: "8", EngineConfiguration: "V-Shaped", FuelTypePrimary: "Diesel", DriveType: "4WD/4-Wheel Drive/4x4" })).toBe("6.7L V8 Diesel · 4WD");
    expect(engineLine({ FuelTypePrimary: "Electric", ElectrificationLevel: "BEV (Battery Electric Vehicle)", DriveType: "AWD/All-Wheel Drive" })).toBe("Electric · AWD");
    expect(engineLine({})).toBe("");
  });
});
