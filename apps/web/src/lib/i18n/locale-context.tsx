import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { trpc } from "../trpc";
import { useVertical } from "../vertical";
import {
  messagesEn,
  messagesEsMx,
  type Locale,
  type MessageKey,
} from "./messages";
import { verticalMessages } from "./vertical-messages";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  formatRelative,
  formatTime,
} from "./formatters";

/**
 * LocaleContext — locale resolution with a client-side override.
 *
 * Resolution order:
 *   1. localStorage["beamy.locale"] if set (user explicitly toggled it)
 *   2. The org's `locale` column via `me.whoami`
 *   3. Fallback "en"
 *
 * The toggle in the sidebar writes to localStorage. We expose `setLocale`
 * for that. The org-driven default still applies for new visitors.
 */

const STORAGE_KEY = "beamy.locale";

type LocaleValue = {
  locale: Locale;
  defaultCurrency: string;
  setLocale: (next: Locale) => void;
};

const FALLBACK: LocaleValue = {
  locale: "en",
  defaultCurrency: "USD",
  setLocale: () => {},
};

const LocaleContext = createContext<LocaleValue>(FALLBACK);

function readStoredLocale(): Locale | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === "en" || v === "es-MX") return v;
  return null;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const me = trpc.me.whoami.useQuery(undefined, { retry: false });
  const orgLocale = (me.data?.org as { locale?: string } | undefined)?.locale;

  const [override, setOverride] = useState<Locale | null>(() =>
    readStoredLocale(),
  );

  // Keep state in sync if another tab toggles via storage event.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      if (e.newValue === "en" || e.newValue === "es-MX") {
        setOverride(e.newValue);
      } else if (e.newValue === null) {
        setOverride(null);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const resolved: Locale =
    override ?? (orgLocale === "es-MX" || orgLocale === "en"
      ? (orgLocale as Locale)
      : FALLBACK.locale);

  const setLocale = useCallback((next: Locale) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
    setOverride(next);
  }, []);

  const value: LocaleValue = {
    locale: resolved,
    defaultCurrency: me.data?.org.defaultCurrency ?? FALLBACK.defaultCurrency,
    setLocale,
  };
  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleValue {
  return useContext(LocaleContext);
}

export function useT() {
  const { locale } = useLocale();
  const vertical = useVertical();
  return useCallback(
    (key: MessageKey, vars?: Record<string, string | number>): string => {
      // Vertical overrides win over the base catalog: locale-specific first,
      // then the vertical's English override, then the base copy.
      const vLocale = verticalMessages[vertical]?.[locale];
      const vEn = verticalMessages[vertical]?.en;
      const catalog = pickCatalog(locale);
      let msg = (vLocale?.[key] ??
        vEn?.[key] ??
        catalog[key] ??
        messagesEn[key] ??
        key) as string;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          msg = msg.replaceAll(`{${k}}`, String(v));
        }
      }
      return msg;
    },
    [locale, vertical],
  );
}

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
