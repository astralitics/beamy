/**
 * UI primitives — opinionated, used app-wide.
 *
 * Goals:
 *   - Form inputs feel modern (h-11, real focus rings, clear hierarchy).
 *   - Buttons have a single, consistent type system.
 *   - One <PageHeader> shape per page so visual rhythm stays.
 */
import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ButtonHTMLAttributes } from "react";
import { forwardRef, useState } from "react";

// ────────────────────── Page header ──────────────────────

export function PageHeader({
  eyebrow,
  title,
  lede,
  action,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="section-label">{eyebrow}</p>
        )}
        <h1 className="mt-1 font-display text-4xl font-normal leading-[1.1] tracking-tightest text-ink-900">
          {title}
        </h1>
        {lede && (
          <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-ink-500">
            {lede}
          </p>
        )}
      </div>
      {action && <div className="shrink-0 self-end">{action}</div>}
    </header>
  );
}

// ────────────────────── Section ──────────────────────

export function Section({
  label,
  hint,
  action,
  children,
}: {
  label: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-normal tracking-tight text-ink-900">
            {label}
          </h2>
          {hint && <p className="mt-0.5 text-sm text-ink-500">{hint}</p>}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

// ────────────────────── Buttons ──────────────────────

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "md" | "sm";

const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-ink-900 text-white hover:bg-ink-800",
  secondary:
    "border border-ink-200 bg-white text-ink-800 hover:bg-paper-50 hover:border-ink-300",
  ghost: "text-ink-700 hover:bg-paper-100",
  danger: "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50",
};

const BTN_SIZE: Record<ButtonSize, string> = {
  md: "h-10 px-4 text-sm",
  sm: "h-8 px-3 text-[13px]",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
  }
>(function Button(
  { variant = "secondary", size = "md", className = "", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={[
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900/15",
        "disabled:cursor-not-allowed disabled:opacity-50",
        BTN_VARIANT[variant],
        BTN_SIZE[size],
        className,
      ].join(" ")}
      {...rest}
    />
  );
});

// ────────────────────── Form primitives ──────────────────────

export function Field({
  label,
  hint,
  error,
  required,
  wide,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="flex items-baseline justify-between text-[13px] font-medium text-ink-700">
        <span>
          {label}
          {required && <span className="ml-0.5 text-accent-500">*</span>}
        </span>
        {hint && <span className="text-xs font-normal text-ink-400">{hint}</span>}
      </span>
      <div className="mt-1.5">{children}</div>
      {error && <p className="mt-1.5 text-xs text-rose-600">{error}</p>}
    </label>
  );
}

const inputBase =
  "block w-full rounded-md border border-ink-200 bg-white px-3.5 h-11 text-[15px] leading-6 text-ink-900 placeholder:text-ink-400 transition-colors focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...rest }, ref) {
    return <input ref={ref} className={`${inputBase} ${className}`} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = "", children, ...rest }, ref) {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={`${inputBase} appearance-none bg-white pr-9 ${className}`}
          {...rest}
        >
          {children}
        </select>
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 8 10 12 14 8" />
        </svg>
      </div>
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = "", rows = 3, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={`block w-full rounded-md border border-ink-200 bg-white px-3.5 py-2.5 text-[15px] leading-6 text-ink-900 placeholder:text-ink-400 transition-colors focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10 ${className}`}
        {...rest}
      />
    );
  },
);

// ────────────────────── MoneyInput ──────────────────────

/**
 * Amount + currency pair. The amount input grows; the currency sits
 * snug at the end. Avoids the flex/width fights that come from passing
 * `w-full` and `flex-1` to the same <Input>.
 */
