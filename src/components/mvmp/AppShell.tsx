"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import {
  Activity,
  AlertTriangle,
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileClock,
  LayoutDashboard,
  LogOut,
  Mail,
  Map,
  Megaphone,
  Menu,
  MessageCircle,
  Package as PackageIcon,
  Plug,
  Receipt,
  Server as ServerIcon,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Store,
  User as UserIcon,
  Users,
  X,
  Boxes,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAppStore, type ViewKey } from "@/lib/store";
import { CURRENCY_STORAGE_KEY } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { apiFetch, QueryProvider } from "./lib";
import { LoginView } from "./LoginView";
import { NotificationsPanel } from "./NotificationsPanel";
import { ThemeToggle } from "./ThemeToggle";
import { RealtimeBridge, useRealtimeStore } from "./RealtimeBridge";
import { CurrencySwitcher } from "./CurrencySwitcher";

// ---------------------------------------------------------------------------
// Lazy-loaded views (code-split per view, only loaded when needed)
// ---------------------------------------------------------------------------

const ViewLoader = () => (
  <div className="space-y-4 p-1">
    <Skeleton className="h-8 w-64" />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-lg" />
      ))}
    </div>
    <Skeleton className="h-96 w-full rounded-lg" />
  </div>
);

// Admin views
const DashboardView = dynamic(
  () => import("./views/DashboardView").then((m) => m.DashboardView),
  { loading: () => <ViewLoader /> }
);
const ServersView = dynamic(
  () => import("./views/ServersView").then((m) => m.ServersView),
  { loading: () => <ViewLoader /> }
);
const ServerDetailView = dynamic(
  () => import("./views/ServerDetailView").then((m) => m.ServerDetailView),
  { loading: () => <ViewLoader /> }
);
const ProtocolsView = dynamic(
  () => import("./views/ProtocolsView").then((m) => m.ProtocolsView),
  { loading: () => <ViewLoader /> }
);
const VpnAccountsView = dynamic(
  () => import("./views/VpnAccountsView").then((m) => m.VpnAccountsView),
  { loading: () => <ViewLoader /> }
);
const CustomersView = dynamic(
  () => import("./views/CustomersView").then((m) => m.CustomersView),
  { loading: () => <ViewLoader /> }
);
const ResellersView = dynamic(
  () => import("./views/ResellersView").then((m) => m.ResellersView),
  { loading: () => <ViewLoader /> }
);
const PackagesView = dynamic(
  () => import("./views/PackagesView").then((m) => m.PackagesView),
  { loading: () => <ViewLoader /> }
);
const TransactionsView = dynamic(
  () => import("./views/TransactionsView").then((m) => m.TransactionsView),
  { loading: () => <ViewLoader /> }
);
const PaymentsView = dynamic(
  () => import("./views/PaymentsView").then((m) => m.PaymentsView),
  { loading: () => <ViewLoader /> }
);
const MonitoringView = dynamic(
  () => import("./views/MonitoringView").then((m) => m.MonitoringView),
  { loading: () => <ViewLoader /> }
);
const ServerMapView = dynamic(
  () => import("./views/ServerMapView").then((m) => m.ServerMapView),
  { loading: () => <ViewLoader /> }
);
const AuditLogsView = dynamic(
  () => import("./views/AuditLogsView").then((m) => m.AuditLogsView),
  { loading: () => <ViewLoader /> }
);
const EmailLogView = dynamic(
  () => import("./views/EmailLogView").then((m) => m.EmailLogView),
  { loading: () => <ViewLoader /> }
);
const WhatsappLiveChatView = dynamic(
  () => import("./views/whatsapp/WhatsappLiveChat").then((m) => m.WhatsappLiveChat),
  { loading: () => <ViewLoader /> }
);
const WhatsappBroadcastView = dynamic(
  () => import("./views/whatsapp/WhatsappBroadcast").then((m) => m.WhatsappBroadcast),
  { loading: () => <ViewLoader /> }
);
const WhatsappTemplatesView = dynamic(
  () => import("./views/whatsapp/WhatsappTemplates").then((m) => m.WhatsappTemplates),
  { loading: () => <ViewLoader /> }
);
const WhatsappIntegrationView = dynamic(
  () => import("./views/whatsapp/WhatsappIntegration").then((m) => m.WhatsappIntegration),
  { loading: () => <ViewLoader /> }
);
const AICenterView = dynamic(
  () => import("./views/ai/AICenterView").then((m) => m.AICenterView),
  { loading: () => <ViewLoader /> }
);
const SettingsView = dynamic(
  () => import("./views/SettingsView").then((m) => m.SettingsView),
  { loading: () => <ViewLoader /> }
);

