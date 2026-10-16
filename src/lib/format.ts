import type { Customer, Vehicle } from "./types";

const CAD = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });

export function money(n: number | null | undefined): string {
  return CAD.format(n ?? 0);
}

/** "2021 Toyota RAV4 XLE", skipping blanks. */
export function vehicleLabel(v: Pick<Vehicle, "year" | "make" | "model" | "trim">): string {
  return [v.year, v.make, v.model, v.trim].filter((p) => p !== null && String(p).trim() !== "").join(" ") || "Vehicle";
}

/** One line of contact detail for a list row. */
export function customerLine(c: Pick<Customer, "phone" | "email" | "company" | "kind">): string {
  return [c.kind === "business" ? c.company : "", c.phone, c.email].filter(Boolean).join(" · ");
}

/** Digits only, formatted as 613-555-0100 when it is a 10-digit North American number. */
export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  if (ten.length !== 10) return raw.trim();
  return `${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/** Canadian postal code as "K7M 5W3". Leaves anything else as typed. */
export function formatPostal(raw: string): string {
  const s = raw.replace(/\s/g, "").toUpperCase();
  return /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(s) ? `${s.slice(0, 3)} ${s.slice(3)}` : raw.trim().toUpperCase();
}

/** Lower-case text a search box can match against: name, phone digits, plates, VINs. */
export function searchText(c: Customer, vehicles: Vehicle[]): string {
  const parts = [c.name, c.company, c.email, c.phone, c.phone.replace(/\D/g, "")];
  for (const v of vehicles) parts.push(vehicleLabel(v), v.plate, v.plate.replace(/\s/g, ""), v.vin ?? "");
  return parts.join(" ").toLowerCase();
}
