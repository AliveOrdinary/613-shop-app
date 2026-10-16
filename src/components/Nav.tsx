"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

// Jobs joins this list when the job screens land.
const ITEMS = [
  { href: "/customers", label: "Customers", icon: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 19v-1a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8" },
  { href: "/settings", label: "Settings", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15.2H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.3V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function Nav() {
  const path = usePathname();
  const active = (h: string) => path === h || path.startsWith(`${h}/`);

  return (
    <>
      <header className="sticky top-0 z-20 bg-ink">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-8 px-4">
          <Link href="/" className="flex shrink-0 items-center" aria-label="613 Automotive home">
            {/* eslint-disable-next-line @next/next/no-img-element -- small static SVG logo */}
            <img src="/brand/mark-on-dark.svg" alt="613 Automotive" width={120} height={19} className="h-[22px] w-auto" />
          </Link>
          <nav className="hidden h-full gap-6 md:flex">
            {ITEMS.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                className={cx(
                  "flex items-center border-b-2 pt-0.5 text-sm font-medium",
                  active(i.href) ? "border-brand text-white" : "border-transparent text-[#b4b2a9] hover:text-white",
                )}
              >
                {i.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${ITEMS.length}, minmax(0, 1fr))` }}>
          {ITEMS.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={cx("relative flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium", active(i.href) ? "text-ink" : "text-muted")}
            >
              {active(i.href) ? <span className="absolute inset-x-6 top-0 h-[3px] bg-brand" aria-hidden /> : null}
              <Icon d={i.icon} />
              {i.label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
