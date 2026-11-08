"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Download,
  Eye,
  Loader2,
  Shield,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "../../PageHeader";
import { StatusBadge } from "../../StatusBadge";
import { EmptyState, apiFetch, engineColor, statusBadgeClass } from "../../lib";
import {
  formatBytes,
  formatDate,
  timeAgo,
  getCountryFlag,
} from "@/lib/utils-mvmp";
import { cn } from "@/lib/utils";

interface AccountItem {
  id: string;
  username: string;
  status: string;
  quotaBytes?: number | null;
  uploadBytes: number;
  downloadBytes: number;
  expiresAt: string;
  maxDevices: number;
  createdAt: string;
  quotaUsed: number;
  quotaLimit: number;
  quotaUsagePercent: number;
  server: {
    id: string;
    name: string;
    publicIp?: string;
    region?: string;
    countryCode?: string;
  };
  protocol: {
    id: string;
    key: string;
    displayName: string;
    engine: string;
  };
}

type FilterTab = "ACTIVE" | "EXPIRED" | "SUSPENDED" | "ALL";

export function CustomerAccounts() {
  const [tab, setTab] = React.useState<FilterTab>("ACTIVE");
  const [configAccountId, setConfigAccountId] = React.useState<string | null>(null);

  const params = new URLSearchParams({ status: tab });
  const { data, isLoading } = useQuery<{ items: AccountItem[]; count: number }>({
    queryKey: ["customer-accounts", tab],
    queryFn: () => apiFetch(`/api/portal/customer/my-accounts?${params.toString()}`),
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Akun VPN Saya"
        description="Kelola akun VPN aktif Anda"
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="ACTIVE">Aktif</TabsTrigger>
          <TabsTrigger value="EXPIRED">Kedaluwarsa</TabsTrigger>
          <TabsTrigger value="SUSPENDED">Suspended</TabsTrigger>
          <TabsTrigger value="ALL">Semua</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="p-0 gap-0">
          <EmptyState
            icon={Shield}
            title="Belum ada akun VPN"
            description="Akun VPN Anda akan muncul di sini setelah membeli paket."
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((acc) => (
            <AccountCard
              key={acc.id}
              account={acc}
              onViewConfig={() => setConfigAccountId(acc.id)}
            />
          ))}
        </div>
      )}

      <ConfigDialog
        accountId={configAccountId}
        onClose={() => setConfigAccountId(null)}
      />
    </div>
  );
}

