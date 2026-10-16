"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Notice } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) return setError(error.message === "Invalid login credentials" ? "That email and password don't match." : error.message);
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen flex-col bg-ink md:flex-row">
      <section className="flex items-center justify-center px-8 pb-8 pt-14 md:w-1/2 md:p-12">
        {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo */}
        <img src="/brand/logo-on-dark.svg" alt="613 Automotive — Automotive refinishing and restoration" width={480} height={140} className="w-full max-w-[380px]" />
      </section>
      <section className="flex flex-1 items-start justify-center rounded-t-3xl bg-canvas px-5 pb-10 pt-8 md:items-center md:rounded-none md:p-12">
        <div className="w-full max-w-sm">
          <h1 className="display text-[28px] text-ink">Sign in</h1>
          <p className="mb-6 text-sm text-muted">Estimates, work orders and invoices.</p>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Email">
              <Input type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password">
              <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {error ? <Notice tone="bad">{error}</Notice> : null}
            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
