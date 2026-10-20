// NHTSA's free vehicle database (vPIC): VIN decoding and model lists. No key needed, and it
// allows calls straight from the browser. https://vpic.nhtsa.dot.gov/api/
// It's U.S. data: mainstream cars sold in Canada decode, Canada-only models may not.

const BASE = "https://vpic.nhtsa.dot.gov/api/vehicles";

export type VinLookup = { year: number | null; make: string; model: string; trim: string; engine: string };

/** The fields of one DecodeVinValues result this app uses. vPIC returns "" for unknowns. */
export type VpicDecode = Partial<
  Record<
    "Make" | "Model" | "ModelYear" | "Trim" | "DisplacementL" | "EngineCylinders" | "EngineConfiguration" | "FuelTypePrimary" | "ElectrificationLevel" | "DriveType" | "ErrorCode",
    string | null
  >
>;

/** Brands written in capitals; everything else is title case ("HONDA" → "Honda") */
const CAPS = new Set(["BMW", "GMC", "MINI", "AMC", "SRT"]);

export function brandName(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (CAPS.has(s.toUpperCase())) return s.toUpperCase();
  return s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase());
}

/** "4WD/4-Wheel Drive/4x4" → "4WD". "4x2" says nothing useful about which wheels, so it's left out. */
function driveShort(raw: string): string {
  const first = raw.split("/")[0].trim().toUpperCase();
  return ["AWD", "4WD", "FWD", "RWD"].includes(first) ? first : "";
}

/** A short engine line for parts lookups: "2.0L 4-cyl · FWD", "3.5L V6 · AWD", "Electric · AWD". */
export function engineLine(r: VpicDecode): string {
  const parts: string[] = [];
  const elec = (r.ElectrificationLevel ?? "").toUpperCase();
  const fuel = (r.FuelTypePrimary ?? "").toLowerCase();
  const isElectric = elec.startsWith("BEV") || (fuel === "electric" && !r.DisplacementL);

  if (isElectric) {
    parts.push("Electric");
  } else {
    const litres = Number(r.DisplacementL);
    const cyl = Number(r.EngineCylinders);
    const size = litres > 0 ? `${litres.toFixed(1)}L` : "";
    const vee = (r.EngineConfiguration ?? "").toLowerCase().startsWith("v");
    const cylinders = cyl > 0 ? (vee ? `V${cyl}` : `${cyl}-cyl`) : "";
    const engine = [size, cylinders].filter(Boolean).join(" ");
    const extra = elec.startsWith("PHEV") ? "Plug-in hybrid" : elec.includes("HEV") ? "Hybrid" : fuel.includes("diesel") ? "Diesel" : "";
    const first = [engine, extra].filter(Boolean).join(" ");
    if (first) parts.push(first);
  }
  const drive = driveShort(r.DriveType ?? "");
  if (drive && parts.length) parts.push(drive);
  return parts.join(" · ");
}

/** Turns one decode into the vehicle form's fields. Null when vPIC knew nothing useful. */
export function fromDecode(r: VpicDecode): VinLookup | null {
  const make = brandName(r.Make ?? "");
  const model = (r.Model ?? "").trim();
  if (!make && !model) return null;
  const year = Number(r.ModelYear);
  return {
    year: Number.isInteger(year) && year > 1900 ? year : null,
    make,
    model,
    // Only the Trim field: Series is often a factory code ("AXAA52L / AXAA54L") rather than a trim
    trim: (r.Trim ?? "").trim(),
    engine: engineLine(r),
  };
}

export function lookupLabel(l: VinLookup): string {
  return [[l.year, l.make, l.model, l.trim].filter(Boolean).join(" "), l.engine].filter(Boolean).join(" · ");
}

export async function decodeVin(vin: string, signal?: AbortSignal): Promise<VinLookup | null> {
  const res = await fetch(`${BASE}/DecodeVinValues/${encodeURIComponent(vin)}?format=json`, { signal });
  if (!res.ok) throw new Error(`VIN lookup failed (${res.status})`);
  const body = (await res.json()) as { Results?: VpicDecode[] };
  const first = body.Results?.[0];
  return first ? fromDecode(first) : null;
}

const TYPES = ["passenger car", "multipurpose passenger vehicle (mpv)", "truck"];

/** Car, SUV/van and pickup models for a make and year, sorted. Motorcycles and trailers left out. */
export async function modelsFor(make: string, year: number, signal?: AbortSignal): Promise<string[]> {
  const lists = await Promise.all(
    TYPES.map(async (t) => {
      const url = `${BASE}/GetModelsForMakeYear/make/${encodeURIComponent(make.trim().toLowerCase())}/modelyear/${year}/vehicletype/${encodeURIComponent(t)}?format=json`;
      const res = await fetch(url, { signal });
      if (!res.ok) return [];
      const body = (await res.json()) as { Results?: { Model_Name?: string }[] };
      return (body.Results ?? []).map((m) => (m.Model_Name ?? "").trim()).filter(Boolean);
    }),
  );
  return [...new Set(lists.flat())].sort((a, b) => a.localeCompare(b));
}

/** Brands seen in Canadian shops, for the make field's suggestions. Anything else can still be typed. */
export const MAKES = [
  "Acura", "Alfa Romeo", "Aston Martin", "Audi", "Bentley", "BMW", "Buick", "Cadillac", "Chevrolet", "Chrysler",
  "Dodge", "Ferrari", "Fiat", "Ford", "Genesis", "GMC", "Honda", "Hummer", "Hyundai", "Infiniti", "Jaguar", "Jeep",
  "Kia", "Lamborghini", "Land Rover", "Lexus", "Lincoln", "Lucid", "Maserati", "Mazda", "McLaren", "Mercedes-Benz",
  "Mercury", "MINI", "Mitsubishi", "Nissan", "Polestar", "Pontiac", "Porsche", "Ram", "Rivian", "Rolls-Royce", "Saab",
  "Saturn", "Scion", "Smart", "Subaru", "Suzuki", "Tesla", "Toyota", "Volkswagen", "Volvo",
];
