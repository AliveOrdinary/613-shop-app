"use client";

import { useState } from "react";
import { Button, Field, Input, Notice } from "./ui";
import { supabaseBrowser } from "@/lib/supabase/client";

const MIN = 8;

/**
 * Changes the signed-in account's password. Asks for the current one first, so a phone left
 * signed in at the counter can't be used to lock the owner out. Optionally signs every other
 * device out, for when someone who knew the old password has left.
 */
export function ChangePassword({ email }: { email: string | null }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [others, setOthers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function reset() {
    setCurrent("");
    setNext("");
    setAgain("");
    setOthers(false);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email) return setError("Couldn't tell which account is signed in. Sign out and back in, then try again.");
    if (next.length < MIN) return setError(`Use at least ${MIN} characters.`);
    if (next !== again) return setError("The two new passwords don't match.");
    if (next === current) return setError("The new password is the same as the current one.");

    setBusy(true);
    const sb = supabaseBrowser();
    const check = await sb.auth.signInWithPassword({ email, password: current });
    if (check.error) {
      setBusy(false);
      return setError(check.error.message === "Invalid login credentials" ? "The current password isn't right." : check.error.message);
    }
    const { error: updateError } = await sb.auth.updateUser({ password: next });
    if (updateError) {
      setBusy(false);
      return setError(updateError.code === "weak_password" ? "That password is too easy to guess. Try a longer one." : updateError.message);
    }
    if (others) await sb.auth.signOut({ scope: "others" });
    setBusy(false);
    reset();
    setOpen(false);
    setDone(others ? "Password changed, and every other device has been signed out. Sign them back in with the new password." : "Password changed. Use the new one next time you sign in on any device.");
  }

  if (!open) {
    return (
      <div className="space-y-3">
        {done ? <Notice tone="ok">{done}</Notice> : null}
        <Button
          onClick={() => {
            setDone(null);
            setOpen(true);
          }}
        >
          Change password
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Current password">
          <Input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password" hint={`At least ${MIN} characters.`}>
          <Input type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="New password again">
          <Input type="password" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} />
        </Field>
      </div>
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={others} onChange={(e) => setOthers(e.target.checked)} className="mt-0.5 h-5 w-5 accent-ink" />
        <span>
          <span className="block text-sm font-medium text-ink">Also sign out every other phone and computer</span>
          <span className="block text-sm text-muted">Use this when someone who knew the old password has left.</span>
        </span>
      </label>
      {error ? <Notice tone="bad">{error}</Notice> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Changing…" : "Change password"}
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
