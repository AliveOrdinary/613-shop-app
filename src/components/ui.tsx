"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dangerGhost";

// Primary = 613 yellow with ink text: the one main action on a screen.
const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-ink hover:bg-brand-hover disabled:bg-line disabled:text-faint",
  secondary: "bg-surface text-ink border border-line hover:bg-canvas disabled:text-faint",
  ghost: "text-ink hover:bg-canvas disabled:text-faint",
  danger: "bg-surface text-bad border border-line hover:bg-bad-soft",
  dangerGhost: "text-bad hover:bg-bad-soft",
};

// Sizes are touch-first: md is 44px tall, the minimum comfortable tap target.
const SIZES = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-[15px]",
  lg: "h-12 px-5 text-base",
} as const;

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof SIZES }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 disabled:cursor-not-allowed",
        SIZES[size],
        VARIANTS[variant],
        className,
      )}
    />
  );
}

const FIELD =
  "rounded-lg border border-line bg-surface px-3 text-ink placeholder:text-faint focus:border-ink focus:outline-none focus:ring-2 focus:ring-brand/60";

/** Full width unless the caller sets its own width class. */
function width(className?: string): string {
  return className && /(^|\s)w-/.test(className) ? "" : "w-full";
}

// 16px text stops iOS from zooming into fields.
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(FIELD, width(className), "h-11 text-base", className)} />;
}

export function NumberInput({
  value,
  onValue,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number | null;
  onValue: (v: number | null) => void;
}) {
  return (
    <input
      {...props}
      type="number"
      inputMode="decimal"
      value={value ?? ""}
      onChange={(e) => onValue(e.target.value === "" ? null : Number(e.target.value))}
      onFocus={(e) => e.target.select()}
      className={cx(FIELD, width(className), "tabular h-11 text-base", className)}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(FIELD, width(className), "h-11 text-base", className)} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(FIELD, width(className), "py-2.5 text-base", className)} />;
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-[13px] font-medium text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-xl border border-line bg-surface", className)}>{children}</div>;
}

type Tone = "neutral" | "ok" | "warn" | "bad" | "brand";
const TONES: Record<Tone, string> = {
  neutral: "bg-canvas text-charcoal",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  brand: "bg-brand-soft text-brand-deep",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", TONES[tone], className)}>
      {children}
    </span>
  );
}

/** Page heading in the slanted display face, with an optional action on the right. */
export function PageTitle({ children, action, sub }: { children: ReactNode; action?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="display text-[26px] leading-tight text-ink">{children}</h1>
        {sub ? <p className="mt-0.5 text-sm text-muted">{sub}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="text-base font-semibold text-ink">{children}</h2>
      {action}
    </div>
  );
}

export function Notice({ tone = "warn", children }: { tone?: Tone; children: ReactNode }) {
  return <div className={cx("rounded-lg px-3 py-2 text-sm", TONES[tone])}>{children}</div>;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx("h-4 w-4 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface px-4 py-10 text-center">
      <p className="font-medium text-ink">{title}</p>
      {children ? <div className="mt-1 text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function Stripes({ className }: { className?: string }) {
  return (
    <span className={cx("stripes", className)} aria-hidden>
      <span />
      <span />
      <span />
    </span>
  );
}

/** A simple modal. Sits above the page; tapping the backdrop or Escape closes it. */
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="display text-xl text-ink">{title}</h2>
          <button onClick={onClose} className="-mr-2 flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-canvas" aria-label="Close">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** A row of checkbox chips: tap to toggle. */
export function ChipToggles({ options, value, onChange, disabled }: { options: string[]; value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            role="checkbox"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
            className={cx(
              "inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors disabled:opacity-60",
              on ? "border-ink bg-ink text-white" : "border-line bg-surface text-charcoal hover:border-faint",
            )}
          >
            {on ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-brand" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
                <path d="m5 12 5 5 9-10" />
              </svg>
            ) : null}
            {o}
          </button>
        );
      })}
    </div>
  );
}
