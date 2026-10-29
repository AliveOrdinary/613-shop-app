import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { PageSkeleton } from "@/components/Skeletons";
import { SignOutButton } from "@/components/SignOutButton";
import { getSession, isStaff } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * The bar and page frame show straight away; the sign-in and staff checks run inside a
 * loading boundary, so a tap never waits on them before something appears.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-4 pb-28 pt-6 md:pb-12">
        <Suspense fallback={<PageSkeleton />}>
          <StaffOnly>{children}</StaffOnly>
        </Suspense>
      </main>
    </>
  );
}

async function StaffOnly({ children }: { children: React.ReactNode }) {
  const sb = await supabaseServer();
  const session = await getSession(sb);
  if (!session) redirect("/login");

  if (!(await isStaff(sb))) {
    return (
      <div className="mx-auto max-w-md py-10">
        <h1 className="display text-2xl text-ink">Not on the staff list</h1>
        <p className="mt-2 text-sm text-muted">
          You&apos;re signed in as {session.email ?? "this account"}, but it hasn&apos;t been added to the shop&apos;s staff list yet. Ask the
          owner to add you, then sign in again.
        </p>
        <div className="mt-6">
          <SignOutButton />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
