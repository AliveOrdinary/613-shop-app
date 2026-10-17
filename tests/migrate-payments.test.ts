// The live database has jobs marked paid the old way (one amount on the job). This runs the
// migrations up to jobs, creates that state, then applies the payments migration.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

it("moves an old single payment into payments and reopens a job that isn't fully paid", async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  `);
  const dir = path.join(__dirname, "..", "supabase", "migrations");
  const files = readdirSync(dir).sort();
  const payments = files.find((f) => f.includes("payments"))!;
  for (const f of files.filter((f) => f < payments)) await db.exec(readFileSync(path.join(dir, f), "utf8"));

  await db.exec(`
    insert into customers (id, name) values ('00000000-0000-0000-0000-0000000000c1', 'Old');
    insert into vehicles (id, customer_id) values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1');
  `);
  const mk = async (paidAmount: number) => {
    const { rows } = await db.query<{ id: string }>("select id from create_job('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000f1')");
    const id = rows[0].id;
    await db.query("update jobs set status='approved', approval_method='phone', approved_total=632.80 where id=$1", [id]);
    await db.query("update jobs set status='ready' where id=$1", [id]);
    await db.query(`update jobs set status='invoiced', invoice_date=current_date, invoice_totals='{"total": 632.80}' where id=$1`, [id]);
    await db.query("update jobs set status='paid', payment_method='debit', payment_reference='TEST 1234', amount_paid=$2, paid_at=now() where id=$1", [id, paidAmount]);
    return id;
  };
  const partial = await mk(300);
  const full = await mk(632.8);

  await db.exec(readFileSync(path.join(dir, payments), "utf8"));

  const job = async (id: string) =>
    (await db.query<{ status: string; amount_paid: string }>("select status, amount_paid from jobs where id=$1", [id])).rows[0];
  expect(await job(partial)).toEqual({ status: "invoiced", amount_paid: "300.00" });
  expect(await job(full)).toEqual({ status: "paid", amount_paid: "632.80" });
  const { rows } = await db.query<{ amount: string; method: string; reference: string; payer: string }>(
    "select amount, method, reference, payer from payments where job_id=$1",
    [partial],
  );
  expect(rows).toEqual([{ amount: "300.00", method: "debit", reference: "TEST 1234", payer: "customer" }]);
});