export function MoneyInput({
  amount,
  currency,
  onAmountChange,
  onCurrencyChange,
  placeholder = "0.00",
  required,
  format = false,
}: {
  amount: string;
  currency: string;
  onAmountChange: (v: string) => void;
  onCurrencyChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  /** When true, show "$1,234.56" while not focused; emit clean digits. */
  format?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const amountValue =
    format && !focused && amount ? formatMoneyDisplay(amount) : amount;
  return (
    <div className="flex gap-2">
      <div className="flex-1">
        <Input
          value={amountValue}
          onChange={(e) =>
            onAmountChange(format ? stripMoney(e.target.value) : e.target.value)
          }
          onFocus={format ? () => setFocused(true) : undefined}
          onBlur={format ? () => setFocused(false) : undefined}
          placeholder={placeholder}
          inputMode="decimal"
          required={required}
        />
      </div>
      <div className="w-24">
        <Input
          value={currency}
          onChange={(e) => onCurrencyChange(e.target.value.toUpperCase())}
          className="text-center uppercase tracking-wider"
          maxLength={3}
          aria-label="Currency"
        />
      </div>
    </div>
  );
}

/** Strip everything but digits, dot, and minus — for money entry. */
function stripMoney(v: string): string {
  return v.replace(/[^0-9.\-]/g, "");
}

/** Format a raw decimal string for display as "$1,234.56". */
export function formatMoneyDisplay(raw: string): string {
  if (!raw) return "";
  const n = Number(raw);
  if (Number.isNaN(n)) return raw;
  return (
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/**
 * Amount input that shows "$1,234.56" when blurred and the raw digits
 * while editing. Emits the clean digit string via onChange. Use for
 * money fields that aren't paired with a currency selector.
 */
export const AmountInput = forwardRef<
  HTMLInputElement,
  {
    value: string;
    onChange: (v: string) => void;
    className?: string;
    placeholder?: string;
  }
>(function AmountInput(
  { value, onChange, className, placeholder = "0.00" },
  ref,
) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      ref={ref}
      value={focused || !value ? value : formatMoneyDisplay(value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => onChange(stripMoney(e.target.value))}
      placeholder={placeholder}
      inputMode="decimal"
      className={className ?? inputBase}
    />
  );
});

// ────────────────────── Modal shell ──────────────────────

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  size = "md",
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg" | "xl";
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/30 px-4 py-12 backdrop-blur-sm animate-fade"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${size === "xl" ? "max-w-5xl" : size === "lg" ? "max-w-3xl" : "max-w-xl"} animate-rise overflow-hidden rounded-2xl border border-ink-200/70 bg-white shadow-lift`}
      >
        <header className="border-b border-ink-100 px-7 pb-5 pt-6">
          <h2 className="font-display text-2xl font-normal tracking-tight text-ink-900">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-1 text-sm text-ink-500">{subtitle}</p>
          )}
        </header>
        <div className="px-7 py-6">{children}</div>
        {footer && (
          <div className="border-t border-ink-100 bg-paper-50 px-7 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────── Confirm dialog ──────────────────────

/**
 * In-app confirmation dialog — a styled replacement for the native
 * `confirm()`, which renders as an ugly system modal and is unreliable
 * on touch devices (tablets in particular). Built on Modal so it
 * inherits the blurred backdrop, focus trap, and touch-friendly
 * buttons. Pass `tone="danger"` for destructive actions.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = "default",
  loading = false,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  tone?: "default" | "danger";
  loading?: boolean;
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={() => {
        if (!loading) onClose();
      }}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "…" : confirmLabel}
          </Button>
        </div>
      }
    >
      {message && (
        <p className="text-[15px] leading-relaxed text-ink-700">{message}</p>
      )}
      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
    </Modal>
  );
}

// ────────────────────── Status pill ──────────────────────

type Tone = "neutral" | "accent" | "success" | "warn" | "alert" | "info" | "muted";

const TONE: Record<Tone, string> = {
  neutral: "bg-ink-100 text-ink-700 ring-ink-200",
  accent: "bg-accent-50 text-accent-700 ring-accent-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warn: "bg-amber-50 text-amber-700 ring-amber-200",
  alert: "bg-rose-50 text-rose-700 ring-rose-200",
  info: "bg-sky-50 text-sky-700 ring-sky-200",
  muted: "bg-paper-100 text-ink-500 ring-ink-200",
};

export function Pill({
  tone = "neutral",
  dot,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${TONE[tone]}`}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

// ────────────────────── Icons ──────────────────────

export function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  const path = ICONS[name];
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {path}
    </svg>
  );
}

type IconName =
  | "info"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "plus"
  | "search"
  | "menu"
  | "x";

const ICONS: Record<IconName, ReactNode> = {
  info: (
    <>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </>
  ),
  "chevron-down": <polyline points="6 9 12 15 18 9" />,
  "chevron-left": <polyline points="15 18 9 12 15 6" />,
  "chevron-right": <polyline points="9 18 15 12 9 6" />,
  plus: (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </>
  ),
  menu: (
    <>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </>
  ),
  x: (
    <>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </>
  ),
};
