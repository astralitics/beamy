import { createContext, useCallback, useContext, type ReactNode } from "react";
import { trpc } from "../trpc";
import {
  messagesEn,
  messagesEsMx,
  type Locale,
  type MessageKey,
} from "./messages";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  formatRelative,
  formatTime,
} from "./formatters";

/**
 * LocaleContext — read once from the current org's `locale` column via
 * `me.whoami`. Falls back to "en" + "USD" while loading or when no org
 * is yet resolved. Per design D-51, org-driven locale (not a per-user
 * picker) — the whole agency sees one locale at a time.
 */

type LocaleValue = {
  locale: Locale;
  defaultCurrency: string;
};

const FALLBACK: LocaleValue = { locale: "en", defaultCurrency: "USD" };

const LocaleContext = createContext<LocaleValue>(FALLBACK);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const me = trpc.me.whoami.useQuery(undefined, { retry: false });
  // The whoami response doesn't currently include `locale`; we read it
  // separately if available, else fall back to en.
  const orgLocale = (me.data?.org as { locale?: string } | undefined)?.locale;
  const value: LocaleValue = {
    locale: orgLocale ?? FALLBACK.locale,
    defaultCurrency: me.data?.org.defaultCurrency ?? FALLBACK.defaultCurrency,
  };
  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleValue {
  return useContext(LocaleContext);
}

/**
 * Translation hook. Resolves a message key against the current locale's
 * catalog, falling back to English on missing keys.
 *
 *   const t = useT();
 *   <h1>{t("home.title")}</h1>
 *   <p>{t("welcome.name", { name: "Sarah" })}</p>  // "{name}" interpolation
 */
export function useT() {
  const { locale } = useLocale();
  return useCallback(
    (key: MessageKey, vars?: Record<string, string | number>): string => {
      const catalog = pickCatalog(locale);
      let msg = (catalog[key] ?? messagesEn[key] ?? key) as string;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          msg = msg.replaceAll(`{${k}}`, String(v));
        }
      }
      return msg;
    },
    [locale],
  );
}

/**
 * Formatter hook bound to the current locale + org's default currency.
 *
 *   const fmt = useFormatters();
 *   <span>{fmt.date(invoice.issuedAt)}</span>
 *   <span>{fmt.currency(bill.totalAmount, bill.totalCurrency)}</span>
 */
export function useFormatters() {
  const { locale, defaultCurrency } = useLocale();
  return {
    date: (d: Date | string) => formatDate(d, locale),
    dateTime: (d: Date | string) => formatDateTime(d, locale),
    time: (d: Date | string) => formatTime(d, locale),
    relative: (d: Date | string) => formatRelative(d, locale),
    number: (n: number) => formatNumber(n, locale),
    currency: (
      amount: string | number | null | undefined,
      currency?: string | null,
    ) => formatCurrency(amount, currency ?? defaultCurrency, locale),
  };
}

function pickCatalog(
  locale: string,
): Partial<Record<MessageKey, string>> {
  if (locale === "es-MX" || locale.startsWith("es")) return messagesEsMx;
  return messagesEn;
}
