"use client";

// Shown the moment a page is tapped, while its data loads, so the app never looks frozen.
// Shapes follow the real pages closely so nothing jumps when the content arrives.

import { Card, cx } from "./ui";

function Bar({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cx("animate-pulse rounded-md bg-line/70", className)} style={style} />;
}

function Loading({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div role="status" aria-label={label}>
      {children}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Jobs and Customers: title and button, search, then rows */
export function ListSkeleton({ label = "Loading", chips = false }: { label?: string; chips?: boolean }) {
  return (
    <Loading label={label}>
      <div className="mb-5 flex items-end justify-between gap-3">
        <Bar className="h-8 w-36" />
        <Bar className="h-11 w-28 rounded-lg" />
      </div>
      <Bar className="mb-3 h-11 w-full rounded-lg" />
      {chips ? (
        <div className="mb-4 flex gap-2">
          {[24, 20, 16, 20, 12].map((w, i) => (
            <Bar key={i} className="h-9 rounded-full!" style={{ width: `${w * 4}px` }} />
          ))}
        </div>
      ) : null}
      <Card className="divide-y divide-line overflow-hidden">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <div className="min-w-0 flex-1 space-y-2">
              <Bar className="h-4 w-2/5" />
              <Bar className="h-3.5 w-3/5" />
            </div>
            <Bar className="h-4 w-16" />
          </div>
        ))}
      </Card>
    </Loading>
  );
}

/** One job: number and status, progress, buttons, then the cards and the totals beside them */
export function JobSkeleton() {
  return (
    <Loading label="Loading job">
      <Bar className="mb-3 h-4 w-14" />
      <div className="mb-5 space-y-2">
        <Bar className="h-8 w-40" />
        <Bar className="h-4 w-56" />
      </div>
      <div className="mb-5 grid grid-cols-5 gap-1.5">
        {Array.from({ length: 5 }, (_, i) => (
          <Bar key={i} className="h-1.5 rounded-full!" />
        ))}
      </div>
      <div className="mb-6 flex gap-2">
        <Bar className="h-11 w-40 rounded-lg" />
        <Bar className="h-11 w-28 rounded-lg" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          {[2, 4, 3].map((rows, i) => (
            <Card key={i} className="space-y-3 p-4">
              <Bar className="h-5 w-40" />
              {Array.from({ length: rows }, (_, j) => (
                <Bar key={j} className="h-4" style={{ width: `${90 - j * 15}%` }} />
              ))}
            </Card>
          ))}
        </div>
        <Card className="hidden space-y-3 self-start p-4 lg:block">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex justify-between">
              <Bar className="h-4 w-24" />
              <Bar className="h-4 w-16" />
            </div>
          ))}
        </Card>
      </div>
    </Loading>
  );
}

/** Forms and everything else: a title and a couple of cards */
export function PageSkeleton() {
  return (
    <Loading label="Loading">
      <Bar className="mb-5 h-8 w-44" />
      <div className="space-y-4">
        {[4, 3].map((rows, i) => (
          <Card key={i} className="space-y-3 p-4">
            <Bar className="h-5 w-36" />
            {Array.from({ length: rows }, (_, j) => (
              <Bar key={j} className="h-11 w-full rounded-lg" />
            ))}
          </Card>
        ))}
      </div>
    </Loading>
  );
}
