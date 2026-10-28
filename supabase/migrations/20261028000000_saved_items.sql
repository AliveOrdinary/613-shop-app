-- Saved items: lines the shop quotes often ("Oil and filter change", "Front brakes"), saved
-- from a real estimate and added to another job in one tap. One item can hold several lines.
-- Labour rates and the paint markup aren't kept: they come from Settings when the item is used.

create table public.saved_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  -- [{ kind, description, quantity, unit_price, markup_pct, part_condition, oem, part_number }]
  lines jsonb not null check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) between 1 and 40),
  created_at timestamptz not null default now()
);

create unique index saved_items_name_key on public.saved_items (lower(btrim(name)));

alter table public.saved_items enable row level security;
create policy "staff all saved items" on public.saved_items for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
