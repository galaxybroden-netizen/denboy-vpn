"use client";

// MVMP — Enterprise Settings Page
// Sidebar internal nav with 10 categories (A-J) per user spec.
// Integrates: UserManagement, RolePermissionMatrix, OtpChangePassword, BrandingSettings,
// ApiKeysManager (existing), Payment Providers (existing), Notifications (existing),
// System Health (new), Audit Log (links to existing view).

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Banknote,
  Bell,
  Building2,
  CreditCard,
  Database,
  FileClock,
  Key,
  KeyRound,
  LayoutGrid,
  Loader2,
  type LucideIcon,
  Mail,
  type LucideProps,
  Palette,
  Pencil,
  Plug,
  Plus,
  Save,
  Settings as SettingsIcon,
  Shield,
  Smartphone,
  Trash2,
  UserCog,
  User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PageHeader } from "../PageHeader";
import { StatusBadge } from "../StatusBadge";
import { EmptyState, apiFetch, statusBadgeClass } from "../lib";
import { ApiKeysManager } from "../ApiKeysManager";
import { UserManagement } from "./settings/UserManagement";
import { RolePermissionMatrix } from "./settings/RolePermissionMatrix";
import { OtpChangePassword } from "./settings/OtpChangePassword";
import { BrandingSettings } from "./settings/BrandingSettings";
import { useAppStore } from "@/lib/store";
import { formatDateTime, timeAgo } from "@/lib/utils-mvmp";
import { cn } from "@/lib/utils";

type SectionKey =
  | "profil"
  | "users"
  | "rbac"
  | "identity"
  | "general"
  | "notifications"
  | "payments"
  | "integration"
  | "security"
  | "system"
  | "audit";

interface NavSection {
  key: SectionKey;
  label: string;
  icon: LucideIcon;
  group: string;
  description: string;
}

const NAV_SECTIONS: NavSection[] = [
  // A. Profil & Akun
  { key: "profil", label: "Profil & Akun", icon: UserIcon, group: "A. Profil & Akun", description: "Profil saya, keamanan akun, ubah password via OTP, sesi login" },
  // B. Manajemen Pengguna
  { key: "users", label: "Daftar Pengguna", icon: UserCog, group: "B. Manajemen Pengguna", description: "CRUD pengguna — hanya SUPER_ADMIN" },
  { key: "rbac", label: "Role & Permission", icon: Shield, group: "B. Manajemen Pengguna", description: "Matriks hak akses berdasarkan role" },
  // C. Identitas Aplikasi
  { key: "identity", label: "Identitas & Branding", icon: Palette, group: "C. Identitas Aplikasi", description: "Nama, logo, warna tema, informasi perusahaan, portal pelanggan" },
  // D. Pengaturan Umum
  { key: "general", label: "Pengaturan Umum", icon: LayoutGrid, group: "D. Pengaturan Umum", description: "Bahasa, zona waktu, format, mata uang, regional" },
  // E. Notifikasi
  { key: "notifications", label: "Notifikasi", icon: Bell, group: "E. Notifikasi", description: "Notifikasi sistem, email, WhatsApp, keamanan" },
  // F. Payment Providers
  { key: "payments", label: "Payment Providers", icon: CreditCard, group: "F. Payment Providers", description: "Gateway, metode, callback, status integrasi" },
  // G. Integrasi
  { key: "integration", label: "Integrasi & API Keys", icon: Plug, group: "G. Integrasi", description: "WhatsApp, SMTP, API Keys, Webhooks" },
  // H. Keamanan
  { key: "security", label: "Keamanan", icon: Shield, group: "H. Keamanan", description: "Kebijakan password, OTP, 2FA, session, IP control" },
  // I. Sistem
  { key: "system", label: "Sistem & Health", icon: Activity, group: "I. Sistem", description: "Status API, DB, Redis, Worker, backup, maintenance" },
  // J. Audit & Log
  { key: "audit", label: "Audit & Log", icon: FileClock, group: "J. Audit & Log", description: "Audit log, login activity, perubahan pengaturan" },
];

const STORAGE_KEY = "MVMP_settings_section";

