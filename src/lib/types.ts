export type ShopSettings = {
  id: 1;
  shop_name: string;
  address_line: string;
  city: string;
  province: string;
  postal_code: string;
  phone: string;
  email: string;
  hst_number: string;
  rate_body: number;
  rate_paint: number;
  rate_mechanical: number;
  paint_markup_pct: number;
  shop_supplies_enabled: boolean;
  shop_supplies_pct: number;
  shop_supplies_cap: number | null;
  hst_rate: number;
  estimate_valid_days: number;
  payment_terms: string;
  warranty_text: string;
  next_job_number: number;
  updated_at: string;
};

export type CustomerKind = "person" | "business";

export type Customer = {
  id: string;
  kind: CustomerKind;
  name: string;
  company: string;
  phone: string;
  email: string;
  address_line: string;
  city: string;
  province: string;
  postal_code: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type Vehicle = {
  id: string;
  customer_id: string;
  year: number | null;
  make: string;
  model: string;
  trim: string;
  vin: string | null;
  plate: string;
  colour: string;
  odometer_km: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type CustomerWithVehicles = Customer & { vehicles: Vehicle[] };

/** Fields a form edits: everything except ids and timestamps. */
export type CustomerDraft = Omit<Customer, "id" | "created_at" | "updated_at">;
export type VehicleDraft = Omit<Vehicle, "id" | "customer_id" | "created_at" | "updated_at">;

export const EMPTY_CUSTOMER: CustomerDraft = {
  kind: "person",
  name: "",
  company: "",
  phone: "",
  email: "",
  address_line: "",
  city: "",
  province: "ON",
  postal_code: "",
  notes: "",
};

export const EMPTY_VEHICLE: VehicleDraft = {
  year: null,
  make: "",
  model: "",
  trim: "",
  vin: null,
  plate: "",
  colour: "",
  odometer_km: null,
  notes: "",
};
