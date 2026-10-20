-- Clears all customers, vehicles and jobs (with their lines, payments, photos' records and
-- inspections) and sets job numbers back to 200. Keeps the staff list, shop settings and logins.
--
-- PERMANENT. Run only to clear test data before the shop starts using the app, in the
-- Supabase SQL editor. It is not a migration and never runs by itself.
--
-- TRUNCATE is used on purpose: the app's own rules stop invoices and paid jobs from being
-- deleted one by one, and TRUNCATE skips those row rules.
--
-- The photo and PDF files themselves live in Storage and are removed separately:
-- Storage → job-files → select every folder → Delete.

begin;

truncate table
  public.payments,
  public.job_files,
  public.inspections,
  public.job_lines,
  public.jobs,
  public.vehicles,
  public.customers;

update public.shop_settings set next_job_number = 200 where id = 1;

commit;