export function SettingsView() {
  const [activeSection, setActiveSection] = React.useState<SectionKey>("profil");

  // Restore last section from localStorage
  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && NAV_SECTIONS.some((s) => s.key === saved)) {
        setActiveSection(saved as SectionKey);
      }
    } catch {}
  }, []);

  function changeSection(key: SectionKey) {
    setActiveSection(key);
    try { window.localStorage.setItem(STORAGE_KEY, key); } catch {}
  }

  // Group sections by their `group` field for sidebar rendering
  const grouped = React.useMemo(() => {
    const map: Record<string, NavSection[]> = {};
    for (const s of NAV_SECTIONS) {
      if (!map[s.group]) map[s.group] = [];
      map[s.group].push(s);
    }
    return map;
  }, []);

  const activeNav = NAV_SECTIONS.find((s) => s.key === activeSection);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pengaturan Sistem"
        description="Kelola konfigurasi, pengguna, keamanan, dan identitas MVMP"
      />

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        {/* Internal sidebar nav */}
        <aside className="lg:sticky lg:top-20 self-start">
          <Card className="p-2">
            <ScrollArea className="h-[calc(100vh-12rem)]">
              <nav className="space-y-3">
                {Object.entries(grouped).map(([group, sections]) => (
                  <div key={group} className="space-y-0.5">
                    <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                      {group}
                    </p>
                    {sections.map((s) => {
                      const Icon = s.icon;
                      const active = activeSection === s.key;
                      return (
                        <button
                          key={s.key}
                          type="button"
                          onClick={() => changeSection(s.key)}
                          className={cn(
                            "flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm transition-colors text-left",
                            active
                              ? "bg-sidebar-accent text-foreground"
                              : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                          )}
                        >
                          <Icon className={cn("h-4 w-4 shrink-0", active && "text-emerald-400")} />
                          <span className="truncate">{s.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </nav>
            </ScrollArea>
          </Card>
        </aside>

        {/* Active section content */}
        <div className="space-y-4 min-w-0">
          {activeNav ? (
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">{activeNav.label}</h2>
              <p className="text-xs text-muted-foreground">{activeNav.description}</p>
            </div>
          ) : null}

          {activeSection === "profil" ? <ProfileSection /> : null}
          {activeSection === "users" ? <UserManagement /> : null}
          {activeSection === "rbac" ? <RolePermissionMatrix /> : null}
          {activeSection === "identity" ? <BrandingSettings /> : null}
          {activeSection === "general" ? <GeneralSettingsSection /> : null}
          {activeSection === "notifications" ? <NotificationsTab /> : null}
          {activeSection === "payments" ? <ProvidersTab /> : null}
          {activeSection === "integration" ? <IntegrationSection /> : null}
          {activeSection === "security" ? <SecuritySection /> : null}
          {activeSection === "system" ? <SystemHealthSection /> : null}
          {activeSection === "audit" ? <AuditSection /> : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A. Profil & Akun
// ---------------------------------------------------------------------------

function ProfileSection() {
  const user = useAppStore((s) => s.user);
  const { data, isLoading } = useQuery<any>({
    queryKey: ["auth-me"],
    queryFn: () => apiFetch("/api/auth/me"),
  });

  const profile = data?.user || user;

  return (
    <div className="space-y-4">
      <Card className="p-6 space-y-4">
        <h3 className="text-base font-semibold">Informasi Akun</h3>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoCell label="Nama" value={profile?.name || "-"} />
            <InfoCell label="Email" value={profile?.email || "-"} />
            <InfoCell label="Telepon" value={profile?.phone || "-"} />
            <InfoCell label="Role" value={profile?.role || "-"} />
            <InfoCell label="MFA" value={profile?.mfaEnabled ? "Aktif" : "Nonaktif"} />
            <InfoCell label="Login Terakhir" value={profile?.lastLoginAt ? timeAgo(profile.lastLoginAt) : "-"} />
          </div>
        )}
      </Card>

      {/* OTP-based password change */}
      <OtpChangePassword />
    </div>
  );
}

// ---------------------------------------------------------------------------
// D. General Settings (subset of BrandingSettings — show regional + system prefs only)
// ---------------------------------------------------------------------------

function GeneralSettingsSection() {
  // Reuse BrandingSettings but show only relevant cards
  // For simplicity, redirect to BrandingSettings which has everything
  return (
    <Card className="p-6 space-y-3">
      <h3 className="text-base font-semibold">Pengaturan Umum & Regional</h3>
      <p className="text-sm text-muted-foreground">
        Pengaturan regional (bahasa, zona waktu, format, mata uang) dan preferensi sistem
        (default pagination, session timeout) tersedia di section{" "}
        <span className="font-medium text-foreground">Identitas & Branding</span>.
      </p>
      <p className="text-xs text-muted-foreground">
        Klik <span className="font-medium text-foreground">"Identitas & Branding"</span> di sidebar
        untuk mengubah bahasa, zona waktu, mata uang, dan pengaturan regional lainnya.
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// E. Notifications (existing)
// ---------------------------------------------------------------------------

function NotificationsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ items: any[]; unreadCount: number }>({
    queryKey: ["settings-notifications"],
    queryFn: () => apiFetch("/api/notifications"),
  });

  async function markRead(id: string) {
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: "POST" });
      qc.invalidateQueries({ queryKey: ["settings-notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e: any) {
      toast.error(e?.message || "Gagal menandai notifikasi");
    }
  }

  const items = data?.items ?? [];

  return (
    <Card className="p-0 gap-0 overflow-hidden">
      <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Notifikasi Sistem</h3>
        {data?.unreadCount ? (
          <Badge variant="outline" className={statusBadgeClass("amber")}>
            {data.unreadCount} belum dibaca
          </Badge>
        ) : null}
      </div>
      {isLoading ? (
        <div className="space-y-3 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !items.length ? (
        <EmptyState icon={Bell} title="Belum ada notifikasi" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Judul</TableHead>
              <TableHead>Tipe</TableHead>
              <TableHead>Waktu</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.slice(0, 20).map((n) => (
              <TableRow key={n.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{n.title}</span>
                    {n.body ? <span className="text-xs text-muted-foreground line-clamp-1">{n.body}</span> : null}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusBadgeClass(
                    n.type === "ERROR" ? "rose" : n.type === "WARNING" ? "amber" : n.type === "SUCCESS" ? "emerald" : "cyan"
                  )}>
                    {n.type}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</TableCell>
                <TableCell>
                  <StatusBadge status={n.readAt ? "PAID" : "PENDING"} label={n.readAt ? "Dibaca" : "Belum Dibaca"} />
                </TableCell>
                <TableCell className="text-right">
                  {!n.readAt ? (
                    <Button variant="outline" size="sm" onClick={() => markRead(n.id)}>Tandai Dibaca</Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// F. Payment Providers (existing)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// F. Payment Providers — Manual + QRIS + 4 Gateway (Xendit/Midtrans/DOKU/iPaymu)
// ---------------------------------------------------------------------------

interface ProviderConfig {
  enabled: boolean;
  mode: string;
  [key: string]: any;
}

const GATEWAY_PROVIDERS = [
  {
    key: "xendit",
    name: "Xendit",
    color: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
    description: "Payment gateway Indonesia — VA, e-wallet (OVO/DANA/LinkAja), QRIS, CC, PayLater. Payout ke bank.",
    methods: ["EWALLET", "VA", "QRIS", "CARD"],
    credFields: [
      { key: "apiKey", label: "API Key", placeholder: "xnd_production_...", type: "password" },
      { key: "webhookToken", label: "Webhook Verification Token", placeholder: "token dari Xendit dashboard", type: "text" },
      { key: "payoutApiKey", label: "Payout API Key (opsional)", placeholder: "xnd_payout_...", type: "password" },
    ],
    supportsPayout: true,
    docsUrl: "https://developers.xendit.co",
  },
  {
    key: "midtrans",
    name: "Midtrans",
    color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    description: "Payment gateway by Gojek — VA (BCA/BNI/Mandiri/BRI/Permata), Gopay, ShopeePay, QRIS, CC.",
    methods: ["bank_transfer", "gopay", "qris", "credit_card"],
    credFields: [
      { key: "serverKey", label: "Server Key", placeholder: "SB-... (sandbox) / Mid-server-... (prod)", type: "password" },
      { key: "clientKey", label: "Client Key", placeholder: "SB-... (sandbox) / Mid-client-... (prod)", type: "password" },
    ],
    supportsPayout: false,
    docsUrl: "https://docs.midtrans.com",
  },
  {
    key: "doku",
    name: "DOKU",
    color: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
    description: "Payment gateway — VA, QRIS, CC, e-wallet, Direct Debit. Settle ke bank H+1 atau H+2.",
    methods: ["VA", "QRIS", "CREDIT_CARD", "EWALLET"],
    credFields: [
      { key: "clientId", label: "Client ID", placeholder: "DOKU client ID", type: "text" },
      { key: "sharedKey", label: "Shared Key", placeholder: "DOKU shared key", type: "password" },
    ],
    supportsPayout: false,
    docsUrl: "https://www.doku.com/developers",
  },
  {
    key: "ipaymu",
    name: "iPaymu",
    color: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30",
    description: "Payment gateway — VA, QRIS, CC, e-wallet, convenience store (Alfamart/Indomaret). Payout via transfer.",
    methods: ["VA", "QRIS", "CREDIT_CARD", "EWALLET", "CVS"],
    credFields: [
      { key: "apiKey", label: "API Key", placeholder: "iPaymu API key", type: "password" },
      { key: "vaNumber", label: "VA Number", placeholder: "iPaymu VA number", type: "text" },
    ],
    supportsPayout: true,
    docsUrl: "https://docs.ipaymu.com",
  },
];

function ProvidersTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<any>({
    queryKey: ["settings-providers"],
    queryFn: () => apiFetch("/api/settings/providers"),
  });

  const [config, setConfig] = React.useState<any>({});
  const [saving, setSaving] = React.useState(false);
  const [testingProvider, setTestingProvider] = React.useState<string | null>(null);
  const [showPayout, setShowPayout] = React.useState<string | null>(null);
  const [editingBank, setEditingBank] = React.useState<any | null>(null);

  React.useEffect(() => {
    if (data) setConfig(data);
  }, [data]);

  function updateProvider(provider: string, field: string, value: any) {
    setConfig((prev: any) => ({
      ...prev,
      [provider]: { ...prev[provider], [field]: value },
    }));
  }

  async function save() {
    setSaving(true);
    try {
      await apiFetch("/api/settings/providers", {
        method: "PATCH",
        body: JSON.stringify(config),
      });
      toast.success("Konfigurasi payment provider disimpan");
      qc.invalidateQueries({ queryKey: ["settings-providers"] });
    } catch (e: any) {
      toast.error(e?.message || "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  async function testConnection(provider: string) {
    setTestingProvider(provider);
    try {
      await apiFetch(`/api/settings/providers/test?provider=${provider}`, { method: "POST" });
      toast.success(`Koneksi ${provider.toUpperCase()} berhasil — credentials valid`);
    } catch (e: any) {
      toast.error(e?.message || `Gagal test koneksi ${provider}`);
    } finally {
      setTestingProvider(null);
    }
  }

  if (isLoading) {
    return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}</div>;
  }

  return (
    <div className="space-y-4">
      {/* Manual Bank Transfer — CRUD banks with icons */}
      <Card className="p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Transfer Manual (Bank)</h3>
            <p className="text-xs text-muted-foreground">Pelanggan transfer ke rekening bank lalu upload bukti pembayaran.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditingBank({})}>
              <Plus className="h-3 w-3" />
              Tambah Bank
            </Button>
            <Switch checked={config.manual?.enabled ?? true} onCheckedChange={(v) => updateProvider("manual", "enabled", v)} />
          </div>
        </div>
        {config.manual?.banks?.length ? (
          <div className="space-y-2">
            {config.manual.banks.map((b: any, idx: number) => (
              <div key={b.code || idx} className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
                {/* Bank icon — colored badge with initials */}
                <BankIcon code={b.code} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{b.name}</span>
                    <Badge variant="outline" className="text-[9px] font-mono">{b.code}</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{b.accountHolder}</span>
                    <span>·</span>
                    <span className="font-mono">{b.accountNumber}</span>
                  </div>
                </div>
                {/* Edit + Delete buttons */}
                <Button variant="ghost" size="icon" className="size-7" onClick={() => setEditingBank(b)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-rose-500 hover:text-rose-400 hover:bg-rose-500/10"
                  onClick={() => {
                    const banks = (config.manual?.banks || []).filter((_: any, i: number) => i !== idx);
                    updateProvider("manual", "banks", banks);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">Belum ada bank terdaftar. Klik "Tambah Bank" untuk menambah.</p>
        )}
      </Card>

      {/* QRIS Static */}
      <Card className="p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">QRIS (Statis)</h3>
            <p className="text-xs text-muted-foreground">QR code statis untuk pembayaran instan via e-wallet mana pun.</p>
          </div>
          <Switch checked={config.qris?.enabled ?? true} onCheckedChange={(v) => updateProvider("qris", "enabled", v)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Merchant ID</Label>
          <Input value={config.qris?.merchantId || ""} onChange={(e) => updateProvider("qris", "merchantId", e.target.value)} placeholder="MVMP-STORE" />
        </div>
      </Card>

      {/* Divider */}
      <div className="flex items-center gap-3 py-2">
        <div className="h-px bg-border flex-1" />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Payment Gateway Otomatis</span>
        <div className="h-px bg-border flex-1" />
      </div>

      {/* Gateway Providers */}
      {GATEWAY_PROVIDERS.map((gp) => {
        const pc = config[gp.key] || {};
        const webhookUrl = typeof window !== "undefined" ? `${window.location.origin}/api/payments/webhook/${gp.key}` : `/api/payments/webhook/${gp.key}`;
        return (
          <Card key={gp.key} className="p-6 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{gp.name}</h3>
                  <Badge variant="outline" className={gp.color}>{pc.mode || "sandbox"}</Badge>
                  {pc.enabled ? (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Aktif</Badge>
                  ) : null}
                  {gp.supportsPayout ? (
                    <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30">Payout</Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">{gp.description}</p>
                <a href={gp.docsUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-emerald-500 hover:underline">
                  Dokumentasi {gp.name} →
                </a>
              </div>
              <Switch checked={pc.enabled ?? false} onCheckedChange={(v) => updateProvider(gp.key, "enabled", v)} />
            </div>

            {/* Mode toggle */}
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Mode:</Label>
              <Select value={pc.mode || "sandbox"} onValueChange={(v) => updateProvider(gp.key, "mode", v)}>
                <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">Sandbox (Test)</SelectItem>
                  <SelectItem value="production">Production (Live)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Credential fields */}
            <div className="grid gap-3 sm:grid-cols-2">
              {gp.credFields.map((cf) => (
                <div key={cf.key} className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{cf.label}</Label>
                  <Input
                    type={cf.type}
                    value={pc[cf.key] || ""}
                    onChange={(e) => updateProvider(gp.key, cf.key, e.target.value)}
                    placeholder={cf.placeholder}
                    className="font-mono text-xs"
                  />
                </div>
              ))}
            </div>

            {/* Payment methods */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Metode Pembayaran Didukung</Label>
              <div className="flex flex-wrap gap-1.5">
                {gp.methods.map((m) => (
                  <Badge key={m} variant="outline" className="text-[10px]">{m}</Badge>
                ))}
              </div>
            </div>

            {/* Webhook URL */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Webhook / Callback URL</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md bg-muted/40 px-3 py-1.5 text-[10px] font-mono text-muted-foreground truncate">
                  {webhookUrl}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs shrink-0"
                  onClick={() => {
                    navigator.clipboard.writeText(webhookUrl);
                    toast.success("Webhook URL disalin");
                  }}
                >
                  Salin
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Set URL ini di dashboard {gp.name} sebagai callback/notifikasi URL untuk auto-update status pembayaran.
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => testConnection(gp.key)}
                disabled={testingProvider === gp.key || !pc.enabled}
              >
                {testingProvider === gp.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plug className="h-3 w-3" />}
                Test Koneksi
              </Button>
              {gp.supportsPayout ? (
                <Button variant="outline" size="sm" onClick={() => setShowPayout(gp.key)}>
                  <Banknote className="h-3 w-3" />
                  Payout / Disburse
                </Button>
              ) : null}
            </div>

            {/* Payout dialog */}
            {showPayout === gp.key ? (
              <PayoutDialog provider={gp.key} providerName={gp.name} onClose={() => setShowPayout(null)} />
            ) : null}
          </Card>
        );
      })}

      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Simpan Konfigurasi
        </Button>
      </div>

      {/* Bank add/edit dialog */}
      {editingBank !== null ? (
        <BankEditDialog
          bank={editingBank}
          onClose={() => setEditingBank(null)}
          onSave={(bank) => {
            const banks = [...(config.manual?.banks || [])];
            const idx = banks.findIndex((b: any) => b.code === bank.code);
            if (idx >= 0) {
              banks[idx] = bank; // edit existing
            } else {
              banks.push(bank); // add new
            }
            updateProvider("manual", "banks", banks);
          }}
        />
      ) : null}
    </div>
  );
}

// Bank icons — colored badge with bank initials (brand colors per Indonesian bank)
const BANK_ICONS: Record<string, { bg: string; text: string; label: string }> = {
  BCA: { bg: "bg-[#005FAB]", text: "text-white", label: "BCA" },
  MANDIRI: { bg: "bg-[#1E88E5]", text: "text-white", label: "MDR" },
  BNI: { bg: "bg-[#F37021]", text: "text-white", label: "BNI" },
  BRI: { bg: "bg-[#005BAA]", text: "text-white", label: "BRI" },
  PERMATA: { bg: "bg-[#008A3C]", text: "text-white", label: "PRM" },
  CIMB: { bg: "bg-[#7B2D8B]", text: "text-white", label: "CMB" },
  BSI: { bg: "bg-[#00A39D]", text: "text-white", label: "BSI" },
  BUKOPIN: { bg: "bg-[#003D7C]", text: "text-white", label: "BKP" },
  DANAMON: { bg: "bg-[#E87400]", text: "text-white", label: "DNM" },
  MAYAPADA: { bg: "bg-[#D32F2F]", text: "text-white", label: "MYP" },
  PANIN: { bg: "bg-[#00529B]", text: "text-white", label: "PNN" },
  MEGA: { bg: "bg-[#FF6B00]", text: "text-white", label: "MEG" },
  SINARMAS: { bg: "bg-[#E30613]", text: "text-white", label: "SNS" },
};

function BankIcon({ code }: { code: string }) {
  const icon = BANK_ICONS[code] || { bg: "bg-muted", text: "text-muted-foreground", label: code?.slice(0, 3) || "??" };
  return (
    <div className={`shrink-0 size-9 rounded-lg ${icon.bg} ${icon.text} flex items-center justify-center text-[10px] font-bold tracking-tight`}>
      {icon.label}
    </div>
  );
}

// Bank add/edit dialog — CRUD for manual bank transfer accounts
function BankEditDialog({
  bank,
  onClose,
  onSave,
}: {
  bank: any;
  onClose: () => void;
  onSave: (bank: any) => void;
}) {
  const isEdit = !!bank.code;
  const [code, setCode] = React.useState(bank.code || "");
  const [name, setName] = React.useState(bank.name || "");
  const [accountNumber, setAccountNumber] = React.useState(bank.accountNumber || "");
  const [accountHolder, setAccountHolder] = React.useState(bank.accountHolder || "MVMP STORE");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code || !name || !accountNumber) return;
    onSave({ code: code.toUpperCase(), name, accountNumber, accountHolder });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Bank" : "Tambah Bank"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Ubah data rekening bank." : "Tambah rekening bank untuk transfer manual."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {/* Bank code selector with icon preview */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Kode Bank</Label>
            <div className="flex items-center gap-2">
              {code ? <BankIcon code={code.toUpperCase()} /> : null}
              <Select value={code.toUpperCase()} onValueChange={(v) => {
                setCode(v);
                // Auto-fill name if empty or matching known bank
                const knownNames: Record<string, string> = {
                  BCA: "Bank Central Asia", MANDIRI: "Bank Mandiri", BNI: "Bank Negara Indonesia",
                  BRI: "Bank Rakyat Indonesia", PERMATA: "Bank Permata", CIMB: "CIMB Niaga",
                  BSI: "Bank Syariah Indonesia", BUKOPIN: "Bank Bukopin", DANAMON: "Bank Danamon",
                  MAYAPADA: "Bank Mayapada", PANIN: "Bank Panin", MEGA: "Bank Mega",
                  SINARMAS: "Bank Sinarmas",
                };
                if (knownNames[v] && (!name || Object.values(knownNames).includes(name))) {
                  setName(knownNames[v]);
                }
              }}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Pilih bank" /></SelectTrigger>
                <SelectContent>
                  {Object.keys(BANK_ICONS).map((b) => (
                    <SelectItem key={b} value={b}>{b} — {BANK_ICONS[b].label}</SelectItem>
                  ))}
                  <SelectItem value="CUSTOM">Lainnya (custom)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Nama Bank</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bank Central Asia" required />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Nomor Rekening</Label>
            <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))} placeholder="1234567890" required className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Atas Nama</Label>
            <Input value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} placeholder="MVMP STORE" required />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
            <Button type="submit">{isEdit ? "Simpan Perubahan" : "Tambah Bank"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Payout dialog — request disbursement via provider
function PayoutDialog({ provider, providerName, onClose }: { provider: string; providerName: string; onClose: () => void }) {
  const [amount, setAmount] = React.useState("");
  const [bank, setBank] = React.useState("BCA");
  const [account, setAccount] = React.useState("");
  const [name, setName] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<any>(null);

  async function submit() {
    setLoading(true);
    try {
      const res = await apiFetch("/api/payments/payout", {
        method: "POST",
        body: JSON.stringify({
          provider,
          amount: Number(amount),
          currency: "IDR",
          destinationBank: bank,
          destinationAccount: account,
          destinationName: name,
          notes,
        }),
      });
      setResult(res);
      toast.success(`Payout ${res.amount} IDR via ${providerName} berhasil`);
    } catch (e: any) {
      toast.error(e?.message || "Gagal payout");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card rounded-lg border border-border shadow-xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-1">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Banknote className="h-4 w-4 text-emerald-400" />
            Payout via {providerName}
          </h3>
          <p className="text-xs text-muted-foreground">Kirim uang dari merchant account ke rekening bank tujuan.</p>
        </div>

        {result ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-1">
              <p className="text-xs font-medium text-emerald-400">✓ Payout Berhasil Diproses</p>
              <p className="text-xs text-muted-foreground">Ref: <span className="font-mono">{result.payoutReference}</span></p>
              <p className="text-xs text-muted-foreground">{result.message}</p>
            </div>
            <Button variant="outline" className="w-full" onClick={onClose}>Tutup</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Jumlah (IDR)</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50000" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Bank Tujuan</Label>
                <Select value={bank} onValueChange={setBank}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["BCA", "Mandiri", "BNI", "BRI", "Permata", "CIMB", "BSI"].map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">No. Rekening</Label>
                <Input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="1234567890" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nama Penerima</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Budi Santoso" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Catatan (opsional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Komisi reseller" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onClose}>Batal</Button>
              <Button className="flex-1 bg-emerald-500 hover:bg-emerald-600" onClick={submit} disabled={loading || !amount || !account || !name}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                Kirim Payout
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// G. Integrasi & API Keys
// ---------------------------------------------------------------------------

function IntegrationSection() {
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Plug className="h-4 w-4 text-emerald-400" />
            Integrasi Aktif
          </h3>
          <p className="text-xs text-muted-foreground">Status koneksi integrasi eksternal</p>
        </div>
      </Card>

      {/* API Keys manager (existing component) */}
      <ApiKeysManager />
    </div>
  );
}

// ---------------------------------------------------------------------------
// H. Keamanan
// ---------------------------------------------------------------------------

function SecuritySection() {
  const setView = useAppStore((s) => s.setView);

  return (
    <div className="space-y-4">
      <Card className="p-6 space-y-3">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-emerald-400" />
          Ubah Password (via OTP)
        </h3>
        <p className="text-xs text-muted-foreground">
          Superadmin dapat mengubah password sendiri tanpa password lama, wajib verifikasi OTP.
        </p>
      </Card>

      <OtpChangePassword />

      <Card className="p-6 space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Two-Factor Authentication (TOTP)</h3>
            <p className="text-xs text-muted-foreground">Lindungi akun dengan authenticator app (Google Authenticator, Authy).</p>
          </div>
          <Switch onCheckedChange={() => toast.info("Fitur 2FA TOTP — segera hadir")} />
        </div>
      </Card>

      <Card className="p-6 space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Sesi Aktif & Perangkat</h3>
            <p className="text-xs text-muted-foreground">Kelola perangkat yang sedang login ke akun Anda.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => toast.info("Daftar sesi — segera hadir")}>
            Lihat Sesi
          </Button>
        </div>
      </Card>

      <Card className="p-6 space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Audit Log Keamanan</h3>
            <p className="text-xs text-muted-foreground">Tinjau jejak aktivitas sensitif (login, perubahan password, perubahan role).</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setView("audit-logs")}>
            <FileClock className="h-4 w-4" />
            Lihat Audit Log
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// I. Sistem & Health
// ---------------------------------------------------------------------------

function SystemHealthSection() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["system-health"],
    queryFn: () => apiFetch("/api/dashboard"),
    refetchInterval: 30000,
  });

  const services = [
    { name: "API Server (Next.js)", status: "online", icon: Activity },
    { name: "Database (SQLite)", status: "online", icon: Database },
    { name: "WhatsApp Integration", status: "disconnected", icon: Smartphone },
    { name: "SMTP Email", status: "mock", icon: Mail },
    { name: "Payment Gateway (QRIS)", status: "mock", icon: CreditCard },
    { name: "Go Agent Simulator", status: "online", icon: Activity },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((s) => {
          const Icon = s.icon;
          const color = s.status === "online" ? "emerald" : s.status === "mock" ? "amber" : s.status === "disconnected" ? "rose" : "zinc";
          return (
            <Card key={s.name} className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <Icon className="h-5 w-5 text-muted-foreground" />
                <Badge variant="outline" className={statusBadgeClass(color)}>
                  {s.status.toUpperCase()}
                </Badge>
              </div>
              <p className="text-sm font-medium">{s.name}</p>
              <p className="text-[10px] text-muted-foreground">
                {s.status === "online" ? "Berjalan normal" : s.status === "mock" ? "Mock mode (sandbox)" : s.status === "disconnected" ? "Belum terhubung" : "Tidak diketahui"}
              </p>
            </Card>
          );
        })}
      </div>

      <Card className="p-6 space-y-3">
        <h3 className="text-base font-semibold">Informasi Versi</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <InfoCell label="Versi MVMP" value="2.0.0-enterprise" />
          <InfoCell label="Next.js" value="16.1.3" />
          <InfoCell label="Database" value="SQLite (sandbox)" />
          <InfoCell label="Build" value="Development" />
        </div>
      </Card>

      <Card className="p-6 space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Maintenance Mode</h3>
            <p className="text-xs text-muted-foreground">Saat aktif, hanya SUPER_ADMIN yang dapat mengakses aplikasi. Pengguna lain melihat halaman maintenance.</p>
          </div>
          <Switch onCheckedChange={(v) => toast.info(`Maintenance mode ${v ? "AKTIF" : "nonaktif"} — fitur ini akan mengubah SystemSetting saat produksi`)} />
        </div>
      </Card>

      <Card className="p-6 space-y-3">
        <h3 className="text-sm font-semibold">Backup & Recovery</h3>
        <p className="text-xs text-muted-foreground">Backup database SQLite ke file downloadable.</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => toast.info("Backup — mengunduh file .db saat produksi")}>
            <Database className="h-3 w-3" />
            Backup Sekarang
          </Button>
          <Button variant="outline" size="sm" onClick={() => toast.info("Restore — upload file backup saat produksi")}>
            Restore
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// J. Audit & Log
// ---------------------------------------------------------------------------

function AuditSection() {
  const setView = useAppStore((s) => s.setView);
  const { data, isLoading } = useQuery<{ items: any[]; pagination: any }>({
    queryKey: ["settings-audit"],
    queryFn: () => apiFetch("/api/audit-logs?limit=20"),
  });

  const items = data?.items ?? [];

  return (
    <Card className="p-0 gap-0 overflow-hidden">
      <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Audit Log Terbaru</h3>
        <Button variant="outline" size="sm" onClick={() => setView("audit-logs")}>
          <FileClock className="h-4 w-4" />
          Lihat Semua
        </Button>
      </div>
      {isLoading ? (
        <div className="space-y-3 p-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : !items.length ? (
        <EmptyState icon={FileClock} title="Belum ada audit log" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Waktu</TableHead>
              <TableHead>Aksi</TableHead>
              <TableHead>Pelaku</TableHead>
              <TableHead>Resource</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.slice(0, 10).map((log) => (
              <TableRow key={log.id}>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(log.createdAt)}</TableCell>
                <TableCell><span className="font-mono text-xs">{log.action}</span></TableCell>
                <TableCell className="text-xs">{log.user?.name || log.actorType}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{log.resourceType || "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
