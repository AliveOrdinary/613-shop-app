"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "./supabase/client";

export type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Collects field changes for one row and writes them after a short pause, so typing on a
 * tablet doesn't send a request per key. `flush` writes immediately (call it before a
 * status change or when leaving the page).
 */
export function useAutosave(table: "jobs" | "job_lines", id: string, delay = 700) {
  const pending = useRef<Record<string, unknown>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length === 0) return true;
    setState("saving");
    const { error } = await supabaseBrowser().from(table).update(patch).eq("id", id);
    if (error) {
      // Keep the unsaved values so the next change retries them
      pending.current = { ...patch, ...pending.current };
      setState("error");
      setError(error.message);
      return false;
    }
    setState("saved");
    setError(null);
    return true;
  }, [table, id]);

  const queue = useCallback(
    (patch: Record<string, unknown>) => {
      Object.assign(pending.current, patch);
      setState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [flush, delay],
  );

  // Don't lose the last few keystrokes when the page closes
  useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      void flush();
    };
  }, [flush]);

  return { queue, flush, state, error };
}
