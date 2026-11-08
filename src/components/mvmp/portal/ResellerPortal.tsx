"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  Package as PackageIcon,
  Percent,
  PlusCircle,
  Receipt,
  ShieldCheck,
  User as UserIcon,
  UserPlus,
  Users,
  Wallet,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { useAppStore, type ResellerViewKey } from "@/lib/store";
import { cn } from "@/lib/utils";
import { apiFetch } from "../lib";
import { NotificationsPanel } from "../NotificationsPanel";
import { ThemeToggle } from "../ThemeToggle";
import { CurrencySwitcher } from "../CurrencySwitcher";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { formatCurrency } from "@/lib/utils-mvmp";

// Lazy-load views for code-splitting
const ViewLoader = () => (
  <div className="space-y-4">
    <Skeleton className="h-8 w-64" />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-lg" />
      ))}
    </div>
    <Skeleton className="h-96 w-full rounded-lg" />
  </div>
);

const ResellerDashboard = dynamic(
  () => import("./views/ResellerDashboard").then((m) => m.ResellerDashboard),
  { loading: () => <ViewLoader /> }
);
const ResellerCustomers = dynamic(
  () => import("./views/ResellerCustomers").then((m) => m.ResellerCustomers),
  { loading: () => <ViewLoader /> }
);
const ResellerCreateAccount = dynamic(
  () => import("./views/ResellerCreateAccount").then((m) => m.ResellerCreateAccount),
  { loading: () => <ViewLoader /> }
);
const ResellerLedger = dynamic(
  () => import("./views/ResellerLedger").then((m) => m.ResellerLedger),
  { loading: () => <ViewLoader /> }
);
const ResellerCommissions = dynamic(
  () => import("./views/ResellerCommissions").then((m) => m.ResellerCommissions),
  { loading: () => <ViewLoader /> }
);
const ResellerTopup = dynamic(
  () => import("./views/ResellerTopup").then((m) => m.ResellerTopup),
  { loading: () => <ViewLoader /> }
);
const ResellerProfile = dynamic(
  () => import("./views/ResellerProfile").then((m) => m.ResellerProfile),
  { loading: () => <ViewLoader /> }
);

interface NavItem {
  key: ResellerViewKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_GROUPS: { group: string; items: NavItem[] }[] = [
  {
    group: "Utama",
    items: [
      { key: "r-dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    group: "Pelanggan",
    items: [
      { key: "r-customers", label: "Pelanggan Saya", icon: Users },
      { key: "r-create-account", label: "Buat Akun VPN", icon: UserPlus },
    ],
  },
  {
    group: "Keuangan",
    items: [
      { key: "r-ledger", label: "Ledger Saldo", icon: Wallet },
      { key: "r-commissions", label: "Komisi", icon: Percent },
      { key: "r-topup", label: "Topup Saldo", icon: PlusCircle },
    ],
  },
  {
    group: "Akun",
    items: [{ key: "r-profile", label: "Profil", icon: UserIcon }],
  },
];

export function ResellerPortal() {
  const user = useAppStore((s) => s.user);
  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <CurrentView />
        </main>
      </div>
      <NotificationsPanel />
      <ChatWidget context="reseller" userName={user?.name} />
    </div>
  );
}

function Sidebar() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const currentView = useAppStore((s) => s.currentView);
  const setView = useAppStore((s) => s.setView);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);

  return (
    <aside
      className={cn(
        "sticky top-0 h-screen shrink-0 border-r border-border bg-sidebar flex flex-col transition-all duration-200",
        sidebarOpen ? "w-64" : "w-16"
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center gap-2 border-b border-border px-3",
          !sidebarOpen && "justify-center px-0"
        )}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-cyan-500/15 border border-cyan-500/30">
          <ShieldCheck className="h-4 w-4 text-cyan-400" />
        </div>
        {sidebarOpen ? (
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold leading-none text-foreground">
              MVMP Reseller
            </span>
            <span className="text-[10px] text-muted-foreground">
              Portal Reseller
            </span>
          </div>
        ) : null}
      </div>

      <ScrollArea className="flex-1">
        <nav className="py-3 px-2 space-y-4">
          {NAV_GROUPS.map((g) => (
            <div key={g.group} className="space-y-1">
              {sidebarOpen ? (
                <p className="px-2 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                  {g.group}
                </p>
              ) : (
                <div className="h-px bg-border/40 mx-2" />
              )}
              {g.items.map((item) => {
                const Icon = item.icon;
                const active = currentView === item.key;
                const button = (
                  <button
                    type="button"
                    onClick={() => setView(item.key)}
                    className={cn(
                      "group relative flex items-center gap-2.5 w-full rounded-md text-sm transition-colors",
                      sidebarOpen ? "px-2 py-2" : "justify-center px-0 py-2",
                      active
                        ? "bg-sidebar-accent text-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                    )}
                    title={!sidebarOpen ? item.label : undefined}
                  >
                    {active ? (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r bg-cyan-400" />
                    ) : null}
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        active
                          ? "text-cyan-400"
                          : "text-muted-foreground group-hover:text-foreground"
                      )}
                    />
                    {sidebarOpen ? (
                      <span className="truncate">{item.label}</span>
                    ) : null}
                  </button>
                );
                return !sidebarOpen ? (
                  <Tooltip key={item.key}>
                    <TooltipTrigger asChild>{button}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                ) : (
                  <React.Fragment key={item.key}>{button}</React.Fragment>
                );
              })}
            </div>
          ))}
        </nav>
      </ScrollArea>

      <div className="border-t border-border p-2">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "w-full justify-center text-muted-foreground hover:text-foreground",
            !sidebarOpen && "px-0"
          )}
          onClick={toggleSidebar}
        >
          {sidebarOpen ? (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span className="text-xs">Ciutkan</span>
            </>
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      </div>
    </aside>
  );
}

