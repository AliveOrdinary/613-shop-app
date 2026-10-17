"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "./ui";

export type JumpItem = {
  id: string;
  label: string;
  /** Small count or progress shown after the label, e.g. "3" or "9/10" */
  note?: string;
  /** Hide on wide screens, where that section is always in view (the totals column) */
  phoneOnly?: boolean;
};

/**
 * A row of section links that stays under the top bar, so a tech on a phone can go straight to
 * Photos or the quality check instead of scrolling past the line items. Highlights the section
 * currently on screen.
 */
export function JumpBar({ items }: { items: JumpItem[] }) {
  const [active, setActive] = useState<string | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const ids = items.map((i) => i.id).join("|");

  useEffect(() => {
    const els = ids
      .split("|")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (!els.length) return;
    const visible = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top);
          else visible.delete(e.target.id);
        }
        // The topmost section in the reading band wins
        const top = [...visible.entries()].sort((a, b) => a[1] - b[1])[0];
        if (top) setActive(top[0]);
      },
      // The band just below the top bar and this bar
      { rootMargin: "-120px 0px -55% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ids]);

  // Keep the highlighted chip visible when the row scrolls sideways on a phone
  useEffect(() => {
    if (!active || !bar.current) return;
    const row = bar.current;
    const chip = row.querySelector<HTMLElement>(`[data-jump="${active}"]`);
    if (!chip) return;
    // Scroll only the row sideways. scrollIntoView here would cancel the page's smooth scroll.
    const left = chip.offsetLeft - row.offsetLeft;
    if (left < row.scrollLeft || left + chip.offsetWidth > row.scrollLeft + row.clientWidth) {
      row.scrollTo({ left: Math.max(0, left - 16), behavior: "smooth" });
    }
  }, [active]);

  function go(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(id);
  }

  return (
    <nav aria-label="Jump to section" className="sticky top-14 z-10 -mx-4 mb-4 border-b border-line bg-canvas/95 px-4 py-2 backdrop-blur">
      <div ref={bar} className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((i) => (
          <a
            key={i.id}
            href={`#${i.id}`}
            data-jump={i.id}
            onClick={(e) => {
              e.preventDefault();
              go(i.id);
            }}
            aria-current={active === i.id ? "location" : undefined}
            className={cx(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium",
              active === i.id ? "border-ink bg-ink text-white" : "border-line bg-surface text-charcoal hover:border-charcoal",
              i.phoneOnly && "lg:hidden",
            )}
          >
            {i.label}
            {i.note ? <span className={cx("tabular text-xs", active === i.id ? "text-brand" : "text-faint")}>{i.note}</span> : null}
          </a>
        ))}
      </div>
    </nav>
  );
}
