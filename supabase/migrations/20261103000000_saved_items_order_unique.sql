-- Saved items: no two can share a place in the order. Two people adding an item at the same
-- moment used to be able to get the same position; now new items take turns, and positions
-- are unique (checked at the end of each step, so the up and down buttons can swap two).

-- Any ties from before get separate places, keeping the order they showed in
update public.saved_items s
set position = o.n
from (select id, row_number() over (order by position, lower(btrim(name)), id) n from public.saved_items) o
where o.id = s.id and s.position is distinct from o.n;

create or replace function public.saved_items_position() returns trigger
language plpgsql as $$
begin
  if new.position is null then
    -- One new item at a time, so two added at once don't both take the same last place
    perform pg_advisory_xact_lock(hashtext('public.saved_items.position'));
    select coalesce(max(position), 0) + 1 into new.position from public.saved_items;
  end if;
  return new;
end
$$;

alter table public.saved_items
  add constraint saved_items_position_key unique (position) deferrable initially deferred;
