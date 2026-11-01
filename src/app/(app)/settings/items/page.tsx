import { SavedItemsView } from "@/components/SavedItemsView";
import type { Rates, SavedItem } from "@/lib/reuse";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "Saved items · 613 Automotive" };

export default async function SavedItemsPage() {
  const sb = await supabaseServer();
  const [{ data, error }, { data: rates }] = await Promise.all([
    sb.from("saved_items").select("*").order("position").returns<SavedItem[]>(),
    sb.from("shop_settings").select("rate_body, rate_paint, rate_mechanical, paint_markup_pct").eq("id", 1).single<Rates>(),
  ]);
  if (error) throw new Error(`Couldn't load saved items: ${error.message}`);
  if (!rates) throw new Error("Couldn't load the shop settings.");
  return <SavedItemsView initial={data ?? []} rates={rates} />;
}
