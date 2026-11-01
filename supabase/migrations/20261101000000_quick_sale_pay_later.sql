-- Quick sale, pay later: friends and family often pay for small jobs days or weeks after.
-- With no payment method, the sale is recorded (customer, car, lines, the work order number)
-- and left at Ready, with no invoice and no payment. When they pay, the job is invoiced and
-- paid from its page like any other ready job, so the invoice is dated the day they paid.

create or replace function public.quick_sale(
  p_customer uuid,          -- an existing customer, or null to create p_new_customer
  p_new_customer jsonb,
  p_vehicle uuid,           -- an existing vehicle of that customer, or null to create p_new_vehicle
  p_new_vehicle jsonb,
  p_odometer integer,
  p_lines jsonb,            -- [{ kind, description, quantity, unit_price, markup_pct, part_condition, oem, part_number }]
  p_totals jsonb,           -- the totals worked out by the app (lib/totals.ts)
  p_rates jsonb,            -- { hst_rate, shop_supplies_pct, shop_supplies_cap } the totals were worked out with
  p_method text,            -- how the customer paid, or null if they'll pay later
  p_reference text default ''
) returns public.jobs
language plpgsql as $$
declare
  j public.jobs;
  total numeric := (p_totals ->> 'total')::numeric;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one item';
  end if;
  if total is null or total <= 0 then
    raise exception 'The total must be more than $0';
  end if;

  j := public.check_in(p_customer, p_new_customer, p_vehicle, p_new_vehicle, p_odometer, '', null, null);

  -- The totals must have used the rates this job was given; otherwise Settings changed meanwhile
  if j.hst_rate is distinct from (p_rates ->> 'hst_rate')::numeric
     or j.shop_supplies_pct is distinct from (p_rates ->> 'shop_supplies_pct')::numeric
     or j.shop_supplies_cap is distinct from (p_rates ->> 'shop_supplies_cap')::numeric then
    raise exception 'The shop''s rates changed. Reload the page and try again.';
  end if;

  insert into public.job_lines (job_id, position, kind, description, quantity, unit_price, markup_pct, part_condition, oem, part_number)
  select
    j.id,
    t.ord,
    t.x ->> 'kind',
    coalesce(t.x ->> 'description', ''),
    coalesce((t.x ->> 'quantity')::numeric, 1),
    coalesce((t.x ->> 'unit_price')::numeric, 0),
    coalesce((t.x ->> 'markup_pct')::numeric, 0),
    nullif(t.x ->> 'part_condition', ''),
    (t.x ->> 'oem')::boolean,
    coalesce(t.x ->> 'part_number', '')
  from jsonb_array_elements(p_lines) with ordinality as t(x, ord);

  update public.jobs
  set quick = true, status = 'approved', approval_method = 'in_person', approved_at = now(), approved_total = total
  where id = j.id;

  update public.jobs set status = 'ready', work_finished_at = now() where id = j.id;

  -- Paying later: the work is on file, owed, and invoiced when they pay
  if p_method is not null then
    update public.jobs
    set status = 'invoiced', invoice_totals = p_totals, invoice_date = current_date, invoiced_at = now()
    where id = j.id;

    -- Recording the payment marks the invoice paid
    insert into public.payments (job_id, amount, payer, method, paid_on, reference)
    values (j.id, total, 'customer', p_method, current_date, coalesce(p_reference, ''));
  end if;

  select * into j from public.jobs where id = j.id;
  return j;
end
$$;
