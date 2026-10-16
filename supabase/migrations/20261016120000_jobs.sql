-- Jobs and their line items.
-- One job = one number shared by its estimate (EST-n), work order (RO-n) and invoice (INV-n).

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique check (number > 0),
  status text not null default 'estimate'
    check (status in ('estimate', 'approved', 'ready', 'invoiced', 'paid', 'declined')),

  customer_id uuid not null references public.customers (id) on delete restrict,
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,

  concern text not null default '',
  estimate_date date not null default current_date,
  valid_until date,
  expected_completion date,

  -- Intake
  odometer_in integer check (odometer_in is null or odometer_in >= 0),
  odometer_out integer check (odometer_out is null or odometer_out >= 0),
  intake jsonb not null default '{}'::jsonb,
  belongings text not null default '',

  -- Insurance
  is_insurance boolean not null default false,
  insurer text not null default '',
  claim_number text not null default '',
  deductible numeric(10, 2) not null default 0 check (deductible >= 0),
  insurer_pays numeric(12, 2) check (insurer_pays is null or insurer_pays >= 0),

  discount numeric(10, 2) not null default 0 check (discount >= 0),

  -- Rates in force when the job was opened, so later changes to settings don't move old jobs
  hst_rate numeric(5, 2) not null default 13,
  shop_supplies_pct numeric(5, 2),
  shop_supplies_cap numeric(10, 2),

  -- Work
  technician text not null default '',
  bay text not null default '',
  work_started_at timestamptz,
  work_finished_at timestamptz,
  tech_notes text not null default '',
  notes text not null default '',

  -- Approval (Ontario: a verbal approval must be recorded in writing)
  approved_at timestamptz,
  approval_method text check (approval_method in ('signed', 'phone', 'in_person', 'email', 'text')),
  approved_total numeric(12, 2),

  -- Invoice (totals frozen at invoicing so the printed copy always matches)
  invoice_date date,
  invoiced_at timestamptz,
  invoice_totals jsonb,

  -- Payment
  paid_at timestamptz,
  payment_method text check (payment_method in ('cash', 'debit', 'credit', 'etransfer', 'cheque', 'insurance', 'other')),
  payment_reference text not null default '',
  amount_paid numeric(12, 2) not null default 0 check (amount_paid >= 0),

  declined_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jobs_status_idx on public.jobs (status);
create index jobs_customer_idx on public.jobs (customer_id);
create index jobs_vehicle_idx on public.jobs (vehicle_id);

