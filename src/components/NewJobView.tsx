"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CustomerFields, cleanCustomer, customerProblem } from "./CustomerForm";
import { VehicleFields, cleanVehicle, vehicleProblem, vinTakenMessage } from "./VehicleForm";
import { Button, Card, Field, Input, Notice, NumberInput, PageTitle, Textarea, cx } from "./ui";
import { customerLine, searchText, vehicleLabel } from "@/lib/format";
import { todayLocal } from "@/lib/jobs";
import { supabaseBrowser } from "@/lib/supabase/client";
import { EMPTY_CUSTOMER, EMPTY_VEHICLE, type CustomerDraft, type CustomerWithVehicles, type VehicleDraft } from "@/lib/types";

type Who = { kind: "search" } | { kind: "existing"; id: string } | { kind: "new" };

/** Plate, phone or name: what a search box entry most likely is, to carry it into a new customer */
export function guessEntry(raw: string): { plate?: string; phone?: string; name?: string } {
  const s = raw.trim();
  if (!s) return {};
  const digits = s.replace(/\D/g, "");
  if (/^[\d\s()+.-]+$/.test(s) && digits.length >= 7) return { phone: s };
  const compact = s.replace(/[\s-]/g, "");
  if (/^[A-Za-z0-9]{2,8}$/.test(compact) && /\d/.test(compact) && /[A-Za-z]/.test(compact)) return { plate: s.toUpperCase() };
  return /[A-Za-z]/.test(s) ? { name: s } : {};
}

/** Words of a vehicle a search can hit: its label, plate (with and without spaces) and VIN */
function vehicleText(v: CustomerWithVehicles["vehicles"][number]): string {
  return [vehicleLabel(v), v.plate, v.plate.replace(/\s/g, ""), v.vin ?? ""].join(" ").toLowerCase();
}

/**
 * Check-in: find the customer and car (or enter new ones), the odometer and what the customer
 * wants done, then one button saves it all and opens the job. One screen, one save.
 */