// Portals (only loaded for matching role)
const CustomerPortal = dynamic(
  () => import("./portal/CustomerPortal").then((m) => m.CustomerPortal),
  { loading: () => <ViewLoader /> }
);
const ResellerPortal = dynamic(
  () => import("./portal/ResellerPortal").then((m) => m.ResellerPortal),
  { loading: () => <ViewLoader /> }
);

// ---------------------------------------------------------------------------
// Nav config
// ---------------------------------------------------------------------------

interface NavItem {
  key: ViewKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

// DASHBOARD placed at the very top (standalone, before all categories)
const DASHBOARD_ITEM: NavItem = {
  key: "dashboard",
  label: "Dashboard",
  icon: LayoutDashboard,
};

// Six categories — group labels are NOT navigation links, just headers.
// Submenu items map directly to existing AdminViewKey values (no route changes).
const NAV_GROUPS: NavGroup[] = [
  {
    group: "Operasional",
    items: [
      { key: "monitoring", label: "Monitoring", icon: Activity },
      { key: "server-map", label: "Server Map", icon: Map },
    ],
  },
  {
    group: "Infrastruktur",
    items: [
      // Label changed from "Server VPN" → "Server VPS" (route `servers` unchanged)
      { key: "servers", label: "Server VPS", icon: ServerIcon },
      { key: "protocols", label: "Protokol", icon: Boxes },
      { key: "vpn-accounts", label: "Akun VPN", icon: KeyRound },
    ],
  },
  {
    group: "Pengguna",
    items: [
      { key: "customers", label: "Pelanggan", icon: Users },
      { key: "resellers", label: "Reseller", icon: Store },
    ],
  },
  {
    group: "Bisnis",
    items: [
      { key: "packages", label: "Paket", icon: PackageIcon },
      { key: "transactions", label: "Transaksi", icon: Receipt },
      { key: "payments", label: "Pembayaran", icon: CreditCard },
    ],
  },
  {
    group: "WhatsApp",
    items: [
      { key: "wa-live-chat", label: "Live Chat", icon: MessageCircle },
      { key: "wa-broadcast", label: "Broadcast", icon: Megaphone },
      { key: "wa-templates", label: "Template Pesan", icon: Mail },
      { key: "wa-integration", label: "Integrasi", icon: Plug },
    ],
  },
  {
    group: "AI Center",
    items: [
      { key: "ai-center", label: "AI Management", icon: Sparkles },
    ],
  },
  {
    group: "Sistem",
    items: [
      { key: "audit-logs", label: "Audit Log", icon: FileClock },
      { key: "email-logs", label: "Log Email", icon: Mail },
      { key: "settings", label: "Pengaturan", icon: SettingsIcon },
    ],
  },
];

// ---------------------------------------------------------------------------
// AppShell — exported entry point
// ---------------------------------------------------------------------------

export function AppShell() {
  return (
    <QueryProvider>
      <AppShellInner />
    </QueryProvider>
  );
}

function AppShellInner() {
  const user = useAppStore((s) => s.user);
  const authLoading = useAppStore((s) => s.authLoading);
  const currency = useAppStore((s) => s.currency);
  const setUser = useAppStore((s) => s.setUser);
  const setAuthLoading = useAppStore((s) => s.setAuthLoading);

  // Bootstrap: check existing session
  React.useEffect(() => {
    let mounted = true;
    setAuthLoading(true);
    apiFetch<{ user: any }>("/api/auth/me")
      .then((d) => {
        if (mounted) setUser(d.user);
      })
      .catch(() => {
        if (mounted) setUser(null);
      })
      .finally(() => {
        if (mounted) setAuthLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [setUser, setAuthLoading]);

  // Restore saved display currency (post-hydration to avoid SSR mismatch)
  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CURRENCY_STORAGE_KEY);
      if (saved === "USD" || saved === "EUR") {
        useAppStore.getState().setCurrency(saved);
      }
    } catch {
      // storage unavailable
    }
  }, []);

