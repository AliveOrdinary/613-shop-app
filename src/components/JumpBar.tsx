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
    let frame = 0;
    const update = () => {
      frame = 0;
      // The current section is the last one whose top has reached the line under the bars.
      // Sections whose chip is hidden (the totals column on wide screens) don't count.
      let current: string | null = null;
      for (const id of ids.split("|")) {
        const el = document.getElementById(id);
        const chip = bar.current?.querySelector<HTMLElement>(`[data-jump="${id}"]`);
        if (!el || !chip || chip.offsetParent === null) continue;
        if (el.getBoundingClientRect().top <= 140) current = id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
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
