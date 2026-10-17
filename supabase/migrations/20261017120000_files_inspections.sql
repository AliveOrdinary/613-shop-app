-- Photos and documents on a job, the mechanical inspection, and the final quality check.

-- ---------------------------------------------------------------------------
-- Files: a private storage bucket only staff can read or write
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-files', 'job-files', false, 20971520,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do nothing;

create policy "staff read job files" on storage.objects for select to authenticated
  using (bucket_id = 'job-files' and public.is_staff());
create policy "staff add job files" on storage.objects for insert to authenticated
  with check (bucket_id = 'job-files' and public.is_staff());
create policy "staff change job files" on storage.objects for update to authenticated
  using (bucket_id = 'job-files' and public.is_staff()) with check (bucket_id = 'job-files' and public.is_staff());
create policy "staff remove job files" on storage.objects for delete to authenticated
  using (bucket_id = 'job-files' and public.is_staff());

create table public.job_files (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  kind text not null check (kind in ('photo', 'document')),
  -- Photos only: when it was taken
  stage text check (stage in ('dropoff', 'repair', 'completed')),
  -- Where it lives in the job-files bucket: <job id>/<file id>.<ext>
  path text not null unique,
  name text not null default '',
  mime text not null default '',
  size_bytes integer not null default 0 check (size_bytes >= 0),
  caption text not null default '',
  created_at timestamptz not null default now(),
  check (kind = 'photo' or stage is null)
);

create index job_files_job_idx on public.job_files (job_id, created_at);

alter table public.job_files enable row level security;
create policy "staff all job files rows" on public.job_files for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- Mechanical inspection: one per job
-- ---------------------------------------------------------------------------

create table public.inspections (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  -- { "<item key>": { "status": "ok" | "attention" | "urgent" | "na", "note": "..." } }
  results jsonb not null default '{}'::jsonb,
  safety_concerns text not null default '',
  recommendations text not null default '',
  measurements text not null default '',
  technician text not null default '',
  odometer_km integer check (odometer_km is null or odometer_km >= 0),
  customer_notified boolean,
  customer_authorized boolean,
  inspected_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger inspections_touch before update on public.inspections
for each row execute function public.touch_updated_at();

alter table public.inspections enable row level security;
create policy "staff all inspections" on public.inspections for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- Final quality check, on the job itself
-- ---------------------------------------------------------------------------

alter table public.jobs
  add column qc jsonb not null default '{}'::jsonb,
  add column qc_notes text not null default '',
  add column qc_by text not null default '',
  add column qc_at timestamptz;
