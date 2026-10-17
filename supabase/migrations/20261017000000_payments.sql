-- Payments recorded one at a time (customer deductible at pickup, insurer weeks later),
-- the job's paid status worked out from them, and deleting estimates.

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  -- A job with payments can't be deleted
  job_id uuid not null references public.jobs (id) on delete restrict,
  paid_on date not null default current_date,
  amount numeric(12, 2) not null check (amount > 0),
  payer text not null default 'customer' check (payer in ('customer', 'insurer', 'other')),
  method text not null check (method in ('cash', 'debit', 'credit', 'etransfer', 'cheque', 'insurance', 'other')),
  reference text not null default '',
  created_at timestamptz not null default now()
);

create index payments_job_idx on public.payments (job_id, paid_on);

alter table public.payments enable row level security;
create policy "staff all payments" on public.payments for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Payments recorded the old way (one per job) move into the payments table
insert into public.payments (job_id, paid_on, amount, payer, method, reference)
select id, coalesce(paid_at::date, current_date), amount_paid, 'customer', coalesce(payment_method, 'other'), payment_reference
from public.jobs
where amount_paid > 0;

-- ---------------------------------------------------------------------------
-- Status rules, updated: "paid" now follows the payments instead of being set by hand
-- ---------------------------------------------------------------------------

create or replace function public.job_status_guard() returns trigger
language plpgsql as $$
declare
  locked boolean := old.status in ('invoiced', 'paid');
  total numeric := coalesce((new.invoice_totals ->> 'total')::numeric, 0);
begin
  if new.status is distinct from old.status then
    if not (
      (old.status = 'estimate' and new.status in ('approved', 'declined')) or
      (old.status = 'declined' and new.status = 'estimate') or
      (old.status = 'approved' and new.status in ('estimate', 'ready')) or
      (old.status = 'ready' and new.status in ('approved', 'invoiced')) or
      (old.status = 'invoiced' and new.status in ('ready', 'paid')) or
      (old.status = 'paid' and new.status in ('invoiced', 'ready'))
    ) then
      raise exception 'A job can''t go from % to %', old.status, new.status;
    end if;
    if new.status = 'approved' and old.status = 'estimate' and (new.approval_method is null or new.approved_total is null) then
      raise exception 'Record how the customer approved the estimate';
    end if;
    if new.status = 'invoiced' and old.status = 'ready' and (new.invoice_totals is null or new.invoice_date is null) then
      raise exception 'An invoice needs its totals and date';
    end if;
    if new.status = 'paid' and new.amount_paid < total then
      raise exception 'The invoice isn''t fully paid yet';
    end if;
    -- An invoice that's already covered by earlier payments is paid as soon as it's issued
    if new.status = 'invoiced' and old.status = 'ready' and new.amount_paid >= total and new.amount_paid > 0 then
      new.status := 'paid';
    end if;
    if new.status = 'paid' then
      new.paid_at := coalesce(new.paid_at, now());
    else
      new.paid_at := null;
    end if;
    -- Reopening an invoice for correction clears the frozen totals; it keeps its number and payments.
    if new.status = 'ready' and old.status in ('invoiced', 'paid') then
      new.invoice_totals := null;
      new.invoiced_at := null;
    end if;
    return new;
  end if;

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

-- A job marked paid that isn't fully covered goes back to unpaid
update public.jobs
set status = 'invoiced'
where status = 'paid' and amount_paid < coalesce((invoice_totals ->> 'total')::numeric, 0);

-- Payments can only be added to an invoice that still has money owing
create function public.payments_guard() returns trigger
language plpgsql as $$
declare
  s text;
begin
  if tg_op = 'INSERT' then
    select status into s from public.jobs where id = new.job_id;
    if s is distinct from 'invoiced' then
      raise exception 'Payments can only be recorded on an unpaid invoice';
    end if;
    return new;
  end if;
  return old;
end
$$;

create trigger payments_guard before insert on public.payments
for each row execute function public.payments_guard();

-- Keeps the job's amount paid and paid/unpaid status in step with its payments
create function public.payments_sync() returns trigger
language plpgsql as $$
declare
  jid uuid := coalesce(new.job_id, old.job_id);
  paid numeric;
  j public.jobs;
  total numeric;
begin
  select coalesce(sum(amount), 0) into paid from public.payments where job_id = jid;
  select * into j from public.jobs where id = jid;
  if not found then
    return null;
  end if;
  total := coalesce((j.invoice_totals ->> 'total')::numeric, 0);
  update public.jobs set
    amount_paid = paid,
    status = case
      when j.status = 'invoiced' and paid >= total then 'paid'
      when j.status = 'paid' and paid < total then 'invoiced'
      else j.status
    end
  where id = jid;
  return null;
end
$$;

create trigger payments_sync after insert or delete on public.payments
for each row execute function public.payments_sync();

-- ---------------------------------------------------------------------------
-- Deleting jobs: only estimates and declined jobs. Invoices are tax records.
-- ---------------------------------------------------------------------------

create function public.jobs_delete_guard() returns trigger
language plpgsql as $$
begin
  if old.status not in ('estimate', 'declined') then
    raise exception 'Only estimates and declined jobs can be deleted';
  end if;
  return old;
end
$$;

create trigger jobs_delete_guard before delete on public.jobs
for each row execute function public.jobs_delete_guard();