export function NewJobView({
  customers,
  nextNumber,
  initialCustomer,
  initialVehicle,
}: {
  customers: CustomerWithVehicles[];
  nextNumber: number;
  initialCustomer: string | null;
  initialVehicle: string | null;
}) {
  const router = useRouter();
  const start = customers.find((c) => c.id === initialCustomer) ?? null;
  const [who, setWho] = useState<Who>(start ? { kind: "existing", id: start.id } : { kind: "search" });
  const [vehicleId, setVehicleId] = useState<string | "new" | null>(
    start ? (start.vehicles.find((v) => v.id === initialVehicle)?.id ?? (start.vehicles.length === 1 ? start.vehicles[0].id : start.vehicles.length ? null : "new")) : null,
  );
  const [q, setQ] = useState("");
  const [newCustomer, setNewCustomer] = useState<CustomerDraft>(EMPTY_CUSTOMER);
  const [newVehicle, setNewVehicle] = useState<VehicleDraft>(EMPTY_VEHICLE);
  const [odometer, setOdometer] = useState<number | null>(null);
  const [concern, setConcern] = useState("");
  const [older, setOlder] = useState(false);
  const [number, setNumber] = useState<number | null>(null);
  const [date, setDate] = useState(todayLocal());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customer = who.kind === "existing" ? (customers.find((c) => c.id === who.id) ?? null) : null;
  const vehicle = customer && vehicleId && vehicleId !== "new" ? (customer.vehicles.find((v) => v.id === vehicleId) ?? null) : null;
  const addingVehicle = who.kind === "new" || vehicleId === "new";
  const ready = who.kind === "new" || (customer !== null && (vehicle !== null || vehicleId === "new"));

  const words = useMemo(() => q.toLowerCase().split(/\s+/).filter(Boolean), [q]);
  const matches = useMemo(() => {
    if (!words.length) return [];
    return customers.filter((c) => words.every((w) => searchText(c, c.vehicles).includes(w))).slice(0, 8);
  }, [words, customers]);

  function pick(c: CustomerWithVehicles, vId?: string) {
    setWho({ kind: "existing", id: c.id });
    setVehicleId(vId ?? (c.vehicles.length === 1 ? c.vehicles[0].id : c.vehicles.length ? null : "new"));
    setNewVehicle(EMPTY_VEHICLE);
    setError(null);
  }

  function startNew() {
    const g = guessEntry(q);
    setNewCustomer({ ...EMPTY_CUSTOMER, name: g.name ?? "", phone: g.phone ?? "" });
    setNewVehicle({ ...EMPTY_VEHICLE, plate: g.plate ?? "" });
    setWho({ kind: "new" });
    setVehicleId("new");
    setError(null);
  }

  function backToSearch() {
    setWho({ kind: "search" });
    setVehicleId(null);
    setError(null);
  }

  async function create() {
    setError(null);
    const c = who.kind === "new" ? cleanCustomer(newCustomer) : null;
    const v = addingVehicle ? cleanVehicle(newVehicle) : null;
    const problem = (c && customerProblem(c)) || (v && vehicleProblem(v)) || (!addingVehicle && !vehicle ? "Pick which car, or add another." : null);
    if (problem) return setError(problem);

    setBusy(true);
    const vehicleFields = v ? { year: v.year, make: v.make, model: v.model, trim: v.trim, engine: v.engine, vin: v.vin, plate: v.plate, colour: v.colour, notes: v.notes } : null;
    const { data, error: err } = await supabaseBrowser()
      .rpc("check_in", {
        p_customer: customer?.id ?? null,
        p_new_customer: c,
        p_vehicle: vehicle?.id ?? null,
        p_new_vehicle: vehicleFields,
        p_odometer: v ? v.odometer_km : odometer === null ? null : Math.round(odometer),
        p_concern: concern.trim(),
        p_number: older ? number : null,
        p_date: older ? date : todayLocal(),
      })
      .single<{ id: string }>();
    if (err || !data) {
      setBusy(false);
      return setError(vinTakenMessage(err?.message ?? "Couldn't create the job."));
    }
    router.replace(`/jobs/${data.id}`);
    router.refresh();
  }

  const label = older && number ? `EST-${number}` : `EST-${nextNumber}`;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/jobs" className="mb-2 inline-block text-sm text-muted hover:text-ink">
          ← Jobs
        </Link>
        <PageTitle sub={`Customer, car and what they need, then one tap. This will be ${label}.`}>New job</PageTitle>
      </div>

      <Card className="p-4 md:p-5">
        {who.kind === "search" ? (
          <div className="space-y-3">
            <h2 className="font-semibold text-ink">Who&apos;s the customer?</h2>
            <Input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Plate, name or phone"
              autoFocus
              aria-label="Find a customer by plate, name or phone"
              onKeyDown={(e) => {
                if (e.key === "Enter" && words.length && !matches.length) startNew();
              }}
            />
            {matches.length ? (
              <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                {matches.map((c) => {
                  const hits = c.vehicles.filter((v) => words.some((w) => vehicleText(v).includes(w)));
                  return (
                    <div key={c.id} className="px-3 py-3">
                      <button type="button" onClick={() => pick(c, hits.length === 1 ? hits[0].id : undefined)} className="block w-full text-left">
                        <span className="block font-medium text-ink">{c.name}</span>
                        <span className="block truncate text-sm text-muted">{customerLine(c)}</span>
                      </button>
                      {c.vehicles.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {c.vehicles.map((v) => (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => pick(c, v.id)}
                              className={cx(
                                "rounded-lg border px-3 py-1.5 text-left text-sm",
                                hits.includes(v) ? "border-ink bg-brand-soft text-ink" : "border-line text-charcoal hover:border-ink",
                              )}
                            >
                              <span className="font-medium">{v.plate || "No plate"}</span>
                              <span className="text-muted"> · {vehicleLabel(v)}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : words.length ? (
              <p className="text-sm text-muted">No customer or car matches “{q}”.</p>
            ) : (
              <p className="text-sm text-muted">Tap a car to pick the customer and the car at once.</p>
            )}
            <Button variant={words.length && !matches.length ? "primary" : "secondary"} onClick={startNew}>
              {words.length && !matches.length ? `New customer with “${q.trim()}”` : "New customer"}
            </Button>
          </div>
        ) : who.kind === "existing" && customer ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-lg bg-canvas px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{customer.name}</p>
                <p className="truncate text-sm text-muted">{customerLine(customer)}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={backToSearch}>
                Change
              </Button>
            </div>
            <div>
              <p className="mb-2 text-[13px] font-medium text-muted">Which car?</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {customer.vehicles.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVehicleId(v.id)}
                    aria-pressed={vehicleId === v.id}
                    className={cx("rounded-lg border px-3 py-3 text-left", vehicleId === v.id ? "border-ink ring-2 ring-brand" : "border-line hover:border-ink")}
                  >
                    <span className="display block text-ink">{vehicleLabel(v)}</span>
                    <span className="block truncate text-sm text-muted">{[v.plate, v.colour].filter(Boolean).join(" · ") || "No plate"}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setVehicleId("new")}
                  aria-pressed={vehicleId === "new"}
                  className={cx("rounded-lg border border-dashed px-3 py-3 text-left", vehicleId === "new" ? "border-ink ring-2 ring-brand" : "border-line hover:border-ink")}
                >
                  <span className="block font-medium text-ink">+ Another car</span>
                  <span className="block text-sm text-muted">Add a car to {customer.name.split(" ")[0]}</span>
                </button>
              </div>
            </div>
            {vehicleId === "new" ? <VehicleFields value={newVehicle} onChange={setNewVehicle} odometerLabel="Odometer in (km)" showNotes={false} /> : null}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-ink">New customer</h2>
              <Button size="sm" variant="ghost" onClick={backToSearch}>
                Search instead
              </Button>
            </div>
            <CustomerFields value={newCustomer} onChange={setNewCustomer} compact autoFocus={!newCustomer.name} />
            <div className="border-t border-line pt-4">
              <h2 className="mb-3 font-semibold text-ink">Their car</h2>
              <VehicleFields value={newVehicle} onChange={setNewVehicle} odometerLabel="Odometer in (km)" showNotes={false} />
            </div>
          </div>
        )}
      </Card>

      {ready ? (
        <Card className="space-y-4 p-4 md:p-5">
          <h2 className="font-semibold text-ink">The job</h2>
          {vehicle ? (
            <Field label="Odometer in (km)" hint={vehicle.odometer_km !== null ? `Last recorded ${vehicle.odometer_km.toLocaleString("en-CA")} km. Leave blank to use it.` : "Optional."}>
              <NumberInput value={odometer} onValue={setOdometer} inputMode="numeric" min={0} step="1" />
            </Field>
          ) : null}
          <Field label="What the customer wants done" hint="Printed on the estimate and work order. You can add line items on the next screen.">
            <Textarea rows={3} value={concern} onChange={(e) => setConcern(e.target.value)} placeholder="Grinding noise from the front when braking." />
          </Field>

          {older ? (
            <div className="grid grid-cols-2 gap-4 rounded-lg bg-canvas p-3">
              <Field label="Job number" hint={`Leave blank for the next one (${nextNumber}).`}>
                <NumberInput value={number} onValue={setNumber} inputMode="numeric" min={1} step="1" />
              </Field>
              <Field label="Estimate date">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayLocal()} />
              </Field>
            </div>
          ) : null}

          {error ? <Notice tone="bad">{error}</Notice> : null}
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="primary" size="lg" onClick={create} disabled={busy} className="w-full sm:w-auto">
              {busy ? "Creating…" : `Create estimate ${label}`}
            </Button>
            <button type="button" onClick={() => setOlder((o) => !o)} className="text-sm text-muted underline underline-offset-4 hover:text-ink">
              {older ? "Not an older job" : "Entering an older job?"}
            </button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
