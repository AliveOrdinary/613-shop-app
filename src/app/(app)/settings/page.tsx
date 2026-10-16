import { SettingsView } from "@/components/SettingsView";
import { supabaseServer } from "@/lib/supabase/server";
import type { ShopSettings } from "@/lib/types";

export const metadata = { title: "Settings · 613 Automotive" };

export default async function SettingsPage() {
  const sb = await supabaseServer();
  const { data, error } = await sb.from("shop_settings").select("*").eq("id", 1).single<ShopSettings>();
  if (error || !data) throw new Error(`Couldn't load shop settings: ${error?.message ?? "no row"}`);
  const { data: claims } = await sb.auth.getClaims();
  return <SettingsView initial={data} email={(claims?.claims.email as string | undefined) ?? null} />;
}
