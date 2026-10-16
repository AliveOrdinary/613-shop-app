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
