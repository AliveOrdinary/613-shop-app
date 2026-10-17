# 613 Automotive shop app

Estimates, work orders, inspection checklists and invoices for 613 Automotive (collision, paint and mechanical). Built for the front desk and for phones and tablets in the bay.

**Built so far:** branding, sign-in, shop settings, customers and vehicles, jobs (estimate → approved → ready → invoiced → paid) with line items, insurance split, payments and totals, photos (drop-off, during repair, completed) and insurer PDFs on file, the mechanical inspection checklist, the final quality check, and printable PDFs (estimate, work order, invoice, inspection).
**Maybe later:** emailing documents to customers.

PDFs are built in `src/lib/pdf/documents.ts` and served from `/api/jobs/<id>/pdf?doc=estimate|work-order|invoice|inspection`. To look at them without the app: `PDF_OUT=out npm test -- tests/pdf.test.ts` writes the four documents for a sample job into `out/`. After changing the logo, run `python3 scripts/pdf-assets.py`.

Photos and documents live in the private Supabase Storage bucket `job-files` (created by the migration), one folder per job. Photos are shrunk on the phone to 2000 px before upload. Links to them last an hour.

All money is worked out in one place, `src/lib/totals.ts`, which the screens (and later the PDFs) share. Its tests include 613's own sample estimate.

## Stack

Next.js 16 · React 19 · Tailwind 4 · Supabase (Postgres, auth, storage) · jsPDF for documents · Vitest

## Setup

### 1. Supabase

1. Create a project.
2. **SQL editor:** run each file in `supabase/migrations/` in order.
3. **Authentication → Sign In / Providers:** turn **off** "Allow new users to sign up". Staff accounts are created by hand.
4. **Authentication → Users → Add user:** create the owner's account (email + password, auto-confirm).
   The first account ever created is put on the staff list automatically.
5. To add more staff later: create their user, then add a row with their user id to the `staff` table (Table editor).

Anyone signed in but not on the staff list sees a "Not on the staff list" screen and no data.

### 2. Environment

Copy `.env.example` to `.env.local` and fill in, from **Project settings → API keys**:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (`sb_publishable_…`) |

### 3. Run

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # database rules + logic, runs the real migration in PGlite
npm run typecheck
npm run lint
```

## Brand

Colours, fonts and the stripes motif live in `src/app/globals.css`.

| Token | Hex | Use |
| --- | --- | --- |
| ink | `#0B0B0B` | top bar, text |
| charcoal | `#3B3B3B` | secondary text |
| brand (613 yellow) | `#FDCE07` | the one main button on a screen, highlights. Never as text on white |
| canvas | `#F4F4F1` | page background |

Headings, job numbers and totals use **Saira** semibold italic (`.display`); everything else uses **Inter**. Both are self-hosted.

Logo files are in `public/brand/` (on-dark, on-light, print, and the compact `mark-*` versions). They were redrawn from the client's JPEG with `scripts/trace_logo.py`: the "613" and "AUTOMOTIVE" lettering is traced, the stripes and rules are clean geometry, and the tagline is set in Saira.
