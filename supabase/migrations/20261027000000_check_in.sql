-- One-step check-in: an existing or new customer, an existing or new vehicle, and the new job,
-- saved together. If any part fails (a bad VIN, a VIN already on file), nothing is saved and no
-- job number is used up.
--
-- Runs with the caller's rights, so row-level security applies as for any staff write.

create function public.check_in(
  p_customer uuid,          -- an existing customer, or null to create p_new_customer
  p_new_customer jsonb,     -- {kind, name, company, phone, email, address_line, city, province, postal_code, notes}
  p_vehicle uuid,           -- an existing vehicle of that customer, or null to create p_new_vehicle
  p_new_vehicle jsonb,      -- {year, make, model, trim, engine, vin, plate, colour, notes}
  p_odometer integer,       -- odometer in; also becomes the vehicle's latest reading. Null keeps the last one.
  p_concern text,
  p_number integer default null,
  p_date date default null
) returns public.jobs
language plpgsql as $$
declare
  c uuid := p_customer;
  v uuid := p_vehicle;
  j public.jobs;
begin
  if c is null then
    if p_new_customer is null then
      raise exception 'Pick a customer or enter a new one';
    end if;
    insert into public.customers (kind, name, company, phone, email, address_line, city, province, postal_code, notes)
    values (
      coalesce(nullif(p_new_customer->>'kind', ''), 'person'),
      coalesce(p_new_customer->>'name', ''),
      coalesce(p_new_customer->>'company', ''),
      coalesce(p_new_customer->>'phone', ''),
      coalesce(p_new_customer->>'email', ''),
      coalesce(p_new_customer->>'address_line', ''),
      coalesce(p_new_customer->>'city', ''),
      coalesce(nullif(p_new_customer->>'province', ''), 'ON'),
      coalesce(p_new_customer->>'postal_code', ''),
      coalesce(p_new_customer->>'notes', '')
    )
    returning id into c;
  end if;

  if v is null then
    if p_new_vehicle is null then
      raise exception 'Pick a vehicle or enter a new one';
    end if;
    insert into public.vehicles (customer_id, year, make, model, trim, engine, vin, plate, colour, odometer_km, notes)
    values (
      c,
      nullif(p_new_vehicle->>'year', '')::integer,
      coalesce(p_new_vehicle->>'make', ''),
      coalesce(p_new_vehicle->>'model', ''),
      coalesce(p_new_vehicle->>'trim', ''),
      coalesce(p_new_vehicle->>'engine', ''),
      nullif(p_new_vehicle->>'vin', ''),
      coalesce(p_new_vehicle->>'plate', ''),
      coalesce(p_new_vehicle->>'colour', ''),
      p_odometer,
      coalesce(p_new_vehicle->>'notes', '')
    )
    returning id into v;
  elsif p_odometer is not null then
    update public.vehicles set odometer_km = p_odometer where id = v and customer_id = c;
  end if;

  -- Numbering, dates and rates come from the usual job creation
  j := public.create_job(c, v, p_number, p_date);

  update public.jobs
  set concern = coalesce(p_concern, ''),
      odometer_in = coalesce(p_odometer, odometer_in)
  where id = j.id
  returning * into j;

  return j;
end
$$;

grant execute on function public.check_in(uuid, jsonb, uuid, jsonb, integer, text, integer, date) to authenticated;