function AccountCard({
  account,
  onViewConfig,
}: {
  account: AccountItem;
  onViewConfig: () => void;
}) {
  const used = account.quotaUsed;
  const limit = account.quotaLimit;
  const percent = account.quotaUsagePercent;
  const quotaColor = percent >= 90 ? "rose" : percent >= 70 ? "amber" : "emerald";

  async function downloadConf() {
    try {
      const res = await apiFetch<{ configText: string; username: string }>(
        `/api/portal/customer/my-accounts/${account.id}/config`
      );
      if (!res.configText) {
        toast.error("Config tidak tersedia");
        return;
      }
      const blob = new Blob([res.configText], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${res.username}.conf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 100);
      toast.success(`File ${res.username}.conf diunduh`);
    } catch (e: any) {
      toast.error(e?.message || "Gagal mengunduh config");
    }
  }

  return (
    <Card className="p-5 gap-3 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg shrink-0">
            {getCountryFlag(account.server.countryCode || "")}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-mono font-semibold text-foreground truncate">
              {account.username}
            </p>
            <p className="text-[10px] text-muted-foreground truncate">
              {account.server.name}
              {account.server.region ? ` · ${account.server.region}` : ""}
            </p>
          </div>
        </div>
        <StatusBadge status={account.status} />
      </div>

      {/* Protocol badge */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge
          variant="outline"
          className={cn(
            "text-[10px]",
            statusBadgeClass(engineColor(account.protocol.engine))
          )}
        >
          {account.protocol.displayName}
        </Badge>
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          {account.server.countryCode || "—"}
        </Badge>
      </div>

      {/* Quota */}
      {limit > 0 ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Pemakaian Kuota</span>
            <span className="font-mono text-muted-foreground">
              {formatBytes(used)} / {formatBytes(limit)}
            </span>
          </div>
          <Progress
            value={percent}
            className={cn(
              "h-1.5",
              quotaColor === "emerald" && "[&>div]:bg-emerald-500",
              quotaColor === "amber" && "[&>div]:bg-amber-500",
              quotaColor === "rose" && "[&>div]:bg-rose-500"
            )}
          />
          <div className="flex items-center justify-between text-[10px]">
            <span
              className={cn(
                "font-medium",
                quotaColor === "emerald" && "text-emerald-400",
                quotaColor === "amber" && "text-amber-400",
                quotaColor === "rose" && "text-rose-400"
              )}
            >
              {percent}% terpakai
            </span>
            <span className="text-muted-foreground">
              ↑ {formatBytes(account.uploadBytes)} · ↓{" "}
              {formatBytes(account.downloadBytes)}
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-md bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-xs text-emerald-400 font-medium">
          Unlimited kuota · ↑ {formatBytes(account.uploadBytes)} · ↓{" "}
          {formatBytes(account.downloadBytes)}
        </div>
      )}

      {/* Expiry */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/60">
        <span>
          Kedaluwarsa:{" "}
          <span className="font-medium text-foreground">
            {formatDate(account.expiresAt)}
          </span>
        </span>
        <span>{timeAgo(account.expiresAt)}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-auto">
        <Button size="sm" variant="outline" className="flex-1" onClick={onViewConfig}>
          <Eye className="h-3.5 w-3.5" />
          Config
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={downloadConf}
          aria-label="Download .conf"
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Card>
  );
}

function ConfigDialog({
  accountId,
  onClose,
}: {
  accountId: string | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery<{
    configText: string;
    qrData: string;
    shareLink: string;
    protocol: string;
    username: string;
    server: { name: string };
    protocolDisplay: string;
  }>({
    queryKey: ["account-config", accountId],
    queryFn: () => apiFetch(`/api/portal/customer/my-accounts/${accountId}/config`),
    enabled: !!accountId,
  });

  const [copied, setCopied] = React.useState(false);

  function copyConfig() {
    if (!data?.configText) return;
    navigator.clipboard
      .writeText(data.configText)
      .then(() => {
        setCopied(true);
        toast.success("Config disalin ke clipboard");
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => toast.error("Gagal menyalin"));
  }

  function downloadConf() {
    if (!data?.configText) {
      toast.error("Config belum dimuat. Tunggu sebentar lalu coba lagi.");
      return;
    }
    const blob = new Blob([data.configText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.username}.conf`;
    // MUST append to DOM for Chrome/Firefox to trigger download
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Small delay before revoke to ensure download starts
    setTimeout(() => URL.revokeObjectURL(url), 100);
    toast.success(`File ${data.username}.conf diunduh`);
  }

  return (
    <Dialog open={!!accountId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Konfigurasi Akun VPN
          </DialogTitle>
          <DialogDescription>
            {data?.username ? (
              <>
                <span className="font-mono">{data.username}</span> ·{" "}
                {data.protocolDisplay} · {data.server.name}
              </>
            ) : (
              "Memuat konfigurasi…"
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="shrink-0 mx-auto">
                <div className="rounded-lg border border-border bg-white p-2 w-fit">
                  { }
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(data.qrData)}`}
                    alt="QR code konfigurasi VPN"
                    width={180}
                    height={180}
                    className="rounded"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground text-center mt-1">
                  Pindai untuk import
                </p>
              </div>
              <div className="flex-1 min-w-0">
                <pre className="max-h-48 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-[11px] font-mono whitespace-pre-wrap break-all text-foreground/90">
                  {data.configText}
                </pre>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={copyConfig}>
                {copied ? "Tersalin!" : "Salin Config"}
              </Button>
              <Button variant="outline" size="sm" onClick={downloadConf}>
                <Download className="h-4 w-4" />
                Download .conf
              </Button>
              <Button size="sm" onClick={onClose}>
                Tutup
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
