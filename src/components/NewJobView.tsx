"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CustomerForm } from "./CustomerForm";
import { VehicleForm } from "./VehicleForm";
import { Button, Card, Field, Input, Notice, NumberInput, PageTitle, cx } from "./ui";
import { customerLine, searchText, vehicleLabel } from "@/lib/format";
import { todayLocal } from "@/lib/jobs";
import { supabaseBrowser } from "@/lib/supabase/client";
import { EMPTY_CUSTOMER, EMPTY_VEHICLE, type CustomerWithVehicles, type Vehicle } from "@/lib/types";

function Step({ n, title, done, children }: { n: number; title: string; done?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <Card className="p-4 md:p-5">
      <div className="flex items-center gap-3">
        <span className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold", done ? "bg-ink text-brand" : "bg-brand text-ink")}>{n}</span>
        <h2 className="font-semibold text-ink">{title}</h2>
      </div>
      {done ? <div className="mt-3">{done}</div> : null}
      {children ? <div className="mt-4">{children}</div> : null}
    </Card>
  );
}

export function NewJobView({
  customers: initialCustomers,
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
  const sb = supabaseBrowser();
  const [customers, setCustomers] = useState(initialCustomers);
  const [customerId, setCustomerId] = useState<string | null>(initialCustomers.some((c) => c.id === initialCustomer) ? initialCustomer : null);
  const [vehicleId, setVehicleId] = useState<string | null>(initialVehicle);
  const [q, setQ] = useState("");
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [older, setOlder] = useState(false);
  const [number, setNumber] = useState<number | null>(null);
  const [date, setDate] = useState(todayLocal());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customer = customers.find((c) => c.id === customerId) ?? null;
  const vehicles = customer?.vehicles ?? [];
  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? null;

  const matches = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return customers.slice(0, 8);
    return customers.filter((c) => words.every((w) => searchText(c, c.vehicles).includes(w))).slice(0, 12);
  }, [q, customers]);

  function pickCustomer(c: CustomerWithVehicles) {
    setCustomerId(c.id);
    setVehicleId(c.vehicles.length === 1 ? c.vehicles[0].id : null);
    setAddingVehicle(c.vehicles.length === 0);
  }

  async function create() {
    if (!customer || !vehicle) return;
    setBusy(true);
    setError(null);
    const { data, error } = await sb
      .rpc("create_job", {
        p_customer: customer.id,
        p_vehicle: vehicle.id,
        p_number: older ? number : null,
        p_date: older ? date : todayLocal(),
      })
      .single<{ id: string }>();
    if (error || !data) {
      setBusy(false);
      return setError(error?.message ?? "Couldn't create the job.");
    }
    router.replace(`/jobs/${data.id}`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/jobs" className="mb-2 inline-block text-sm text-muted hover:text-ink">
          ← Jobs
        </Link>
        <PageTitle sub={older ? undefined : `This will be EST-${nextNumber}.`}>New job</PageTitle>
      </div>

      <Step
        n={1}
        title="Customer"
        done={
          customer ? (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-canvas px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{customer.name}</p>
                <p className="truncate text-sm text-muted">{customerLine(customer)}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => { setCustomerId(null); setVehicleId(null); setAddingVehicle(false); }}>
                Change
              </Button>
            </div>
          ) : null
        }
      >
        {customer ? null : addingCustomer ? (
          <CustomerForm
            initial={EMPTY_CUSTOMER}
            submitLabel="Save customer"
            onCancel={() => setAddingCustomer(false)}
            onSubmit={async (d) => {
              const { data, error } = await sb.from("customers").insert(d).select("*").single<CustomerWithVehicles>();
              if (error || !data) return `Couldn't save: ${error?.message ?? "unknown error"}`;
              const added = { ...data, vehicles: [] };
              setCustomers((cs) => [added, ...cs]);
              setAddingCustomer(false);
              pickCustomer(added);
              return null;
            }}
          />
        ) : (
          <div className="space-y-3">
            <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, plate or VIN" autoFocus aria-label="Search customers" />
            {matches.length ? (
              <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                {matches.map((c) => (
                  <button key={c.id} onClick={() => pickCustomer(c)} className="block w-full px-3 py-3 text-left hover:bg-canvas">
                    <span className="block font-medium text-ink">{c.name}</span>
                    <span className="block truncate text-sm text-muted">
                      {[customerLine(c), ...c.vehicles.map((v) => [vehicleLabel(v), v.plate].filter(Boolean).join(" "))].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                ))}
              </div>
            ) : q ? (
              <p className="text-sm text-muted">No customer matches “{q}”.</p>
            ) : null}
            <Button onClick={() => setAddingCustomer(true)}>New customer</Button>
          </div>
        )}
      </Step>

      {customer ? (
        <Step
          n={2}
          title="Vehicle"
          done={
            vehicle && !addingVehicle ? (
              <div className="flex items-center justify-between gap-3 rounded-lg bg-canvas px-3 py-2.5">
                <div className="min-w-0">
                  <p className="display truncate text-ink">{vehicleLabel(vehicle)}</p>
                  <p className="truncate text-sm text-muted">{[vehicle.plate, vehicle.colour, vehicle.vin].filter(Boolean).join(" · ")}</p>
                </div>
                {vehicles.length > 1 ? (
                  <Button size="sm" variant="ghost" onClick={() => setVehicleId(null)}>
                    Change
                  </Button>
                ) : null}
              </div>
            ) : null
          }
        >
          {vehicle && !addingVehicle ? null : addingVehicle ? (
            <VehicleForm
              initial={EMPTY_VEHICLE}
              submitLabel="Save vehicle"
              onCancel={() => setAddingVehicle(false)}
              onSubmit={async (d) => {
                const { data, error } = await sb.from("vehicles").insert({ ...d, customer_id: customer.id }).select("*").single<Vehicle>();
                if (error || !data) return `Couldn't save: ${error?.message ?? "unknown error"}`;
                setCustomers((cs) => cs.map((c) => (c.id === customer.id ? { ...c, vehicles: [...c.vehicles, data] } : c)));
                setVehicleId(data.id);
                setAddingVehicle(false);
                return null;
              }}
            />
          ) : (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                {vehicles.map((v) => (
                  <button key={v.id} onClick={() => setVehicleId(v.id)} className="rounded-lg border border-line px-3 py-3 text-left hover:border-ink">
                    <span className="display block text-ink">{vehicleLabel(v)}</span>
                    <span className="block truncate text-sm text-muted">{[v.plate, v.colour].filter(Boolean).join(" · ") || "No plate"}</span>
                  </button>
                ))}
              </div>
              <Button onClick={() => setAddingVehicle(true)}>Add a vehicle</Button>
            </div>
          )}
        </Step>
      ) : null}

      {customer && vehicle && !addingVehicle ? (
        <Card className="p-4 md:p-5">
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={older} onChange={(e) => setOlder(e.target.checked)} className="mt-0.5 h-5 w-5 accent-ink" />
            <span>
              <span className="block font-medium text-ink">Entering an older job</span>
              <span className="block text-sm text-muted">Set its own number and date, for work done before the app.</span>
            </span>
          </label>
          {older ? (
            <div className="mt-4 grid grid-cols-2 gap-4">
              <Field label="Job number" hint={`Leave blank for the next one (${nextNumber}).`}>
                <NumberInput value={number} onValue={setNumber} inputMode="numeric" min={1} step="1" />
              </Field>
              <Field label="Estimate date">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayLocal()} />
              </Field>
            </div>
          ) : null}
          {error ? <div className="mt-4"><Notice tone="bad">{error}</Notice></div> : null}
          <div className="mt-5">
            <Button variant="primary" size="lg" onClick={create} disabled={busy} className="w-full sm:w-auto">
              {busy ? "Creating…" : older && number ? `Create EST-${number}` : `Create EST-${nextNumber}`}
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
