@AGENTS.md

# 613 Automotive shop app

Estimates, work orders, inspections and invoices for 613 Automotive, a collision, paint and
mechanical shop in Kingston, Ontario. Used at the front desk and on phones and tablets in the bay.

## Stack

- Next.js 16 App Router (React 19, Tailwind 4): screens in `src/app/(app)`, PDFs served
  from `src/app/api/jobs/[id]/pdf`.
- Supabase: Postgres with row-level security (only accounts on the `staff` list see
  anything), auth, and the private `job-files` storage bucket. Schema, status rules and the
  `check_in` / `quick_sale` functions are in `supabase/migrations`.
- jsPDF builds the estimate, work order, invoice and inspection (`src/lib/pdf/documents.ts`).
- NHTSA vPIC decodes VINs and lists models, called from the browser (`src/lib/vpic.ts`).
- Pure logic lives in `src/lib` and is tested in `tests/`.

## Commands

- `npm run dev`: local app (needs `.env.local`; see `.env.example`).
- `npm test`: Vitest. Logic, PDFs, and every migration with its security rules in an
  in-memory Postgres. `PDF_OUT=out npm test -- tests/pdf.test.ts` writes sample PDFs.
- `npm run typecheck`, `npm run lint`.
- Run `npm test`, `npm run typecheck` and `npm run lint` before saying a task is done.
  `/check` runs all three and reports without fixing.

## Rules

- All money goes through `jobTotals` in `src/lib/totals.ts`, in whole cents. Don't add up
  money anywhere else.
- An invoice freezes its lines and totals (`invoice_totals`). Changes go through "Reopen
  for correction", never around it.
- Status moves (estimate → approved → ready → invoiced → paid) are enforced by database
  triggers, and paid follows the payments. Don't set a status the triggers wouldn't allow.
- Every sale is recorded, and every invoice carries HST. Never build a way to keep a sale
  off the books or invoice without HST.
- Ontario repair rules shape the documents: written estimate and a record of the approval,
  final bill at most 10% over the approved estimate, VIN, odometer in and out (optional,
  printed as blanks), and the HST number on invoices of $100 or more.
- Payment references hold the last 4 digits at most, never a full card number.
- Inspection item keys are stored in the database: rename labels freely, never change a key.
- Schema changes go in a new migration file; never edit an old one. Migrations are run by
  hand in the Supabase SQL editor, so the app must keep working until a new one has run.
- Pushing to `main` deploys to production on Vercel. Work on a branch.
- Never commit `.env.local`, keys, or temporary preview routes.

## Read before touching

- Money: the comment at the top of `src/lib/totals.ts`, and `tests/totals.test.ts`.
- Status rules: `job_status_guard` in `supabase/migrations/20261017000000_payments.sql`.
- PDFs: README, then the top of `src/lib/pdf/documents.ts`.
- Saved items and copying lines: the top of `src/lib/reuse.ts`.
- Past mistakes: `agent_docs/lessons.md`. Add a line there whenever you're corrected.
