"use client";

import { useRef, useState } from "react";
import { Modal, Notice, Spinner } from "./ui";
import type { JobStatus } from "@/lib/types";

type Kind = "estimate" | "work-order" | "invoice" | "inspection";

const DOCS: { kind: Kind; label: string; prefix: string; when: JobStatus[] }[] = [
  { kind: "estimate", label: "Estimate", prefix: "EST", when: ["estimate", "approved", "ready", "invoiced", "paid", "declined"] },
  { kind: "work-order", label: "Work order", prefix: "RO", when: ["approved", "ready", "invoiced", "paid"] },
  { kind: "invoice", label: "Invoice", prefix: "INV", when: ["invoiced", "paid"] },
  { kind: "inspection", label: "Inspection", prefix: "INSP", when: ["estimate", "approved", "ready", "invoiced", "paid", "declined"] },
];

type Ready = { file: File } | { error: string } | null;

/** The file name the server picked, from its Content-Disposition header */
function fileNameFrom(res: Response, fallback: string): string {
  const cd = res.headers.get("content-disposition") ?? "";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  if (star) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      /* fall through */
    }
  }
  const plain = /filename="([^"]+)"/i.exec(cd);
  return plain ? plain[1] : fallback;
}

/** Whether this browser can hand a PDF to the phone's share sheet (Android Chrome, iOS Safari) */
function canShareFiles(): boolean {
  try {
    return typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([""], "x.pdf", { type: "application/pdf" })] });
  } catch {
    return false;
  }
}

/**
 * One button per printable document. Tapping it offers: open to print, download, or share.
 * Phones' built-in PDF viewers often have no obvious way to save, so download and share are
 * spelled out. The PDF is fetched as soon as the sheet opens, because a phone only allows the
 * share sheet straight after a tap, not after a slow download.
 */
export function DocumentButtons({ jobId, number, status, hasInspection }: { jobId: string; number: number; status: JobStatus; hasInspection: boolean }) {
  const docs = DOCS.filter((d) => d.when.includes(status) && (d.kind !== "inspection" || hasInspection));
  const [open, setOpen] = useState<(typeof DOCS)[number] | null>(null);
  const [ready, setReady] = useState<Ready>(null);
  const [shareable, setShareable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const url = (kind: Kind, download = false) => `/api/jobs/${jobId}/pdf?doc=${kind}${download ? "&download=1" : ""}`;

  function choose(d: (typeof DOCS)[number]) {
    setOpen(d);
    setError(null);
    const share = canShareFiles();
    setShareable(share);
    setReady(null);
    if (!share) return;
    const mine = ++request.current;
    const fallback = `${d.prefix}-${number}.pdf`;
    void fetch(url(d.kind, true))
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Couldn't make the PDF (${res.status}).`);
        }
        const blob = await res.blob();
        return new File([blob], fileNameFrom(res, fallback), { type: "application/pdf" });
      })
      .then((file) => mine === request.current && setReady({ file }))
      .catch((e: unknown) => mine === request.current && setReady({ error: e instanceof Error ? e.message : "Couldn't make the PDF." }));
  }

  function close() {
    request.current++;
    setOpen(null);
    setReady(null);
    setError(null);
  }

  async function share() {
    if (!ready || !("file" in ready)) return;
    try {
      await navigator.share({ files: [ready.file], title: ready.file.name });
      close();
    } catch (e) {
      // Closing the share sheet without picking anything isn't an error
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Couldn't open the share sheet.");
    }
  }

  const action = "flex h-12 w-full items-center gap-3 rounded-lg border border-line bg-surface px-4 text-left text-[15px] font-medium text-ink hover:bg-canvas disabled:opacity-50";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-[13px] font-medium text-muted">Documents</span>
      {docs.map((d) => (
        <button
          key={d.kind}
          type="button"
          onClick={() => choose(d)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink hover:bg-canvas"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
            <path d="M14 3v5h5M9 13h6M9 17h6" />
          </svg>
          {d.label}
          <span className="tabular text-xs text-muted">
            {d.prefix}-{number}
          </span>
        </button>
      ))}

      {open ? (
        <Modal title={`${open.label} ${open.prefix}-${number}`} onClose={close}>
          <div className="space-y-2">
            <a href={url(open.kind)} target="_blank" rel="noopener" onClick={close} className={action}>
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z" />
              </svg>
              Open to print
            </a>
            <a href={url(open.kind, true)} download onClick={close} className={action}>
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
              </svg>
              Download PDF
            </a>
            {shareable ? (
              <button type="button" onClick={share} disabled={!ready || !("file" in ready)} className={action}>
                {ready ? (
                  <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="18" cy="5" r="2.5" />
                    <circle cx="6" cy="12" r="2.5" />
                    <circle cx="18" cy="19" r="2.5" />
                    <path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4" />
                  </svg>
                ) : (
                  <Spinner />
                )}
                {ready ? "Share (WhatsApp, email, Drive…)" : "Getting the PDF ready…"}
              </button>
            ) : null}
          </div>
          {ready && "error" in ready ? (
            <div className="mt-3">
              <Notice tone="bad">{ready.error}</Notice>
            </div>
          ) : null}
          {error ? (
            <div className="mt-3">
              <Notice tone="bad">{error}</Notice>
            </div>
          ) : null}
        </Modal>
      ) : null}
    </div>
  );
}
