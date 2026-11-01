-- Saved items get an order of their own (the busiest first, like "Oil change"), set in
-- Settings → Saved items, instead of A to Z. Existing items keep their A to Z order to start.

alter table public.saved_items add column position integer;

update public.saved_items s
set position = o.n
from (select id, row_number() over (order by lower(btrim(name))) n from public.saved_items) o
where o.id = s.id;

alter table public.saved_items alter column position set not null;

-- A new item goes to the end
create function public.saved_items_position() returns trigger
language plpgsql as $$
begin
  if new.position is null then
    select coalesce(max(position), 0) + 1 into new.position from public.saved_items;
  end if;
  return new;
end
$$;

create trigger saved_items_position before insert on public.saved_items
  for each row execute function public.saved_items_position();

-- Swaps two items' places in one step, for the up and down buttons
create function public.swap_saved_items(p_a uuid, p_b uuid) returns void
language plpgsql as $$
declare
  pa integer;
  pb integer;
begin
  select position into pa from public.saved_items where id = p_a;
  select position into pb from public.saved_items where id = p_b;
  if pa is null or pb is null then
    raise exception 'That saved item is gone. Reload the page.';
  end if;
  update public.saved_items set position = pb where id = p_a;
  update public.saved_items set position = pa where id = p_b;
end
$$;

grant execute on function public.swap_saved_items(uuid, uuid) to authenticated;