  // Auto-simulator: tick every 30s when admin logged in (mock real-time metrics)
  // Increased from 20s to 30s to reduce background network chatter
  React.useEffect(() => {
    if (!user || (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN")) return;
    const id = setInterval(() => {
      fetch("/api/simulator/tick", { method: "POST" }).catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, [user]);

  if (authLoading) {
    return (
      <div className="bg-gradient-animated min-h-screen flex items-center justify-center">
        <div className="bg-grid absolute inset-0 opacity-50" />
        <div className="relative flex flex-col items-center gap-3">
          <ShieldCheck className="h-10 w-10 text-emerald-400 animate-pulse" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  // Route to appropriate portal based on role
  if (user.role === "CUSTOMER") {
    return (
      <>
        <RealtimeBridge />
        <div key={currency} className="contents">
          <CustomerPortal />
        </div>
      </>
    );
  }
  if (user.role === "RESELLER") {
    return (
      <>
        <RealtimeBridge />
        <div key={currency} className="contents">
          <ResellerPortal />
        </div>
      </>
    );
  }

  // Admin / Super Admin shell
  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <RealtimeBridge />
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main key={currency} className="flex-1 overflow-y-auto p-4 sm:p-6">
          <CurrentView />
        </main>
      </div>
      <NotificationsPanel />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Sidebar — desktop (sticky, collapsible) + mobile (drawer with overlay)
// ---------------------------------------------------------------------------

function Sidebar() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const mobileSidebarOpen = useAppStore((s) => s.mobileSidebarOpen);
  const setMobileSidebarOpen = useAppStore((s) => s.setMobileSidebarOpen);

  return (
    <>
      {/* Desktop sidebar — sticky, collapsible (w-64 ↔ w-16) */}
      <aside
        className={cn(
          "hidden md:flex sticky top-0 h-screen shrink-0 border-r border-border bg-sidebar flex-col transition-[width] duration-200 ease-out",
          sidebarOpen ? "w-64" : "w-16"
        )}
        aria-label="Sidebar navigasi utama"
      >
        <SidebarContent />
      </aside>

      {/* Mobile drawer — off-canvas with overlay */}
      {mobileSidebarOpen ? (
        <div className="md:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Sidebar mobile">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={() => setMobileSidebarOpen(false)}
          />
          {/* Drawer — always expanded on mobile (no collapsed mode) */}
          <aside className="relative w-72 max-w-[85vw] h-full bg-sidebar border-r border-border flex flex-col shadow-xl animate-in slide-in-from-left duration-200">
            {/* Close button */}
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(false)}
              aria-label="Tutup sidebar"
              className="absolute right-2 top-3 z-10 size-8 rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground flex items-center justify-center"
            >
              <X className="h-4 w-4" />
            </button>
            {/* Render sidebar content in forced-expanded mode */}
            <SidebarContent forceExpanded onClose={() => setMobileSidebarOpen(false)} />
          </aside>
        </div>
      ) : null}
    </>
  );
}

/**
 * Inner sidebar content — shared between desktop (collapsible) and mobile drawer.
 * When `forceExpanded` is true (mobile drawer), always shows full labels & ignores
 * the desktop `sidebarOpen` state. When `onClose` is provided, clicking a nav item
 * also closes the mobile drawer.
 */
function SidebarContent({
  forceExpanded = false,
  onClose,
}: {
  forceExpanded?: boolean;
  onClose?: () => void;
}) {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const currentView = useAppStore((s) => s.currentView);
  const collapsedGroups = useAppStore((s) => s.collapsedGroups);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const toggleGroup = useAppStore((s) => s.toggleGroup);
  const setGroupCollapsed = useAppStore((s) => s.setGroupCollapsed);
  const setView = useAppStore((s) => s.setView);

  // Effective expanded state: mobile drawer always expanded; desktop honors sidebarOpen
  const expanded = forceExpanded || sidebarOpen;

  // Auto-open category containing the active view — runs ONCE on mount only.
  // This handles the "user opens page via URL direct access" requirement: the active
  // menu's category is auto-expanded so the user can see what they're looking at.
  // We intentionally DON'T re-run on every currentView change, because that would
  // revert the user's manual "collapse this category" action whenever the active
  // view happens to be inside it. User preference (collapsedGroups in localStorage)
  // always wins after the initial mount.
  const didAutoOpenRef = React.useRef(false);
  React.useEffect(() => {
    if (didAutoOpenRef.current || forceExpanded) return;
    didAutoOpenRef.current = true;
    for (const g of NAV_GROUPS) {
      const hasActive = g.items.some(
        (it) =>
          currentView === it.key ||
          (it.key === "servers" && currentView === "server-detail")
      );
      if (hasActive && collapsedGroups[g.group]) {
        setGroupCollapsed(g.group, false);
      }
    }
  }, []);

  function handleNav(key: ViewKey) {
    setView(key);
    if (onClose) onClose();
  }

  // Render a single nav item button (shared between top Dashboard + category submenus)
  function renderNavItem(item: NavItem) {
    const Icon = item.icon;
    const active =
      currentView === item.key ||
      (item.key === "servers" && currentView === "server-detail");
    const button = (
      <button
        type="button"
        onClick={() => handleNav(item.key)}
        className={cn(
          "group relative flex items-center gap-2.5 w-full rounded-md text-sm transition-colors",
          expanded ? "px-2 py-2" : "justify-center px-0 py-2",
          active
            ? "bg-sidebar-accent text-foreground"
            : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
        )}
        title={!expanded ? item.label : undefined}
      >
        {active ? (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r bg-emerald-400" />
        ) : null}
        <Icon
          className={cn(
            "h-4 w-4 shrink-0",
            active ? "text-emerald-400" : "text-muted-foreground group-hover:text-foreground"
          )}
        />
        {expanded ? <span className="truncate">{item.label}</span> : null}
      </button>
    );
    if (!expanded) {
      return (
        <Tooltip key={item.key}>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
      );
    }
    return <React.Fragment key={item.key}>{button}</React.Fragment>;
  }

  return (
    <>
      {/* Brand header */}
      <div
        className={cn(
          "flex h-14 items-center gap-2 border-b border-border px-3 shrink-0",
          !expanded && "justify-center px-0"
        )}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 border border-emerald-500/30">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
        </div>
        {expanded ? (
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold leading-none text-foreground">MVMP</span>
            <span className="text-[10px] text-muted-foreground">Admin Panel</span>
          </div>
        ) : null}
      </div>

      {/* Nav scroll area */}
      <ScrollArea className="flex-1 min-h-0">
        <nav className="py-3 px-2 space-y-3" aria-label="Navigasi utama">
          {/* Dashboard — top, standalone, before categories */}
          <div className="space-y-1">
            {renderNavItem(DASHBOARD_ITEM)}
          </div>

          {/* Divider between Dashboard and categories */}
          <div className="h-px bg-border/40 mx-2" />

          {/* Categories (collapsible) */}
          {NAV_GROUPS.map((g) => {
            const isCollapsed = !!collapsedGroups[g.group];
            const hasActive = g.items.some(
              (it) =>
                currentView === it.key ||
                (it.key === "servers" && currentView === "server-detail")
            );

            // When sidebar is collapsed (icon-only mode), we don't render category
            // headers — just the items, same as before (each with tooltip).
            if (!expanded) {
              return (
                <div key={g.group} className="space-y-1">
                  <div className="h-px bg-border/40 mx-2" />
                  {g.items.map(renderNavItem)}
                </div>
              );
            }

            // Expanded mode: render category header with chevron toggle
            const HeaderIcon = ChevronDown;
            return (
              <div key={g.group} className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => toggleGroup(g.group)}
                  aria-expanded={!isCollapsed}
                  aria-controls={`cat-${g.group}`}
                  className={cn(
                    "group flex items-center justify-between w-full rounded-md px-2 py-1.5 text-[11px] uppercase tracking-wider font-semibold transition-colors",
                    hasActive
                      ? "text-foreground/90"
                      : "text-muted-foreground/70 hover:text-foreground"
                  )}
                  title={isCollapsed ? `Buka ${g.group}` : `Tutup ${g.group}`}
                >
                  <span className="truncate">{g.group}</span>
                  {isCollapsed ? (
                    <ChevronRight className="h-3 w-3 shrink-0 opacity-70 group-hover:opacity-100" />
                  ) : (
                    <HeaderIcon className="h-3 w-3 shrink-0 opacity-70 group-hover:opacity-100" />
                  )}
                </button>
                {/* Submenu — animated collapse */}
                <div
                  id={`cat-${g.group}`}
                  className={cn(
                    "space-y-0.5 overflow-hidden transition-all duration-200 ease-out",
                    isCollapsed ? "max-h-0 opacity-0" : "max-h-96 opacity-100"
                  )}
                >
                  {/* Indent submenu items for visual hierarchy */}
                  <div className="pl-2 space-y-0.5">
                    {g.items.map(renderNavItem)}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>
      </ScrollArea>

      {/* Collapse button (desktop only — hidden in mobile drawer which uses X) */}
      {!forceExpanded ? (
        <div className="border-t border-border p-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "w-full justify-center text-muted-foreground hover:text-foreground",
              !expanded && "px-0"
            )}
            onClick={toggleSidebar}
            aria-label={expanded ? "Ciutkan sidebar" : "Lebarkan sidebar"}
          >
            {expanded ? (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span className="text-xs">Ciutkan</span>
              </>
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </div>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Live badge — realtime socket connection indicator (Batch 3)
// ---------------------------------------------------------------------------

function LiveBadge() {
  const connected = useRealtimeStore((s) => s.connected);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "hidden md:flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium",
            connected
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
              : "border-border bg-muted/40 text-muted-foreground"
          )}
          role="status"
          aria-live="polite"
        >
          <span className="relative flex h-2 w-2">
            {connected ? (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            ) : null}
            <span
              className={cn(
                "relative inline-flex h-2 w-2 rounded-full",
                connected ? "bg-emerald-400" : "bg-zinc-400"
              )}
            />
          </span>
          Realtime
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {connected
          ? "Terhubung ke server realtime (socket.io)"
          : "Realtime terputus — memakai polling"}
      </TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Topbar
// ---------------------------------------------------------------------------

function Topbar() {
  const user = useAppStore((s) => s.user);
  const setView = useAppStore((s) => s.setView);
  const setNotifPanelOpen = useAppStore((s) => s.setNotifPanelOpen);
  const logout = useAppStore((s) => s.logout);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const setMobileSidebarOpen = useAppStore((s) => s.setMobileSidebarOpen);

  const { data: notifData } = useQuery<{ unreadCount: number }>({
    queryKey: ["notifications-count"],
    queryFn: () => apiFetch("/api/notifications"),
    refetchInterval: 60_000,
  });

  const unread = notifData?.unreadCount ?? 0;

  // Sidebar toggle handler — on small screens opens the drawer; on md+ collapses/expands.
  function handleSidebarToggle() {
    // We can't easily detect viewport from JS without matchMedia; use CSS-driven approach:
    // On md+ the drawer is hidden via `md:hidden`, so the same button should toggle desktop sidebar.
    // Simpler: check window width at click time.
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setMobileSidebarOpen(true);
    } else {
      toggleSidebar();
    }
  }

  async function handleLogout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      toast.success("Berhasil keluar");
      logout();
    } catch (e: any) {
      toast.error(e?.message || "Gagal keluar");
    }
  }

  const initials = (user?.name || user?.email || "A")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card/80 backdrop-blur-md px-4">
      <Button
        variant="ghost"
        size="icon"
        className="size-9"
        onClick={handleSidebarToggle}
        aria-label="Buka / tutup sidebar"
      >
        <Menu className="h-4 w-4" />
      </Button>

      <div className="relative flex-1 max-w-md">
        <Input
          placeholder="Cari server, akun, pelanggan…"
          className="h-9 bg-muted/40 border-transparent focus-visible:border-border"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              toast.info("Pencarian global akan datang");
            }
          }}
        />
      </div>

      <div className="flex items-center gap-1 ml-auto">
        <LiveBadge />
        <CurrencySwitcher />
        <ThemeToggle />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 relative"
              onClick={() => setNotifPanelOpen(true)}
              aria-label="Notifikasi"
            >
              <Bell className="h-4 w-4" />
              {unread > 0 ? (
                <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              ) : null}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Notifikasi</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/50 transition-colors"
              aria-label="Menu pengguna"
            >
              <Avatar className="size-8 border border-border">
                <AvatarFallback className="bg-emerald-500/15 text-emerald-400 text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-xs font-medium text-foreground leading-none">
                  {user?.name}
                </span>
                <span className="text-[10px] text-muted-foreground leading-none mt-0.5">
                  {user?.role}
                </span>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-medium">{user?.name}</span>
                <span className="text-xs text-muted-foreground font-normal">
                  {user?.email}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setView("settings")}>
              <UserIcon className="h-4 w-4" />
              Profil & Pengaturan
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setView("audit-logs")}>
              <FileClock className="h-4 w-4" />
              Audit Log
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setView("monitoring")}
            >
              <AlertTriangle className="h-4 w-4" />
              Monitoring
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-rose-400 focus:text-rose-400"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              Keluar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Current view router
// ---------------------------------------------------------------------------

function CurrentView() {
  const currentView = useAppStore((s) => s.currentView);
  switch (currentView) {
    case "dashboard":
      return <DashboardView />;
    case "servers":
      return <ServersView />;
    case "server-detail":
      return <ServerDetailView />;
    case "protocols":
      return <ProtocolsView />;
    case "vpn-accounts":
      return <VpnAccountsView />;
    case "customers":
      return <CustomersView />;
    case "resellers":
      return <ResellersView />;
    case "packages":
      return <PackagesView />;
    case "transactions":
      return <TransactionsView />;
    case "payments":
      return <PaymentsView />;
    case "monitoring":
      return <MonitoringView />;
    case "server-map":
      return <ServerMapView />;
    case "audit-logs":
      return <AuditLogsView />;
    case "email-logs":
      return <EmailLogView />;
    case "wa-live-chat":
      return <WhatsappLiveChatView />;
    case "wa-broadcast":
      return <WhatsappBroadcastView />;
    case "wa-templates":
      return <WhatsappTemplatesView />;
    case "wa-integration":
      return <WhatsappIntegrationView />;
    case "ai-center":
      return <AICenterView />;
    case "settings":
      return <SettingsView />;
    default:
      return <DashboardView />;
  }
}
