// Runs the real migrations in an in-memory Postgres (PGlite) with a small stand-in for
// Supabase's auth schema, then checks the rules that matter: only staff see anything,
// the first account becomes staff, and the data checks hold.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

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
const STRANGER = "00000000-0000-0000-0000-00000000000b";

let db: PGlite;

async function as<T>(user: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  const dir = path.join(__dirname, "..", "supabase", "migrations");
  for (const f of readdirSync(dir).sort()) {
    await db.exec(readFileSync(path.join(dir, f), "utf8"));
  }
  await db.exec(`
    grant usage on schema public to authenticated;
    grant all on all tables in schema public to authenticated;
    insert into auth.users (id) values ('${OWNER}');
    insert into auth.users (id) values ('${STRANGER}');
  `);
});

describe("staff", () => {
  it("makes the first account staff and nobody after it", async () => {
    const { rows } = await db.query<{ user_id: string }>("select user_id from public.staff");
    expect(rows.map((r) => r.user_id)).toEqual([OWNER]);
  });
});

describe("shop settings", () => {
  it("starts with 613's details and job numbers at 200", async () => {
    const { rows } = await as(OWNER, () =>
      db.query<{ shop_name: string; city: string; next_job_number: number }>("select shop_name, city, next_job_number from shop_settings"),
    );
    expect(rows).toEqual([{ shop_name: "613 Automotive", city: "Kingston", next_job_number: 200 }]);
  });

  it("keeps a single row", async () => {
    await expect(db.exec("insert into shop_settings (id) values (2)")).rejects.toThrow();
  });

  it("is hidden from accounts that aren't staff", async () => {
    const { rows } = await as(STRANGER, () => db.query("select * from shop_settings"));
    expect(rows).toHaveLength(0);
  });
});

describe("customers and vehicles", () => {
  let customerId = "";

  it("lets staff add a customer with a vehicle", async () => {
    await as(OWNER, async () => {
      const c = await db.query<{ id: string }>("insert into customers (name, phone) values ('Jordan Patel', '613-555-0100') returning id");
      customerId = c.rows[0].id;
      await db.query(
        "insert into vehicles (customer_id, year, make, model, vin, plate) values ($1, 2021, 'Toyota', 'RAV4', '2T3P1RFV8MW123456', 'CKLM 123')",
        [customerId],
      );
    });
    const { rows } = await as(OWNER, () => db.query("select * from vehicles where customer_id = $1", [customerId]));
    expect(rows).toHaveLength(1);
  });

  it("hides customers and vehicles from accounts that aren't staff", async () => {
    const c = await as(STRANGER, () => db.query("select * from customers"));
    const v = await as(STRANGER, () => db.query("select * from vehicles"));
    expect(c.rows).toHaveLength(0);
    expect(v.rows).toHaveLength(0);
  });

  it("stops accounts that aren't staff from adding customers", async () => {
    await expect(as(STRANGER, () => db.query("insert into customers (name) values ('Nope')"))).rejects.toThrow();
  });

  it("rejects a malformed VIN and a duplicate VIN", async () => {
    await expect(
      as(OWNER, () => db.query("insert into vehicles (customer_id, vin) values ($1, 'SHORTVIN')", [customerId])),
    ).rejects.toThrow();
    await expect(
      as(OWNER, () => db.query("insert into vehicles (customer_id, vin) values ($1, '2T3P1RFV8MW123456')", [customerId])),
    ).rejects.toThrow();
  });

  it("removes a customer's vehicles with the customer", async () => {
    await as(OWNER, () => db.query("delete from customers where id = $1", [customerId]));
    const { rows } = await as(OWNER, () => db.query("select * from vehicles where customer_id = $1", [customerId]));
    expect(rows).toHaveLength(0);
  });
});

