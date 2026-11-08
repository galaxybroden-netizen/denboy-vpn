"use client";

// MVMP — WhatsApp Integration page
// Configure 3 providers (Meta Cloud API, Baileys Web, Generic API),
// pair via QR code (Baileys), connect via credentials (Meta/API), disconnect.

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Cloud,
  Link2,
  Loader2,
  Plug,
  QrCode,
  RefreshCw,
  Save,
  Smartphone,
  Unplug,
  XCircle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "../../PageHeader";
import { StatCard } from "../../StatCard";
import { EmptyState, apiFetch } from "../../lib";
import { formatDateTime } from "@/lib/utils-mvmp";
import { cn } from "@/lib/utils";

interface Integration {
  id: string;
  provider: string;
  status: string;
  phoneNumber: string | null;
  displayName: string | null;
  credentialsJson: string | null;
  qrCodeData: string | null;
  lastConnectedAt: string | null;
  lastError: string | null;
  autoReplyRulesJson: string | null;
  defaultTemplateId: string | null;
}

const PROVIDERS = [
  {
    value: "baileys",
    label: "Baileys (WhatsApp Web)",
    icon: Smartphone,
    description: "Gratis, scan QR seperti WhatsApp Web. Tidak perlu approval Meta. Cocok untuk skala kecil-menengah.",
    badge: "Gratis",
    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  {
    value: "meta_cloud",
    label: "Meta Cloud API (Official)",
    icon: Cloud,
    description: "Resmi dari Meta. Butuh WhatsApp Business Account + verifikasi bisnis. Bayar per pesan (~Rp 800/pesan Indonesia).",
    badge: "Official",
    badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
  {
    value: "api",
    label: "Generic API Provider",
    icon: Link2,
    description: "Provider pihak ketiga (Fonnte, Wapanels, RuangWA). Bayar per pesan, integrasi HTTP sederhana.",
    badge: "Third-party",
    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
] as const;

export function WhatsappIntegration() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<Integration>({
    queryKey: ["wa-integration"],
    queryFn: () => apiFetch("/api/whatsapp/integration"),
  });

  const [provider, setProvider] = React.useState<string>("baileys");
  const [creds, setCreds] = React.useState<any>({});
  const [autoReplyRules, setAutoReplyRules] = React.useState<any[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [connecting, setConnecting] = React.useState(false);
  const [confirmingPair, setConfirmingPair] = React.useState(false);

  React.useEffect(() => {
    if (data) {
      setProvider(data.provider);
      try { setCreds(JSON.parse(data.credentialsJson || "{}")); } catch { setCreds({}); }
      try { setAutoReplyRules(JSON.parse(data.autoReplyRulesJson || "[]")); } catch { setAutoReplyRules([]); }
    }
  }, [data]);

  const selectedProvider = PROVIDERS.find((p) => p.value === provider) || PROVIDERS[0];
  const isConnected = data?.status === "connected";
  const isConnecting = data?.status === "connecting";

  function updateCred(key: string, value: string) {
    setCreds((prev: any) => ({ ...prev, [key]: value }));
  }

  async function saveConfig() {
    setSaving(true);
    try {
      await apiFetch("/api/whatsapp/integration", {
        method: "PATCH",
        body: JSON.stringify({
          provider,
          credentialsJson: JSON.stringify(creds),
          autoReplyRulesJson: JSON.stringify(autoReplyRules),
        }),
      });
      toast.success("Konfigurasi disimpan");
      qc.invalidateQueries({ queryKey: ["wa-integration"] });
    } catch (e: any) {
      toast.error(e?.message || "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  async function connect() {
    setConnecting(true);
    try {
      // Save config first, then connect
      await apiFetch("/api/whatsapp/integration", {
        method: "PATCH",
        body: JSON.stringify({
          provider,
          credentialsJson: JSON.stringify(creds),
        }),
      });
      await apiFetch("/api/whatsapp/integration/connect", { method: "POST" });
      if (provider === "baileys") {
        // For Baileys: do NOT mark as connected here. The QR stays displayed
        // until the owner scans it with their phone and clicks "Saya sudah scan QR".
        toast.success("QR code di-generate. Scan dengan WhatsApp di HP Anda, lalu klik 'Saya sudah scan QR'.");
      } else {
        // Meta Cloud / API: connect endpoint marks as connected immediately (credentials-based)
        toast.success("Terkoneksi");
      }
      qc.invalidateQueries({ queryKey: ["wa-integration"] });
    } catch (e: any) {
      toast.error(e?.message || "Gagal terhubung");
    } finally {
      setConnecting(false);
    }
  }

  async function confirmPair() {
    setConfirmingPair(true);
    try {
      await apiFetch("/api/whatsapp/integration/confirm-pair", { method: "POST" });
      toast.success("WhatsApp terhubung — siap mengirim & menerima pesan");
      qc.invalidateQueries({ queryKey: ["wa-integration"] });
    } catch (e: any) {
      toast.error(e?.message || "Gagal konfirmasi pairing");
    } finally {
      setConfirmingPair(false);
    }
  }

  async function disconnect() {
    try {
      await apiFetch("/api/whatsapp/integration/connect", { method: "DELETE" });
      toast.success("Terputus dari WhatsApp");
      qc.invalidateQueries({ queryKey: ["wa-integration"] });
    } catch (e: any) {
      toast.error(e?.message || "Gagal memutus");
    }
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Integrasi WhatsApp" description="Sambungkan akun WhatsApp bisnis Anda" />
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 w-full rounded-lg" />)}
        </div>
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrasi WhatsApp"
        description="Sambungkan akun WhatsApp bisnis Anda via 3 penyedia"
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn(
              "font-mono",
              isConnected && "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
              isConnecting && "bg-amber-500/10 text-amber-400 border-amber-500/30",
              !isConnected && !isConnecting && "bg-muted text-muted-foreground",
            )}>
              {isConnected ? <CheckCircle2 className="h-3 w-3 mr-1" /> : isConnecting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <XCircle className="h-3 w-3 mr-1" />}
              {data.status.toUpperCase()}
            </Badge>
          </div>
        }
      />

      {/* Stats summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          title="Status Koneksi"
          value={isConnected ? "Terkoneksi" : isConnecting ? "Menghubungkan..." : "Terputus"}
          icon={Plug}
          accent={isConnected ? "emerald" : "amber"}
          sublabel={data.displayName || "Belum tersambung"}
        />
        <StatCard
          title="Nomor Terhubung"
          value={data.phoneNumber || "-"}
          icon={Smartphone}
          accent="cyan"
          sublabel={data.lastConnectedAt ? `Sejak ${formatDateTime(data.lastConnectedAt)}` : "Belum pernah"}
        />
        <StatCard
          title="Penyedia"
          value={PROVIDERS.find((p) => p.value === data.provider)?.label.split(" ")[0] || data.provider}
          icon={selectedProvider.icon}
          accent="cyan"
          sublabel={PROVIDERS.find((p) => p.value === data.provider)?.badge}
        />
      </div>

      {/* QR Code (Baileys, when pairing in progress) — STAYS DISPLAYED until owner scans */}
      {data.provider === "baileys" && isConnecting && data.qrCodeData ? (
        <Card className="p-6 space-y-4 border-emerald-500/30">
          <div className="text-center space-y-2">
            <h3 className="text-base font-semibold flex items-center justify-center gap-2">
              <QrCode className="h-5 w-5 text-emerald-400" />
              Scan QR Code
            </h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Buka <span className="font-medium text-foreground">WhatsApp di HP Anda</span> →
              Settings → Linked Devices → Link a Device → scan QR di bawah ini.
              <br />
              QR akan tetap ditampilkan sampai Anda selesai scan.
            </p>
          </div>
          <div className="flex justify-center">
            <div className="rounded-lg border-2 border-border bg-white p-3">
              <img src={data.qrCodeData} alt="WhatsApp QR" width={240} height={240} />
            </div>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Menunggu scan dari HP Anda...
            </div>
            <Button
              onClick={confirmPair}
              disabled={confirmingPair}
              className="bg-emerald-500 hover:bg-emerald-600"
            >
              {confirmingPair ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Menghubungkan...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Saya sudah scan QR
                </>
              )}
            </Button>
            <p className="text-[10px] text-muted-foreground text-center max-w-sm">
              Tombol di atas mensimulasikan konfirmasi scan QR (sandbox). Di produksi,
              Baileys akan otomatis mendeteksi scan via WebSocket event — tombol ini
              tidak diperlukan.
            </p>
          </div>
        </Card>
      ) : null}

      {/* Provider selection */}
      <Card className="p-6 space-y-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">Pilih Penyedia</h3>
          <p className="text-xs text-muted-foreground">Pilih metode koneksi WhatsApp yang sesuai kebutuhan Anda</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {PROVIDERS.map((p) => {
            const Icon = p.icon;
            const isSelected = provider === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => setProvider(p.value)}
                className={cn(
                  "text-left rounded-lg border p-4 space-y-2 transition-colors",
                  isSelected ? "border-emerald-500/40 bg-emerald-500/5 ring-1 ring-emerald-500/20"
                    : "border-border bg-muted/20 hover:bg-muted/40"
                )}
              >
                <div className="flex items-center justify-between">
                  <Icon className="h-5 w-5 text-emerald-400" />
                  <Badge variant="outline" className={p.badgeClass}>{p.badge}</Badge>
                </div>
                <p className="text-sm font-medium text-foreground">{p.label}</p>
                <p className="text-[10px] text-muted-foreground line-clamp-3">{p.description}</p>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Credentials per provider */}
      <Card className="p-6 space-y-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">Kredensial {selectedProvider.label}</h3>
          <p className="text-xs text-muted-foreground">
            {provider === "baileys" && "Tidak perlu kredensial — pakai QR code scan."}
            {provider === "meta_cloud" && "Dapatkan kredensial di Meta for Developers → WhatsApp Business API."}
            {provider === "api" && "Dapatkan API URL + API Key dari dashboard provider Anda."}
          </p>
        </div>

        {provider === "baileys" ? (
          <div className="rounded-lg bg-muted/30 p-4 text-sm text-muted-foreground space-y-1">
            <p>✓ Tidak butuh kredensial</p>
            <p>✓ Klik "Sambungkan" di bawah untuk generate QR code</p>
            <p>✓ Scan QR dari aplikasi WhatsApp di HP Anda</p>
            <p>⚠ Session bisa terputus jika WA di logout atau tidak aktif 7 hari</p>
          </div>
        ) : null}

        {provider === "meta_cloud" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="WhatsApp Business Account ID (WABA ID)">
              <Input value={creds.wabaId || ""} onChange={(e) => updateCred("wabaId", e.target.value)} placeholder="123456789012345" />
            </Field>
            <Field label="Phone Number ID">
              <Input value={creds.phoneNumberId || ""} onChange={(e) => updateCred("phoneNumberId", e.target.value)} placeholder="628123456789" />
            </Field>
            <Field label="App ID (optional)">
              <Input value={creds.appId || ""} onChange={(e) => updateCred("appId", e.target.value)} placeholder="987654321" />
            </Field>
            <Field label="App Secret (optional)">
              <Input type="password" value={creds.appSecret || ""} onChange={(e) => updateCred("appSecret", e.target.value)} placeholder="••••••••" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Permanent Access Token">
                <Input type="password" value={creds.accessToken || ""} onChange={(e) => updateCred("accessToken", e.target.value)} placeholder="EAAG..." />
              </Field>
            </div>
          </div>
        ) : null}

        {provider === "api" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="API URL">
                <Input value={creds.apiUrl || ""} onChange={(e) => updateCred("apiUrl", e.target.value)} placeholder="https://api.fonnte.com/send" />
              </Field>
            </div>
            <Field label="API Key / Token">
              <Input type="password" value={creds.apiKey || ""} onChange={(e) => updateCred("apiKey", e.target.value)} placeholder="••••••••" />
            </Field>
            <Field label="Sender Number (opsional)">
              <Input value={creds.senderNumber || ""} onChange={(e) => updateCred("senderNumber", e.target.value)} placeholder="62811000002" />
            </Field>
          </div>
        ) : null}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={saveConfig} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan Konfigurasi
          </Button>
          {!isConnected ? (
            <Button onClick={connect} disabled={connecting || isConnecting}>
              {connecting || isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
              {provider === "baileys" ? "Generate QR & Sambungkan" : "Sambungkan"}
            </Button>
          ) : (
            <Button variant="destructive" onClick={disconnect}>
              <Unplug className="h-4 w-4" />
              Putuskan
            </Button>
          )}
        </div>
      </Card>

      {/* Auto-reply rules */}
      <Card className="p-6 space-y-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-400" />
            Auto-Reply Rules
          </h3>
          <p className="text-xs text-muted-foreground">Balasan otomatis berdasarkan kata kunci pada pesan masuk</p>
        </div>
        <div className="space-y-2">
          {autoReplyRules.length === 0 ? (
            <EmptyState
              icon={Zap}
              title="Belum ada auto-reply rule"
              description="Tambah rule pertama untuk membalas pesan masuk otomatis."
            />
          ) : (
            autoReplyRules.map((rule: any, idx: number) => (
              <div key={rule.id || idx} className="rounded-md border border-border bg-muted/20 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                    {rule.keyword}
                  </span>
                  <Badge variant="outline" className={rule.isActive ? "text-emerald-400" : "text-muted-foreground"}>
                    {rule.isActive ? "Aktif" : "Nonaktif"}
                  </Badge>
                </div>
                <p className="text-sm text-foreground">{rule.response}</p>
              </div>
            ))
          )}
        </div>
      </Card>

      {data.lastError ? (
        <Card className="p-4 border-rose-500/30 bg-rose-500/5">
          <div className="flex items-start gap-2 text-sm">
            <XCircle className="h-4 w-4 text-rose-400 mt-0.5" />
            <div>
              <p className="font-medium text-rose-400">Error Terakhir</p>
              <p className="text-xs text-muted-foreground">{data.lastError}</p>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
