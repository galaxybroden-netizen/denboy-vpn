"use client";

import { create } from "zustand";
import {
  setDisplayCurrency,
  CURRENCY_STORAGE_KEY,
  type CurrencyCode,
} from "./currency";

// Admin views
export type AdminViewKey =
  | "dashboard"
  | "servers"
  | "server-detail"
  | "server-map"
  | "protocols"
  | "vpn-accounts"
  | "customers"
  | "resellers"
  | "packages"
  | "transactions"
  | "payments"
  | "monitoring"
  | "audit-logs"
  | "email-logs"
  | "wa-live-chat"
  | "wa-broadcast"
  | "wa-templates"
  | "wa-integration"
  | "ai-center"
  | "settings";

// Customer portal views
export type CustomerViewKey =
  | "c-dashboard"
  | "c-packages"
  | "c-accounts"
  | "c-transactions"
  | "c-profile";

// Reseller portal views
export type ResellerViewKey =
  | "r-dashboard"
  | "r-customers"
  | "r-create-account"
  | "r-ledger"
  | "r-commissions"
  | "r-topup"
  | "r-profile";

export type ViewKey = AdminViewKey | CustomerViewKey | ResellerViewKey;

interface AppState {
  // Auth state
  user: { id: string; email: string; name: string; role: string; mfaEnabled: boolean } | null;
  authLoading: boolean;

  // Navigation
  currentView: ViewKey;
  selectedServerId: string | null;
  selectedEntityId: string | null;
  sidebarOpen: boolean;
  /** Per-category collapsed state (key = group label; true = collapsed).
   * Persisted to localStorage so refresh keeps the user's preference.
   * Categories not in the map default to expanded. */
  collapsedGroups: Record<string, boolean>;
  /** Mobile drawer open state (separate from desktop sidebarOpen). */
  mobileSidebarOpen: boolean;

  // Notifications panel
  notifPanelOpen: boolean;

  // Display currency (Batch 3 — multi-currency)
  currency: CurrencyCode;

  // Actions
  setUser: (u: AppState["user"]) => void;
  setAuthLoading: (b: boolean) => void;
  setView: (v: ViewKey) => void;
  openServer: (id: string) => void;
  setSidebarOpen: (b: boolean) => void;
  toggleSidebar: () => void;
  toggleGroup: (group: string) => void;
  setGroupCollapsed: (group: string, collapsed: boolean) => void;
  setMobileSidebarOpen: (b: boolean) => void;
  setNotifPanelOpen: (b: boolean) => void;
  setCurrency: (c: CurrencyCode) => void;
  logout: () => void;
}

// Default view based on role
export function defaultViewForRole(role: string): ViewKey {
  if (role === "CUSTOMER") return "c-dashboard";
  if (role === "RESELLER") return "r-dashboard";
  return "dashboard";
}

// localStorage keys (namespaced MVMP_*)
const SIDEBAR_OPEN_KEY = "MVMP_sidebarOpen";
const COLLAPSED_GROUPS_KEY = "MVMP_collapsedGroups";

/** Safe localStorage read — returns null if unavailable or parse fails. */
function readJSON<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Safe localStorage write — silently ignores if unavailable. */
function writeJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable or quota exceeded — ignore
  }
}

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === "true";
  } catch {
    return fallback;
  }
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  authLoading: true,
  currentView: "dashboard",
  selectedServerId: null,
  selectedEntityId: null,
  // Restore sidebar preferences from localStorage (SSR-safe — falls back to defaults)
  sidebarOpen: readBool(SIDEBAR_OPEN_KEY, true),
  collapsedGroups: readJSON<Record<string, boolean>>(COLLAPSED_GROUPS_KEY) ?? {},
  mobileSidebarOpen: false,
  notifPanelOpen: false,
  currency: "IDR" as CurrencyCode,

  setCurrency: (c) => {
    // Apply immediately to the formatter module, persist, then notify subscribers.
    // Views re-render because shells key their content on `currency`.
    setDisplayCurrency(c);
    try {
      if (typeof window !== "undefined") window.localStorage.setItem(CURRENCY_STORAGE_KEY, c);
    } catch {
      // storage unavailable — ignore
    }
    set({ currency: c });
  },

  setUser: (u) =>
    set((s) => ({
      user: u,
      currentView: u ? defaultViewForRole(u.role) : "dashboard",
    })),
  setAuthLoading: (b) => set({ authLoading: b }),
  setView: (v) => set({ currentView: v, selectedServerId: null, selectedEntityId: null, mobileSidebarOpen: false }),
  openServer: (id) => set({ currentView: "server-detail", selectedServerId: id, mobileSidebarOpen: false }),
  setSidebarOpen: (b) => {
    if (typeof window !== "undefined") {
      try { window.localStorage.setItem(SIDEBAR_OPEN_KEY, String(b)); } catch {}
    }
    set({ sidebarOpen: b });
  },
  toggleSidebar: () =>
    set((s) => {
      const next = !s.sidebarOpen;
      if (typeof window !== "undefined") {
        try { window.localStorage.setItem(SIDEBAR_OPEN_KEY, String(next)); } catch {}
      }
      return { sidebarOpen: next };
    }),
  toggleGroup: (group) =>
    set((s) => {
      const next = { ...s.collapsedGroups, [group]: !s.collapsedGroups[group] };
      writeJSON(COLLAPSED_GROUPS_KEY, next);
      return { collapsedGroups: next };
    }),
  setGroupCollapsed: (group, collapsed) =>
    set((s) => {
      const next = { ...s.collapsedGroups, [group]: collapsed };
      writeJSON(COLLAPSED_GROUPS_KEY, next);
      return { collapsedGroups: next };
    }),
  setMobileSidebarOpen: (b) => set({ mobileSidebarOpen: b }),
  setNotifPanelOpen: (b) => set({ notifPanelOpen: b }),
  logout: () => set({ user: null, currentView: "dashboard", selectedServerId: null, mobileSidebarOpen: false }),
}));
