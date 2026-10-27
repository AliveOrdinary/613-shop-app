"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Card, EmptyState, Input, PageTitle } from "./ui";
import { customerLine, searchText, vehicleLabel } from "@/lib/format";
import type { CustomerWithVehicles } from "@/lib/types";

export function CustomersView({ customers }: { customers: CustomerWithVehicles[] }) {
  const [q, setQ] = useState("");

  const indexed = useMemo(() => customers.map((c) => ({ c, text: searchText(c, c.vehicles) })), [customers]);
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return customers;
    return indexed.filter(({ text }) => words.every((w) => text.includes(w))).map(({ c }) => c);
  }, [q, indexed, customers]);

  return (
    <div>
      <PageTitle
        sub={`${customers.length} ${customers.length === 1 ? "customer" : "customers"}`}
        action={
          <div className="flex gap-2">
            <Link href="/customers/new" className="inline-flex h-11 items-center rounded-lg border border-line bg-surface px-4 text-[15px] font-medium text-ink hover:bg-canvas">
              Add customer
            </Link>
            {/* Most visits start a job; check-in adds the customer and car on the way */}
            <Link href="/jobs/new" className="inline-flex h-11 items-center rounded-lg bg-brand px-4 text-[15px] font-medium text-ink hover:bg-brand-hover">
              New job
            </Link>
          </div>
        }
      >
        Customers
      </PageTitle>

      {customers.length > 0 ? (
        <div className="mb-4">
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, phone, plate or VIN"
            aria-label="Search customers"
          />
        </div>
      ) : null}

      {customers.length === 0 ? (
        <EmptyState title="Add your first customer">Customers and their vehicles are saved here, ready for the next visit.</EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState title={`No customer matches “${q}”`}>Try part of a name, the last digits of a phone number, or a plate.</EmptyState>
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {shown.map((c) => (
            <Link key={c.id} href={`/customers/${c.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-canvas">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-ink">{c.name}</span>
                  {c.kind === "business" ? <Badge>Business</Badge> : null}
                </div>
                <p className="truncate text-sm text-muted">{customerLine(c) || "No contact details"}</p>
                {c.vehicles.length > 0 ? (
                  <p className="mt-0.5 truncate text-sm text-charcoal">
                    {c.vehicles
                      .map((v) => [vehicleLabel(v), v.plate].filter(Boolean).join(" · "))
                      .join("  /  ")}
                  </p>
                ) : null}
              </div>
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-faint" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="m9 6 6 6-6 6" />
              </svg>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
