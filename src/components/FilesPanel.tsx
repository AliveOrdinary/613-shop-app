"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Modal, Notice, Spinner, cx } from "./ui";
import { STAGE_LABEL, deleteJobFile, fileSize, signedUrls, uploadJobFile } from "@/lib/files";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { JobFile, PhotoStage } from "@/lib/types";

const STAGES: PhotoStage[] = ["dropoff", "repair", "completed"];

export function FilesPanel({ jobId, initial }: { jobId: string; initial: JobFile[] }) {
  const [files, setFiles] = useState<JobFile[]>(initial);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [stage, setStage] = useState<PhotoStage>("dropoff");
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<JobFile | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const docInput = useRef<HTMLInputElement>(null);

  const photos = useMemo(() => files.filter((f) => f.kind === "photo"), [files]);
  const docs = useMemo(() => files.filter((f) => f.kind === "document"), [files]);

  // Fetch signed links for anything new
  const missing = files.filter((f) => !urls[f.path]).map((f) => f.path);
  const missingKey = missing.join("|");
  useEffect(() => {
    if (!missingKey) return;
    let live = true;
    void signedUrls(missingKey.split("|")).then((u) => {
      if (live) setUrls((prev) => ({ ...prev, ...u }));
    });
    return () => {
      live = false;
    };
  }, [missingKey]);

  async function upload(list: FileList | null, kind: "photo" | "document") {
    if (!list || list.length === 0) return;
    const items = Array.from(list);
    setError(null);
    setUploading({ done: 0, total: items.length });
    const failed: string[] = [];
    for (const [i, f] of items.entries()) {
      try {
        const saved = await uploadJobFile(jobId, f, kind, kind === "photo" ? stage : null);
        setFiles((fs) => [...fs, saved]);
      } catch (e) {
        failed.push(`${f.name}: ${e instanceof Error ? e.message : "upload failed"}`);
      }
      setUploading({ done: i + 1, total: items.length });
    }
    setUploading(null);
    if (failed.length) setError(`Couldn't upload ${failed.length === 1 ? "one file" : `${failed.length} files`}. ${failed.join("; ")}`);
  }

  async function remove(f: JobFile) {
    try {
      await deleteJobFile(f);
      setFiles((fs) => fs.filter((x) => x.id !== f.id));
      setViewing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete the file.");
    }
  }

  async function saveCaption(f: JobFile, caption: string) {
    const { error } = await supabaseBrowser().from("job_files").update({ caption }).eq("id", f.id);
    if (error) return setError(error.message);
    setFiles((fs) => fs.map((x) => (x.id === f.id ? { ...x, caption } : x)));
  }

  return (
    <div className="space-y-5 p-4">
      {/* Photos */}
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-muted">New photos are</span>
          {STAGES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStage(s)}
              aria-pressed={stage === s}
              className={cx(
                "h-9 rounded-full border px-3 text-sm font-medium",
                stage === s ? "border-ink bg-ink text-white" : "border-line bg-surface text-charcoal",
              )}
            >
              {STAGE_LABEL[s]}
            </button>
          ))}
        </div>
        <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={(e) => { void upload(e.target.files, "photo"); e.target.value = ""; }} />
        <Button onClick={() => photoInput.current?.click()} disabled={uploading !== null}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
          Take or add photos
        </Button>

        {photos.length ? (
          <div className="mt-4 space-y-4">
            {STAGES.filter((s) => photos.some((p) => p.stage === s)).map((s) => (
              <div key={s}>
                <p className="mb-2 text-[13px] font-medium text-muted">
                  {STAGE_LABEL[s]} <span className="text-faint">· {photos.filter((p) => p.stage === s).length}</span>
                </p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                  {photos
                    .filter((p) => p.stage === s)
                    .map((p) => (
                      <button key={p.id} onClick={() => setViewing(p)} className="relative aspect-square overflow-hidden rounded-lg border border-line bg-canvas" aria-label={p.caption || `Photo ${p.name}`}>
                        {urls[p.path] ? (
                          // eslint-disable-next-line @next/next/no-img-element -- signed storage links
                          <img src={urls[p.path]} alt={p.caption || ""} className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-faint">
                            <Spinner />
                          </span>
                        )}
                        {p.caption ? <span className="absolute inset-x-0 bottom-0 truncate bg-ink/70 px-1.5 py-0.5 text-left text-[11px] text-white">{p.caption}</span> : null}
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">No photos yet. Photos of existing damage at drop-off protect the shop if a customer questions it later.</p>
        )}
      </div>

      {/* Documents */}
      <div className="border-t border-line pt-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[13px] font-medium text-muted">Documents</p>
          <input ref={docInput} type="file" accept="application/pdf,image/*" multiple hidden onChange={(e) => { void upload(e.target.files, "document"); e.target.value = ""; }} />
          <Button size="sm" onClick={() => docInput.current?.click()} disabled={uploading !== null}>
            Add insurer estimate or PDF
          </Button>
        </div>
        {docs.length ? (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
                <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-charcoal" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
                  <path d="M14 3v5h5" />
                </svg>
                <a href={urls[d.path] ?? "#"} target="_blank" rel="noopener" className="min-w-0 flex-1 truncate text-sm font-medium text-ink underline decoration-line underline-offset-4">
                  {d.name || "Document"}
                </a>
                <span className="shrink-0 text-xs text-muted">{fileSize(d.size_bytes)}</span>
                <button onClick={() => setViewing(d)} className="shrink-0 text-xs text-bad hover:underline">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Insurer estimates and other paperwork. Kept on file; not printed with the work order.</p>
        )}
      </div>

      {uploading ? (
        <Notice tone="neutral">
          <span className="inline-flex items-center gap-2">
            <Spinner /> Uploading {uploading.done + 1 > uploading.total ? uploading.total : uploading.done + 1} of {uploading.total}…
          </span>
        </Notice>
      ) : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}

      {viewing ? (
        <FileViewer file={viewing} url={urls[viewing.path]} onClose={() => setViewing(null)} onDelete={() => remove(viewing)} onCaption={(c) => saveCaption(viewing, c)} />
      ) : null}
    </div>
  );
}

function FileViewer({
  file,
  url,
  onClose,
  onDelete,
  onCaption,
}: {
  file: JobFile;
  url: string | undefined;
  onClose: () => void;
  onDelete: () => Promise<void>;
  onCaption: (c: string) => Promise<void>;
}) {
  const [caption, setCaption] = useState(file.caption);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const photo = file.kind === "photo";

  return (
    <Modal title={photo ? `${STAGE_LABEL[file.stage ?? "dropoff"]} photo` : file.name || "Document"} onClose={onClose}>
      {photo && url ? (
        <a href={url} target="_blank" rel="noopener" className="mb-3 block overflow-hidden rounded-lg bg-canvas">
          {/* eslint-disable-next-line @next/next/no-img-element -- signed storage link */}
          <img src={url} alt={caption} className="max-h-[60vh] w-full object-contain" />
        </a>
      ) : null}
      {photo ? (
        <div className="mb-4 flex gap-2">
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onBlur={() => caption !== file.caption && void onCaption(caption.trim())}
            placeholder="Caption, e.g. Scratch on rear left door"
            maxLength={120}
            className="h-11 w-full rounded-lg border border-line px-3 text-base focus:border-ink focus:outline-none focus:ring-2 focus:ring-brand/60"
            aria-label="Caption"
          />
        </div>
      ) : null}
      <p className="mb-4 text-xs text-muted">
        {file.name} · {fileSize(file.size_bytes)} · added {new Date(file.created_at).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
      </p>
      {confirm ? (
        <div className="flex items-center gap-2">
          <span className="text-sm text-bad">Delete for good?</span>
          <Button
            variant="danger"
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onDelete();
              setBusy(false);
            }}
          >
            {busy ? "Deleting…" : "Delete"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
            Keep
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          {url ? (
            <a href={url} target="_blank" rel="noopener" className="inline-flex h-11 items-center rounded-lg border border-line px-4 text-[15px] font-medium text-ink hover:bg-canvas">
              Open full size
            </a>
          ) : null}
          <Button variant="dangerGhost" onClick={() => setConfirm(true)}>
            Delete
          </Button>
        </div>
      )}
    </Modal>
  );
}
