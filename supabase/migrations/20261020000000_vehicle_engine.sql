-- Engine and drive line for parts lookups, e.g. "2.0L 4-cyl · FWD". Filled from the VIN lookup.
alter table public.vehicles add column engine text not null default '';
