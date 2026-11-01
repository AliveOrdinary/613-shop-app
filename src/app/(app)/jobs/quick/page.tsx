import { QuickSaleView, type QuickSettings } from "@/components/QuickSaleView";
import type { SavedItem } from "@/lib/reuse";
import { supabaseServer } from "@/lib/supabase/server";
import type { CustomerWithVehicles } from "@/lib/types";

export const metadata = { title: "Quick sale · 613 Automotive" };

export default async function QuickSalePage() {
  const sb = await supabaseServer();
  const [{ data, error }, { data: s }, { data: saved }] = await Promise.all([
    sb.from("customers").select("*, vehicles(*)").order("name").range(0, 1999).returns<CustomerWithVehicles[]>(),
    sb
      .from("shop_settings")
      .select("next_job_number, hst_rate, shop_supplies_enabled, shop_supplies_pct, shop_supplies_cap, rate_body, rate_paint, rate_mechanical, paint_markup_pct")
      .eq("id", 1)
      .single<QuickSettings & { next_job_number: number }>(),
    sb.from("saved_items").select("*").order("position").returns<SavedItem[]>(),
  ]);
  if (error) throw new Error(`Couldn't load customers: ${error.message}`);
  if (!s) throw new Error("Couldn't load the shop settings.");
  return <QuickSaleView customers={data ?? []} savedItems={saved ?? []} settings={s} nextNumber={s.next_job_number} />;
}
