// MVMP — Multi-currency support (Batch 3)
// All amounts in the database are stored in their own record currency
// (base: IDR). A global "display currency" (IDR/USD/EUR) converts every
// formatted amount on the fly. Rates are fixed mock rates for the MVP —
// in production these would come from an FX API with periodic refresh.

export type CurrencyCode = "IDR" | "USD" | "EUR";

export interface CurrencyMeta {
  code: CurrencyCode;
  label: string;
  symbol: string;
  locale: string;
  decimals: number;
  /** Units of this currency per 1 IDR (mock rate). */
  ratePerIdr: number;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyMeta> = {
  IDR: { code: "IDR", label: "Rupiah", symbol: "Rp", locale: "id-ID", decimals: 0, ratePerIdr: 1 },
  USD: { code: "USD", label: "US Dollar", symbol: "$", locale: "en-US", decimals: 2, ratePerIdr: 1 / 15800 },
  EUR: { code: "EUR", label: "Euro", symbol: "€", locale: "de-DE", decimals: 2, ratePerIdr: 1 / 17200 },
};

export const CURRENCY_CODES: CurrencyCode[] = ["IDR", "USD", "EUR"];

export function isCurrencyCode(v: unknown): v is CurrencyCode {
  return v === "IDR" || v === "USD" || v === "EUR";
}

/** Convert an amount between currencies (via IDR base). */
export function convertCurrency(amount: number, from: CurrencyCode, to: CurrencyCode): number {
  if (from === to) return amount;
  const amountIdr = amount / CURRENCIES[from].ratePerIdr;
  return amountIdr * CURRENCIES[to].ratePerIdr;
}

// --- Global display currency (client-side only) ---

let displayCurrency: CurrencyCode = "IDR";

export function getDisplayCurrency(): CurrencyCode {
  return displayCurrency;
}

export function setDisplayCurrency(c: CurrencyCode): void {
  displayCurrency = c;
}

export const CURRENCY_STORAGE_KEY = "mvmp-currency";