function Topbar() {
  const user = useAppStore((s) => s.user);
  const setView = useAppStore((s) => s.setView);
  const setNotifPanelOpen = useAppStore((s) => s.setNotifPanelOpen);
  const logout = useAppStore((s) => s.logout);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);

  const { data: notifData } = useQuery<{ unreadCount: number }>({
    queryKey: ["notifications-count"],
    queryFn: () => apiFetch("/api/notifications"),
    refetchInterval: 60_000,
  });

  const unread = notifData?.unreadCount ?? 0;

  // Fetch balance from dashboard endpoint (cached)
  const { data: dashData } = useQuery<{ profile?: { balance: number } }>({
    queryKey: ["reseller-dashboard-mini"],
    queryFn: () => apiFetch("/api/portal/reseller/dashboard"),
    staleTime: 30_000,
  });

  async function handleLogout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      toast.success("Berhasil keluar");
      logout();
    } catch (e: any) {
      toast.error(e?.message || "Gagal keluar");
    }
  }

  const initials = (user?.name || user?.email || "R")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const balance = dashData?.profile?.balance ?? 0;

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card/80 backdrop-blur-md px-4">
      <Button
        variant="ghost"
        size="icon"
        className="size-9"
        onClick={toggleSidebar}
        aria-label="Toggle sidebar"
      >
        <Menu className="h-4 w-4" />
      </Button>

      <div className="flex items-center gap-2 flex-1 min-w-0">
        <h2 className="text-sm font-semibold text-foreground truncate">
          Portal Reseller
        </h2>
        <Badge
          variant="outline"
          className="hidden sm:inline-flex bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
        >
          RESELLER
        </Badge>
      </div>

      <div className="flex items-center gap-1 ml-auto">
        {/* Balance display */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setView("r-ledger")}
              className="hidden sm:flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 h-9 hover:bg-muted/50 transition-colors"
              aria-label="Saldo reseller"
            >
              <Wallet className="h-3.5 w-3.5 text-cyan-400" />
              <div className="flex flex-col leading-none">
                <span className="text-[10px] text-muted-foreground">
                  Saldo
                </span>
                <span className="text-xs font-semibold text-foreground tabular-nums">
                  {dashData?.profile ? formatCurrency(balance) : "-"}
                </span>
              </div>
            </button>
          </TooltipTrigger>
          <TooltipContent>Lihat Ledger Saldo</TooltipContent>
        </Tooltip>

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
                <AvatarFallback className="bg-cyan-500/15 text-cyan-400 text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-xs font-medium text-foreground leading-none">
                  {user?.name}
                </span>
                <span className="text-[10px] text-muted-foreground leading-none mt-0.5">
                  Reseller
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
            <DropdownMenuItem onClick={() => setView("r-profile")}>
              <UserIcon className="h-4 w-4" />
              Profil Reseller
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setView("r-topup")}>
              <PlusCircle className="h-4 w-4" />
              Topup Saldo
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setView("r-commissions")}>
              <Percent className="h-4 w-4" />
              Komisi Saya
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

function CurrentView() {
  const currentView = useAppStore((s) => s.currentView);
  switch (currentView) {
    case "r-dashboard":
      return <ResellerDashboard />;
    case "r-customers":
      return <ResellerCustomers />;
    case "r-create-account":
      return <ResellerCreateAccount />;
    case "r-ledger":
      return <ResellerLedger />;
    case "r-commissions":
      return <ResellerCommissions />;
    case "r-topup":
      return <ResellerTopup />;
    case "r-profile":
      return <ResellerProfile />;
    default:
      return <ResellerDashboard />;
  }
}
