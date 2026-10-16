"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CustomerForm } from "@/components/CustomerForm";
import { Card, PageTitle } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { EMPTY_CUSTOMER } from "@/lib/types";

export default function NewCustomerPage() {
  const router = useRouter();
  return (
    <div>
      <Link href="/customers" className="mb-2 inline-block text-sm text-muted hover:text-ink">
        ← Customers
      </Link>
      <PageTitle sub="You can add their vehicle on the next screen.">New customer</PageTitle>
      <Card className="p-4 md:p-5">
        <CustomerForm
          initial={EMPTY_CUSTOMER}
          submitLabel="Save customer"
          onCancel={() => router.push("/customers")}
          onSubmit={async (d) => {
            const { data, error } = await supabaseBrowser().from("customers").insert(d).select("id").single<{ id: string }>();
            if (error || !data) return `Couldn't save: ${error?.message ?? "unknown error"}`;
            router.replace(`/customers/${data.id}?added=1`);
            router.refresh();
            return null;
          }}
        />
      </Card>
    </div>
  );
}
