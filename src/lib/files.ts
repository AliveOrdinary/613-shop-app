"use client";

import { supabaseBrowser } from "./supabase/client";
import type { JobFile, PhotoStage } from "./types";

export const BUCKET = "job-files";
const MAX_SIDE = 2000;
const QUALITY = 0.82;

export const STAGE_LABEL: Record<PhotoStage, string> = { dropoff: "Drop-off", repair: "During repair", completed: "Completed" };

/**
 * Shrinks a phone photo to at most 2000 px on the long side as a JPEG, so uploads are quick on
 * shop Wi-Fi and storage stays small. Falls back to the original if the browser can't decode it
 * (a HEIC photo on a non-Apple browser, say).
 */
export async function shrinkPhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

function extension(type: string, name: string): string {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "application/pdf") return "pdf";
  const m = /\.([a-z0-9]{2,5})$/i.exec(name);
  return m ? m[1].toLowerCase() : "bin";
}

/** Uploads one file to the job's folder and records it. */
export async function uploadJobFile(jobId: string, file: File, kind: "photo" | "document", stage: PhotoStage | null): Promise<JobFile> {
  const sb = supabaseBrowser();
  const body = kind === "photo" ? await shrinkPhoto(file) : file;
  const type = body.type || file.type || "application/octet-stream";
  const id = crypto.randomUUID();
  const path = `${jobId}/${id}.${extension(type, file.name)}`;

  const up = await sb.storage.from(BUCKET).upload(path, body, { contentType: type, upsert: false });
  if (up.error) throw new Error(up.error.message);

  const { data, error } = await sb
    .from("job_files")
    .insert({ id, job_id: jobId, kind, stage: kind === "photo" ? stage : null, path, name: file.name, mime: type, size_bytes: body.size })
    .select("*")
    .single<JobFile>();
  if (error || !data) {
    await sb.storage.from(BUCKET).remove([path]);
    throw new Error(error?.message ?? "Couldn't save the file.");
  }
  return data;
}

/** Signed links that work for an hour. */
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data } = await supabaseBrowser().storage.from(BUCKET).createSignedUrls(paths, 3600);
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

export async function deleteJobFile(f: JobFile): Promise<void> {
  const sb = supabaseBrowser();
  const { error } = await sb.storage.from(BUCKET).remove([f.path]);
  if (error) throw new Error(error.message);
  const del = await sb.from("job_files").delete().eq("id", f.id);
  if (del.error) throw new Error(del.error.message);
}

/** Removes every stored file for a job (before the job itself is deleted). */
export async function deleteAllJobFiles(jobId: string): Promise<void> {
  const sb = supabaseBrowser();
  const { data } = await sb.from("job_files").select("path").eq("job_id", jobId);
  const paths = (data ?? []).map((r: { path: string }) => r.path);
  if (paths.length) await sb.storage.from(BUCKET).remove(paths);
}

export function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
