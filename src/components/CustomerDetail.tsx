"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CustomerForm } from "./CustomerForm";
import { VehicleForm } from "./VehicleForm";
import { Badge, Button, Card, EmptyState, PageTitle, SectionTitle } from "./ui";
import { vehicleLabel } from "@/lib/format";
import { STATUS_LABEL, STATUS_TONE, formatDate, jobNumber } from "@/lib/jobs";
import { supabaseBrowser } from "@/lib/supabase/client";
import { EMPTY_VEHICLE, type CustomerDraft, type CustomerWithVehicles, type Job, type Vehicle, type VehicleDraft } from "@/lib/types";

function draftOf(c: CustomerWithVehicles): CustomerDraft {
  const { kind, name, company, phone, email, address_line, city, province, postal_code, notes } = c;
  return { kind, name, company, phone, email, address_line, city, province, postal_code, notes };
}

function vehicleDraftOf(v: Vehicle): VehicleDraft {
  const { year, make, model, trim, engine, vin, plate, colour, odometer_km, notes } = v;
  return { year, make, model, trim, engine, vin, plate, colour, odometer_km, notes };
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

export type CustomerJob = Pick<Job, "id" | "number" | "status" | "vehicle_id" | "estimate_date" | "invoice_date">;

export function CustomerDetail({ customer, jobs, justAdded }: { customer: CustomerWithVehicles; jobs: CustomerJob[]; justAdded: boolean }) {
  const router = useRouter();
  const sb = supabaseBrowser();
  const [editing, setEditing] = useState(false);
  // "new" = adding a vehicle; an id = editing that vehicle. A new customer opens straight on adding one.
  const [vehicleOpen, setVehicleOpen] = useState<string | null>(justAdded && customer.vehicles.length === 0 ? "new" : null);
  const [deleting, setDeleting] = useState(false);

  const hasAddress = Boolean(customer.address_line || customer.city || customer.postal_code);
  const address = hasAddress
    ? [customer.address_line, [customer.city, customer.province].filter(Boolean).join(", "), customer.postal_code].filter(Boolean).join(" · ")
    : "";

  async function done() {
    setEditing(false);
    setVehicleOpen(null);
    router.refresh();
  }

  async function removeCustomer() {
    const n = customer.vehicles.length;
    const ok = window.confirm(`Delete ${customer.name}${n ? ` and ${n === 1 ? "their vehicle" : `their ${n} vehicles`}` : ""}? This can't be undone.`);
    if (!ok) return;
    setDeleting(true);
    const { error } = await sb.from("customers").delete().eq("id", customer.id);
    setDeleting(false);
    if (error) {
      return window.alert(
        error.code === "23503" ? "This customer has jobs on file, which are tax records, so they can't be deleted." : `Couldn't delete: ${error.message}`,
      );
    }
    router.replace("/customers");
    router.refresh();
  }

  async function removeVehicle(v: Vehicle) {
    if (!window.confirm(`Remove the ${vehicleLabel(v)}? This can't be undone.`)) return;
    const { error } = await sb.from("vehicles").delete().eq("id", v.id);
    if (error) {
      return window.alert(error.code === "23503" ? "This vehicle has jobs on file, so it can't be removed." : `Couldn't remove: ${error.message}`);
    }
    router.refresh();
  }

  return (
    <div>
      <Link href="/customers" className="mb-2 inline-block text-sm text-muted hover:text-ink">
        ← Customers
      </Link>
      <PageTitle sub={customer.kind === "business" && customer.company ? customer.company : undefined}>
        <span className="flex items-center gap-3">
          {customer.name}
          {customer.kind === "business" ? <Badge className="not-italic">Business</Badge> : null}
        </span>
      </PageTitle>

      <Card className="mb-6 p-4 md:p-5">
        {editing ? (
          <CustomerForm
            initial={draftOf(customer)}
            submitLabel="Save changes"
            onCancel={() => setEditing(false)}
            onSubmit={async (d) => {
              const { error } = await sb.from("customers").update(d).eq("id", customer.id);
              if (error) return `Couldn't save: ${error.message}`;
              await done();
              return null;
            }}
          />
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <dl className="grid flex-1 gap-3 sm:grid-cols-2">
              <Detail label="Phone">{customer.phone ? <a href={`tel:${customer.phone}`} className="underline decoration-line underline-offset-4">{customer.phone}</a> : "—"}</Detail>
              <Detail label="Email">{customer.email ? <a href={`mailto:${customer.email}`} className="underline decoration-line underline-offset-4">{customer.email}</a> : "—"}</Detail>
              <Detail label="Address">{address || "—"}</Detail>
              {customer.notes ? <Detail label="Notes">{customer.notes}</Detail> : null}
            </dl>
            <Button size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
          </div>
        )}
      </Card>

      <SectionTitle
        action={
          vehicleOpen !== "new" ? (
            <Button size="sm" onClick={() => setVehicleOpen("new")}>
              Add vehicle
            </Button>
          ) : null
        }
      >
        Vehicles
      </SectionTitle>

      <div className="space-y-3">
        {vehicleOpen === "new" ? (
          <Card className="p-4 md:p-5">
            <h3 className="mb-4 font-semibold text-ink">{justAdded && customer.vehicles.length === 0 ? "Add their vehicle" : "New vehicle"}</h3>
            <VehicleForm
              initial={EMPTY_VEHICLE}
              submitLabel="Save vehicle"
              onCancel={() => setVehicleOpen(null)}
              onSubmit={async (d) => {
                const { error } = await sb.from("vehicles").insert({ ...d, customer_id: customer.id });
                if (error) return `Couldn't save: ${error.message}`;
                await done();
                return null;
              }}
            />
          </Card>
        ) : null}

        {customer.vehicles.length === 0 && vehicleOpen !== "new" ? <EmptyState title="No vehicles yet">Add the vehicle you&apos;re writing the estimate for.</EmptyState> : null}

        {customer.vehicles.map((v) =>
          vehicleOpen === v.id ? (
            <Card key={v.id} className="p-4 md:p-5">
              <h3 className="mb-4 font-semibold text-ink">Edit {vehicleLabel(v)}</h3>
              <VehicleForm
                initial={vehicleDraftOf(v)}
                submitLabel="Save changes"
                onCancel={() => setVehicleOpen(null)}
                onSubmit={async (d) => {
                  const { error } = await sb.from("vehicles").update(d).eq("id", v.id);
                  if (error) return `Couldn't save: ${error.message}`;
                  await done();
                  return null;
                }}
              />
            </Card>
          ) : (
            <Card key={v.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="display text-lg leading-tight text-ink">{vehicleLabel(v)}</p>
                <p className="mt-1 text-sm text-muted">
                  {[v.plate && `Plate ${v.plate}`, v.colour, v.engine, v.odometer_km !== null && `${v.odometer_km.toLocaleString("en-CA")} km`].filter(Boolean).join(" · ") || "No plate or colour yet"}
                </p>
                {v.vin ? <p className="mt-1 font-mono text-sm tracking-wider text-charcoal">{v.vin}</p> : null}
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/jobs/new?customer=${customer.id}&vehicle=${v.id}`}
                  className="inline-flex h-9 items-center rounded-lg bg-brand px-3 text-sm font-medium text-ink hover:bg-brand-hover"
                >
                  New job
                </Link>
                <Button size="sm" onClick={() => setVehicleOpen(v.id)}>
                  Edit
                </Button>
                <Button size="sm" variant="dangerGhost" onClick={() => removeVehicle(v)}>
                  Remove
                </Button>
              </div>
            </Card>
          ),
        )}
      </div>

      {jobs.length ? (
        <div className="mt-8">
          <SectionTitle>Jobs</SectionTitle>
          <Card className="divide-y divide-line overflow-hidden">
            {jobs.map((j) => {
              const v = customer.vehicles.find((x) => x.id === j.vehicle_id);
              return (
                <Link key={j.id} href={`/jobs/${j.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas">
                  <span className="display tabular w-[88px] shrink-0 text-ink">{jobNumber(j)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted">
                    {[v ? vehicleLabel(v) : null, formatDate(j.invoice_date ?? j.estimate_date)].filter(Boolean).join(" · ")}
                  </span>
                  <Badge tone={STATUS_TONE[j.status]}>{STATUS_LABEL[j.status]}</Badge>
                </Link>
              );
            })}
          </Card>
        </div>
      ) : null}

      <div className="mt-10 border-t border-line pt-5">
        <Button variant="danger" size="sm" onClick={removeCustomer} disabled={deleting}>
          {deleting ? "Deleting…" : "Delete customer"}
        </Button>
      </div>
    </div>
  );
}
