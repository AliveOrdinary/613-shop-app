// Checks supabase/reset-data.sql (the one-off wipe of test data) against the real migrations.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

const SUPABASE_STUBS = `
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant all on storage.objects to authenticated;
`;
const OWNER = "00000000-0000-0000-0000-00000000000a";
it("reset-data.sql clears an invoiced, paid job and everything under it", async () => {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  const dir = path.join(__dirname, "..", "supabase", "migrations");
  for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(path.join(dir, f), "utf8"));
  await db.exec(`insert into auth.users (id) values ('${OWNER}');`);
  await db.exec(`
    set session_replication_role = replica;
    update shop_settings set next_job_number = 205, hst_number = '123456789 RT0001' where id = 1;
    insert into customers (id, name) values ('10000000-0000-0000-0000-000000000001', 'Test');
    insert into vehicles (id, customer_id, make, model) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Honda', 'Civic');
    insert into jobs (id, number, customer_id, vehicle_id, status) values ('30000000-0000-0000-0000-000000000001', 203, '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'invoiced');
    insert into job_lines (job_id, kind, description, quantity, unit_price) values ('30000000-0000-0000-0000-000000000001', 'part', 'Pads', 1, 10);
    insert into inspections (job_id) values ('30000000-0000-0000-0000-000000000001');
    insert into job_files (job_id, kind, path) values ('30000000-0000-0000-0000-000000000001', 'document', 'x/y.pdf');
    insert into payments (job_id, amount, method) values ('30000000-0000-0000-0000-000000000001', 10, 'cash');
    set session_replication_role = origin;
  `);
  await expect(db.exec("delete from jobs")).rejects.toThrow();
  await db.exec(readFileSync(path.join(__dirname, "..", "supabase", "reset-data.sql"), "utf8"));
  for (const t of ["customers", "vehicles", "jobs", "job_lines", "payments", "inspections", "job_files"]) {
    const { rows } = await db.query<{ n: number }>(`select count(*)::int n from ${t}`);
    expect([t, rows[0].n]).toEqual([t, 0]);
  }
  const s = await db.query<{ next_job_number: number; hst_number: string }>("select next_job_number, hst_number from shop_settings");
  expect(s.rows).toEqual([{ next_job_number: 200, hst_number: "123456789 RT0001" }]);
  const staff = await db.query<{ n: number }>("select count(*)::int n from staff");
  expect(staff.rows[0].n).toBe(1);
});