create table public.job_lines (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  position integer not null default 0,
  kind text not null
    check (kind in ('labour_body', 'labour_paint', 'labour_mechanical', 'part', 'paint_materials', 'sublet', 'fee')),
  description text not null default '',
  -- Hours for labour, quantity for everything else
  quantity numeric(10, 2) not null default 1 check (quantity >= 0),
  -- Hourly rate for labour (copied from settings), price for parts, cost for paint materials
  unit_price numeric(10, 2) not null default 0 check (unit_price >= 0),
  -- Paint materials only: markup copied from settings
  markup_pct numeric(5, 2) not null default 0 check (markup_pct >= 0),
  part_condition text check (part_condition in ('new', 'used', 'reconditioned')),
  oem boolean,
  part_number text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index job_lines_job_idx on public.job_lines (job_id, position);

create trigger jobs_touch before update on public.jobs
for each row execute function public.touch_updated_at();
create trigger job_lines_touch before update on public.job_lines
for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Status rules
-- ---------------------------------------------------------------------------

create function public.job_status_guard() returns trigger
language plpgsql as $$
declare
  locked boolean := old.status in ('invoiced', 'paid');
begin
  if new.status is distinct from old.status then
    if not (
      (old.status = 'estimate' and new.status in ('approved', 'declined')) or
      (old.status = 'declined' and new.status = 'estimate') or
      (old.status = 'approved' and new.status in ('estimate', 'ready')) or
      (old.status = 'ready' and new.status in ('approved', 'invoiced')) or
      (old.status = 'invoiced' and new.status in ('ready', 'paid')) or
      (old.status = 'paid' and new.status = 'invoiced')
    ) then
      raise exception 'A job can''t go from % to %', old.status, new.status;
    end if;
    if new.status = 'approved' and old.status = 'estimate' and (new.approval_method is null or new.approved_total is null) then
      raise exception 'Record how the customer approved the estimate';
    end if;
    if new.status = 'invoiced' and old.status = 'ready' and (new.invoice_totals is null or new.invoice_date is null) then
      raise exception 'An invoice needs its totals and date';
    end if;
    if new.status = 'paid' and new.payment_method is null then
      raise exception 'Record how the invoice was paid';
    end if;
    -- Reopening an invoice for correction clears the frozen totals; it keeps its number.
    if new.status = 'ready' and old.status = 'invoiced' then
      new.invoice_totals := null;
      new.invoiced_at := null;
    end if;
    return new;
  end if;

  -- Same status: an invoiced or paid job's money can't change
  if locked and (
    new.discount is distinct from old.discount or
    new.deductible is distinct from old.deductible or
    new.insurer_pays is distinct from old.insurer_pays or
    new.is_insurance is distinct from old.is_insurance or
    new.invoice_totals is distinct from old.invoice_totals or
    new.hst_rate is distinct from old.hst_rate or
    new.shop_supplies_pct is distinct from old.shop_supplies_pct or
    new.customer_id is distinct from old.customer_id or
    new.vehicle_id is distinct from old.vehicle_id or
    new.number is distinct from old.number
  ) then
    raise exception 'This job is invoiced. Reopen it for correction to change the amounts.';
  end if;
  return new;
end
$$;

create trigger jobs_status_guard before update on public.jobs
for each row execute function public.job_status_guard();

create function public.job_lines_lock() returns trigger
language plpgsql as $$
declare
  s text;
begin
  select status into s from public.jobs where id = coalesce(new.job_id, old.job_id);
  if s in ('invoiced', 'paid') then
    raise exception 'This job is invoiced. Reopen it for correction to change its lines.';
  end if;
  return coalesce(new, old);
end
$$;

create trigger job_lines_lock before insert or update or delete on public.job_lines
for each row execute function public.job_lines_lock();

-- ---------------------------------------------------------------------------
-- Creating a job: hands out the next number atomically and copies today's rates
-- ---------------------------------------------------------------------------

create function public.create_job(
  p_customer uuid,
  p_vehicle uuid,
  p_number integer default null,
  p_date date default null
) returns public.jobs
language plpgsql as $$
declare
  s public.shop_settings;
  n integer;
  d date := coalesce(p_date, current_date);
  j public.jobs;
begin
  if not exists (select 1 from public.vehicles where id = p_vehicle and customer_id = p_customer) then
    raise exception 'That vehicle doesn''t belong to that customer';
  end if;

  -- Locks the settings row, so two devices creating jobs at once get different numbers
  select * into s from public.shop_settings where id = 1 for update;
  if not found then
    raise exception 'Not allowed';
  end if;

  if p_number is null then
    n := s.next_job_number;
    -- Skip any number already taken by a job entered by hand
    while exists (select 1 from public.jobs where number = n) loop
      n := n + 1;
    end loop;
    update public.shop_settings set next_job_number = n + 1 where id = 1;
  else
    if exists (select 1 from public.jobs where number = p_number) then
      raise exception 'Job number % is already used', p_number;
    end if;
    n := p_number;
    if n >= s.next_job_number then
      update public.shop_settings set next_job_number = n + 1 where id = 1;
    end if;
  end if;

  insert into public.jobs (
    number, customer_id, vehicle_id, estimate_date, valid_until,
    hst_rate, shop_supplies_pct, shop_supplies_cap, odometer_in
  )
  select
    n, p_customer, p_vehicle, d, d + s.estimate_valid_days,
    s.hst_rate,
    case when s.shop_supplies_enabled then s.shop_supplies_pct end,
    case when s.shop_supplies_enabled then s.shop_supplies_cap end,
    v.odometer_km
  from public.vehicles v where v.id = p_vehicle
  returning * into j;

  return j;
end
$$;

grant execute on function public.create_job(uuid, uuid, integer, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Access: staff only
-- ---------------------------------------------------------------------------

alter table public.jobs enable row level security;
create policy "staff all jobs" on public.jobs for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

alter table public.job_lines enable row level security;
create policy "staff all job lines" on public.job_lines for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- A customer or vehicle with jobs can't be deleted (their jobs are tax records)