describe("jobs", () => {
  let customer = "";
  let vehicle = "";

  beforeAll(async () => {
    await as(OWNER, async () => {
      const c = await db.query<{ id: string }>("insert into customers (name, phone) values ('Ava Chen', '613-555-0111') returning id");
      customer = c.rows[0].id;
      const v = await db.query<{ id: string }>(
        "insert into vehicles (customer_id, year, make, model, odometer_km) values ($1, 2020, 'Honda', 'Civic', 61000) returning id",
        [customer],
      );
      vehicle = v.rows[0].id;
    });
  });

  type Job = { id: string; number: number; status: string; valid_until: string; odometer_in: number; hst_rate: string };
  const create = (number: number | null = null, date: string | null = null) =>
    as(OWNER, async () => (await db.query<Job>("select *, valid_until::text as valid_until from create_job($1, $2, $3, $4)", [customer, vehicle, number, date])).rows[0]);

  it("numbers jobs from 200 and copies the vehicle's odometer and today's HST rate", async () => {
    const a = await create();
    const b = await create();
    expect([a.number, b.number]).toEqual([200, 201]);
    expect(a.status).toBe("estimate");
    expect(a.odometer_in).toBe(61000);
    expect(Number(a.hst_rate)).toBe(13);
  });

  it("accepts a number entered by hand for back-dated work, and skips it later", async () => {
    const old = await create(150, "2026-09-01");
    expect(old.number).toBe(150);
    expect(old.valid_until).toBe("2026-10-01");
    const ahead = await create(203);
    expect(ahead.number).toBe(203);
    const next = await create();
    expect(next.number).toBe(204);
    await expect(create(150)).rejects.toThrow(/already used/);
  });

  it("refuses a vehicle that belongs to someone else", async () => {
    const other = await as(OWNER, async () => (await db.query<{ id: string }>("insert into customers (name, phone) values ('Other', '1') returning id")).rows[0].id);
    await expect(as(OWNER, () => db.query("select * from create_job($1, $2)", [other, vehicle]))).rejects.toThrow(/doesn't belong/);
  });

  it("walks a job from estimate to paid, enforcing each step", async () => {
    const j = await create();
    const upd = (sql: string) => as(OWNER, () => db.query(`update jobs set ${sql} where id = $1`, [j.id]));

    await as(OWNER, () =>
      db.query("insert into job_lines (job_id, kind, description, quantity, unit_price) values ($1, 'labour_body', 'Bumper R&R', 2, 95)", [j.id]),
    );
    await expect(upd("status = 'invoiced'")).rejects.toThrow(/can't go from estimate to invoiced/);
    await expect(upd("status = 'approved'")).rejects.toThrow(/Record how the customer approved/);
    await upd("status = 'approved', approval_method = 'phone', approved_total = 214.70, approved_at = now()");
    await upd("status = 'ready'");
    await upd(`status = 'invoiced', invoice_date = current_date, invoiced_at = now(), invoice_totals = '{"total": 214.70}'`);

    // Locked once invoiced
    await expect(upd("discount = 10")).rejects.toThrow(/invoiced/);
    await expect(as(OWNER, () => db.query("delete from job_lines where job_id = $1", [j.id]))).rejects.toThrow(/invoiced/);
    // Notes can still change
    await upd("tech_notes = 'Customer picked up'");

    await expect(upd("status = 'paid'")).rejects.toThrow(/isn't fully paid/);
    const pay = (amount: number, payer = "customer") =>
      as(OWNER, () => db.query("insert into payments (job_id, amount, payer, method) values ($1, $2, $3, 'debit')", [j.id, amount, payer]));
    const state = async () =>
      (await as(OWNER, () => db.query<{ status: string; amount_paid: string; paid_at: string | null }>("select status, amount_paid, paid_at from jobs where id = $1", [j.id]))).rows[0];

    // Deductible first: still unpaid
    await pay(100);
    expect(await state()).toMatchObject({ status: "invoiced", amount_paid: "100.00", paid_at: null });
    // Insurer pays the rest: paid
    await pay(114.7, "insurer");
    const paid = await state();
    expect(paid.status).toBe("paid");
    expect(paid.paid_at).not.toBeNull();
    // No more payments once it's paid
    await expect(pay(1)).rejects.toThrow(/unpaid invoice/);
    // Removing a payment puts it back to unpaid
    await as(OWNER, () => db.query("delete from payments where job_id = $1 and payer = 'insurer'", [j.id]));
    expect(await state()).toMatchObject({ status: "invoiced", amount_paid: "100.00", paid_at: null });
    // A job with payments can't be deleted, even after going back to estimate
    await expect(as(OWNER, () => db.query("delete from jobs where id = $1", [j.id]))).rejects.toThrow(/estimates and declined/);
  });

  it("deletes estimates and declined jobs only", async () => {
    const a = await create();
    await as(OWNER, () => db.query("insert into job_lines (job_id, kind, quantity, unit_price) values ($1, 'fee', 1, 10)", [a.id]));
    await as(OWNER, () => db.query("delete from jobs where id = $1", [a.id]));
    const { rows } = await as(OWNER, () => db.query("select 1 from jobs where id = $1", [a.id]));
    expect(rows).toHaveLength(0);

    const b = await create();
    await as(OWNER, () => db.query("update jobs set status = 'declined', declined_at = now() where id = $1", [b.id]));
    await as(OWNER, () => db.query("delete from jobs where id = $1", [b.id]));

    const c = await create();
    await as(OWNER, () => db.query("update jobs set status = 'approved', approval_method = 'phone', approved_total = 0 where id = $1", [c.id]));
    await expect(as(OWNER, () => db.query("delete from jobs where id = $1", [c.id]))).rejects.toThrow(/estimates and declined/);
  });

  it("issues an invoice already covered by earlier payments as paid", async () => {
    const j = await create();
    const upd = (sql: string) => as(OWNER, () => db.query(`update jobs set ${sql} where id = $1`, [j.id]));
    await upd("status = 'approved', approval_method = 'signed', approved_total = 100, approved_at = now()");
    await upd("status = 'ready'");
    await upd(`status = 'invoiced', invoice_date = current_date, invoice_totals = '{"total": 100}'`);
    await as(OWNER, () => db.query("insert into payments (job_id, amount, method) values ($1, 100, 'cash')", [j.id]));
    // Reopen to correct (e.g. a discount), re-invoice for less: already covered
    await upd("status = 'ready'");
    await upd("discount = 20");
    await upd(`status = 'invoiced', invoice_date = current_date, invoice_totals = '{"total": 90}'`);
    const { rows } = await as(OWNER, () => db.query<{ status: string }>("select status from jobs where id = $1", [j.id]));
    expect(rows[0].status).toBe("paid");
  });

  it("reopens an invoice for correction under the same number and unlocks it", async () => {
    const j = await create();
    const upd = (sql: string) => as(OWNER, () => db.query(`update jobs set ${sql} where id = $1`, [j.id]));
    await upd("status = 'approved', approval_method = 'signed', approved_total = 0, approved_at = now()");
    await upd("status = 'ready'");
    await upd(`status = 'invoiced', invoice_date = current_date, invoiced_at = now(), invoice_totals = '{"total": 0}'`);
    await upd("status = 'ready'");
    const { rows } = await as(OWNER, () => db.query<{ number: number; invoice_totals: unknown }>("select number, invoice_totals from jobs where id = $1", [j.id]));
    expect(rows[0]).toEqual({ number: j.number, invoice_totals: null });
    await upd("discount = 5");
  });

  it("won't delete a customer who has jobs", async () => {
    await expect(as(OWNER, () => db.query("delete from customers where id = $1", [customer]))).rejects.toThrow();
  });

  it("hides jobs from accounts that aren't staff and won't let them create one", async () => {
    const { rows } = await as(STRANGER, () => db.query("select * from jobs"));
    expect(rows).toHaveLength(0);
    await expect(as(STRANGER, () => db.query("select * from create_job($1, $2)", [customer, vehicle]))).rejects.toThrow();
  });
});

describe("files, inspections and quality check", () => {
  let jobId = "";

  beforeAll(async () => {
    await as(OWNER, async () => {
      const c = await db.query<{ id: string }>("insert into customers (name, phone) values ('Files Test', '1') returning id");
      const v = await db.query<{ id: string }>("insert into vehicles (customer_id, make) values ($1, 'Mazda') returning id", [c.rows[0].id]);
      const j = await db.query<{ id: string }>("select id from create_job($1, $2)", [c.rows[0].id, v.rows[0].id]);
      jobId = j.rows[0].id;
    });
  });

  it("creates a private bucket for job files", async () => {
    const { rows } = await db.query<{ public: boolean }>("select public from storage.buckets where id = 'job-files'");
    expect(rows).toEqual([{ public: false }]);
  });

  it("lets staff store files and hides them from everyone else", async () => {
    await as(OWNER, () => db.query("insert into storage.objects (bucket_id, name) values ('job-files', $1)", [`${jobId}/a.jpg`]));
    await expect(as(STRANGER, () => db.query("insert into storage.objects (bucket_id, name) values ('job-files', 'x/y.jpg')"))).rejects.toThrow();
    const mine = await as(OWNER, () => db.query("select name from storage.objects where bucket_id = 'job-files'"));
    const theirs = await as(STRANGER, () => db.query("select name from storage.objects where bucket_id = 'job-files'"));
    expect(mine.rows).toHaveLength(1);
    expect(theirs.rows).toHaveLength(0);
  });

  it("records photos with a stage and documents without one", async () => {
    await as(OWNER, () => db.query("insert into job_files (job_id, kind, stage, path) values ($1, 'photo', 'dropoff', $2)", [jobId, `${jobId}/a.jpg`]));
    await as(OWNER, () => db.query("insert into job_files (job_id, kind, path, mime) values ($1, 'document', $2, 'application/pdf')", [jobId, `${jobId}/b.pdf`]));
    await expect(as(OWNER, () => db.query("insert into job_files (job_id, kind, stage, path) values ($1, 'document', 'repair', 'c.pdf')", [jobId]))).rejects.toThrow();
    const theirs = await as(STRANGER, () => db.query("select * from job_files"));
    expect(theirs.rows).toHaveLength(0);
  });

  it("keeps one inspection per job, staff only", async () => {
    await as(OWNER, () => db.query(`insert into inspections (job_id, results) values ($1, '{"oil_level": {"status": "ok"}}')`, [jobId]));
    await expect(as(OWNER, () => db.query("insert into inspections (job_id) values ($1)", [jobId]))).rejects.toThrow();
    const theirs = await as(STRANGER, () => db.query("select * from inspections"));
    expect(theirs.rows).toHaveLength(0);
  });

  it("removes a job's file records and inspection with the job", async () => {
    await as(OWNER, () => db.query("delete from jobs where id = $1", [jobId]));
    const f = await as(OWNER, () => db.query("select 1 from job_files where job_id = $1", [jobId]));
    const i = await as(OWNER, () => db.query("select 1 from inspections where job_id = $1", [jobId]));
    expect(f.rows.length + i.rows.length).toBe(0);
  });
});

describe("check-in", () => {
  type Row = { id: string; number: number; customer_id: string; vehicle_id: string; concern: string; odometer_in: number | null };
  const checkIn = (args: unknown[]) =>
    as(OWNER, async () =>
      (await db.query<Row>("select id, number, customer_id, vehicle_id, concern, odometer_in from check_in($1, $2, $3, $4, $5, $6, $7, $8)", args)).rows[0],
    );
  const count = async (table: string) => (await as(OWNER, () => db.query<{ n: number }>(`select count(*)::int n from ${table}`))).rows[0].n;
  const nextNumber = async () => (await as(OWNER, () => db.query<{ n: number }>("select next_job_number n from shop_settings"))).rows[0].n;

  it("creates a new customer, their vehicle and the job in one step", async () => {
    const before = await nextNumber();
    const j = await checkIn([
      null,
      JSON.stringify({ name: "Walk In", phone: "613-555-0111" }),
      null,
      JSON.stringify({ plate: "CNRT 482", vin: "2HGFC2F5XJH512847", year: "2018", make: "Honda", model: "Civic", engine: "2.0L 4-cyl" }),
      96450,
      "Grinding noise when braking",
      null,
      null,
    ]);
    expect(j.number).toBe(before);
    expect(j.concern).toBe("Grinding noise when braking");
    expect(j.odometer_in).toBe(96450);
    const v = (await as(OWNER, () => db.query<{ customer_id: string; year: number; plate: string; odometer_km: number; engine: string }>("select customer_id, year, plate, odometer_km, engine from vehicles where id = $1", [j.vehicle_id]))).rows[0];
    expect(v).toEqual({ customer_id: j.customer_id, year: 2018, plate: "CNRT 482", odometer_km: 96450, engine: "2.0L 4-cyl" });
  });

  it("adds a new vehicle to an existing customer", async () => {
    const c = (await as(OWNER, () => db.query<{ id: string }>("select id from customers where name = 'Walk In'"))).rows[0].id;
    const j = await checkIn([c, null, null, JSON.stringify({ plate: "BXRT 100", make: "Ford", model: "Escape" }), null, "", null, null]);
    expect(j.customer_id).toBe(c);
    expect(j.odometer_in).toBeNull();
  });

  it("uses an existing vehicle and records the new odometer reading on it", async () => {
    const { customer_id, vehicle_id } = (await as(OWNER, () => db.query<{ customer_id: string; vehicle_id: string }>("select customer_id, vehicle_id from jobs where concern = 'Grinding noise when braking'"))).rows[0];
    const again = await checkIn([customer_id, null, vehicle_id, null, 98000, "Oil change", null, null]);
    expect(again.odometer_in).toBe(98000);
    const km = (await as(OWNER, () => db.query<{ odometer_km: number }>("select odometer_km from vehicles where id = $1", [vehicle_id]))).rows[0].odometer_km;
    expect(km).toBe(98000);
    // No reading given: the job starts from the last one, as before
    const third = await checkIn([customer_id, null, vehicle_id, null, null, "", null, null]);
    expect(third.odometer_in).toBe(98000);
  });

  it("saves nothing, and uses no job number, when any part fails", async () => {
    const [customers, vehicles, jobs, next] = [await count("customers"), await count("vehicles"), await count("jobs"), await nextNumber()];
    // That VIN is already on file
    await expect(checkIn([null, JSON.stringify({ name: "Dup", phone: "1" }), null, JSON.stringify({ vin: "2HGFC2F5XJH512847" }), null, "", null, null])).rejects.toThrow();
    // A customer with no name
    await expect(checkIn([null, JSON.stringify({ name: " " }), null, JSON.stringify({ plate: "X" }), null, "", null, null])).rejects.toThrow();
    expect([await count("customers"), await count("vehicles"), await count("jobs"), await nextNumber()]).toEqual([customers, vehicles, jobs, next]);
  });

  it("refuses another customer's vehicle and is staff only", async () => {
    const other = (await as(OWNER, () => db.query<{ id: string }>("insert into customers (name, phone) values ('Someone', '2') returning id"))).rows[0].id;
    const vehicle = (await as(OWNER, () => db.query<{ vehicle_id: string }>("select vehicle_id from jobs where concern = 'Oil change'"))).rows[0].vehicle_id;
    await expect(checkIn([other, null, vehicle, null, null, "", null, null])).rejects.toThrow(/doesn't belong/);
    await expect(
      as(STRANGER, () => db.query("select * from check_in(null, $1, null, $2, null, '', null, null)", [JSON.stringify({ name: "X", phone: "3" }), JSON.stringify({ plate: "Y" })])),
    ).rejects.toThrow();
  });
});
