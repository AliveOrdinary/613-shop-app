# Lessons

One line per correction, newest first. Read before starting work; add a line whenever
you're corrected, so the same mistake doesn't come back.

- Temporary preview routes for screenshots (`src/app/preview`, `/preview` in `PUBLIC_PATHS`)
  must be removed before committing.
- Components in `src/components/ui.tsx` are client-only: a server component can't call `cx()`.
- `loading.tsx` doesn't show while a layout awaits data. The staff check in
  `src/app/(app)/layout.tsx` sits inside `<Suspense>` for that reason; keep it there.
- Modals render through a portal to `document.body`: a sticky parent creates a stacking
  context that would hide them.
- Quick taps (intake chips, quality check, inspection) must build on the latest value in a
  ref, not on state captured in a closure, or one tap overwrites the other.
- PostgREST: don't order an embedded resource by its alias; sort the rows in code.
- Start the dev server with `./node_modules/.bin/next dev` from the repo; `npx next` can
  fetch a different Next.js version.
- CRA requires the HST number on invoices of $100 or more (SOR/91-45 s.3), not $500.
- `tsc` on its own fails on a fresh checkout (`PageProps`, `LayoutProps` not found): route
  types come from `next typegen`, which `npm run typecheck` runs first.
