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

    await expect(upd("status = 'paid'")).rejects.toThrow(/how the invoice was paid/);
    await upd("status = 'paid', payment_method = 'debit', amount_paid = 214.70, paid_at = now()");
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
