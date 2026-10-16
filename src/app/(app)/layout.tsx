import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { SignOutButton } from "@/components/SignOutButton";
import { getSession, isStaff } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const sb = await supabaseServer();
  const session = await getSession(sb);
  if (!session) redirect("/login");

  if (!(await isStaff(sb))) {
    return (
      <main className="mx-auto max-w-md px-5 py-16">
        <h1 className="display text-2xl text-ink">Not on the staff list</h1>
        <p className="mt-2 text-sm text-muted">
          You&apos;re signed in as {session.email ?? "this account"}, but it hasn&apos;t been added to the shop&apos;s staff list yet. Ask the
          owner to add you, then sign in again.
        </p>
        <div className="mt-6">
          <SignOutButton />
        </div>
      </main>
    );
  }

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-4 pb-28 pt-6 md:pb-12">{children}</main>
    </>
  );
}
