-- 613 Automotive shop app: staff, shop settings, customers and vehicles.
-- One shop. Everyone on the staff list sees and edits everything; nobody else sees anything.


-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------

create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where user_id = auth.uid())
$$;

grant execute on function public.is_staff() to authenticated;

-- The first account ever created becomes staff, so setup needs no SQL.
-- Later accounts are added to public.staff by hand (Supabase table editor).
create function public.claim_first_staff() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.staff) then
    insert into public.staff (user_id) values (new.id);
  end if;
  return new;
end
$$;

create trigger on_auth_user_created_claim_staff
after insert on auth.users
for each row execute function public.claim_first_staff();

alter table public.staff enable row level security;
create policy "staff read staff" on public.staff for select to authenticated using (public.is_staff());

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- Shop settings (exactly one row)
-- ---------------------------------------------------------------------------

create table public.shop_settings (
  id smallint primary key default 1 check (id = 1),
  shop_name text not null default '613 Automotive',
  address_line text not null default '',
  city text not null default '',
  province text not null default 'ON',
  postal_code text not null default '',
  phone text not null default '',
  email text not null default '',
  hst_number text not null default '',

  -- Hourly labour rates, before tax
  rate_body numeric(10, 2) not null default 0 check (rate_body >= 0),
  rate_paint numeric(10, 2) not null default 0 check (rate_paint >= 0),
  rate_mechanical numeric(10, 2) not null default 0 check (rate_mechanical >= 0),

  -- Added on top of the paint bought for a job
  paint_markup_pct numeric(5, 2) not null default 0 check (paint_markup_pct between 0 and 500),

  -- Shop supplies: a percentage of labour, optionally capped. Off until the shop decides.
  shop_supplies_enabled boolean not null default false,
  shop_supplies_pct numeric(5, 2) not null default 0 check (shop_supplies_pct between 0 and 100),
  shop_supplies_cap numeric(10, 2) check (shop_supplies_cap is null or shop_supplies_cap >= 0),

  hst_rate numeric(5, 2) not null default 13 check (hst_rate between 0 and 100),

  estimate_valid_days integer not null default 30 check (estimate_valid_days between 1 and 365),
  payment_terms text not null default 'Payment due on vehicle pickup.',
  warranty_text text not null default
    'Parts and labour are warranted for 90 days or 5,000 km, whichever comes first, from the date the vehicle is returned. Warranty covers defects in the parts we installed and the labour to install them.',

  -- Next number handed to a new job (EST/RO/INV share it). Starts at 200.
  next_job_number integer not null default 200 check (next_job_number > 0),

  updated_at timestamptz not null default now()
);

create trigger shop_settings_touch before update on public.shop_settings
for each row execute function public.touch_updated_at();

insert into public.shop_settings (id, address_line, city, province, postal_code, phone, email)
values (1, '780 Burnett St #4', 'Kingston', 'ON', 'K7M 5W3', '+1 437-457-2268', '613automotiverepairs@gmail.com');

alter table public.shop_settings enable row level security;
create policy "staff read settings" on public.shop_settings for select to authenticated using (public.is_staff());
create policy "staff update settings" on public.shop_settings for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'person' check (kind in ('person', 'business')),
  name text not null check (length(trim(name)) > 0),
  company text not null default '',
  phone text not null default '',
  email text not null default '',
  address_line text not null default '',
  city text not null default '',
  province text not null default 'ON',
  postal_code text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_name_idx on public.customers (lower(name));
create trigger customers_touch before update on public.customers
for each row execute function public.touch_updated_at();

alter table public.customers enable row level security;
create policy "staff all customers" on public.customers for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- Vehicles
-- ---------------------------------------------------------------------------

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  year integer check (year is null or year between 1900 and 2100),
  make text not null default '',
  model text not null default '',
  trim text not null default '',
  vin text check (vin is null or vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  plate text not null default '',
  colour text not null default '',
  odometer_km integer check (odometer_km is null or odometer_km >= 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vehicles_customer_idx on public.vehicles (customer_id);
-- A VIN identifies one vehicle; if it changes owners, move the vehicle instead of re-adding it.
create unique index vehicles_vin_key on public.vehicles (vin) where vin is not null;
create trigger vehicles_touch before update on public.vehicles
for each row execute function public.touch_updated_at();

alter table public.vehicles enable row level security;
create policy "staff all vehicles" on public.vehicles for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
