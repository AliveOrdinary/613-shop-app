import type { SupabaseClient } from "@supabase/supabase-js";

export type Session = { userId: string; email: string | null };

export async function getSession(sb: SupabaseClient): Promise<Session | null> {
  const { data } = await sb.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { userId: claims.sub, email: (claims.email as string | undefined) ?? null };
}

export async function isStaff(sb: SupabaseClient): Promise<boolean> {
  const { data, error } = await sb.rpc("is_staff");
  return !error && data === true;
}
