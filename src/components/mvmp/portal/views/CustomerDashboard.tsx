"use client";

import * as React from "react";
import {
  Activity,
  ArrowRight,
  Calendar,
  CreditCard,
  Download,
  HardDrive,
  Loader2,
  Package as PackageIcon,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "../../PageHeader";
import { StatCard } from "../../StatCard";
import { StatusBadge } from "../../StatusBadge";
import { EmptyState, apiFetch, engineColor, statusBadgeClass } from "../../lib";
import {
  formatBytes,
  formatCurrency,
  formatDate,
  formatNumber,
  timeAgo,
  getCountryFlag,
} from "@/lib/utils-mvmp";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";

interface DashboardData {
  profile: {
    id: string;
    customerCode: string;
    name: string;
    email: string;
    phone?: string | null;
    status: string;
  };
  stats: {
    activeAccounts: number;
    activeSubscriptions: number;
    totalQuotaUsed: string;
    totalQuotaRemaining: string;
    totalQuotaLimit: string;
  };
  activeAccounts: Array<{
    id: string;
    username: string;
    status: string;
    expiresAt: string;
    quotaUsed: number;
    quotaLimit: number;
    quotaUsagePercent: number;
    server: { id: string; name: string; publicIp?: string; region?: string; countryCode?: string };
    protocol: { id: string; key: string; displayName: string; engine: string };
  }>;
  upcomingExpirations: Array<{
    id: string;
    username: string;
    expiresAt: string;
    server: { name: string; countryCode?: string };
    protocol: { displayName: string; engine: string };
  }>;
  recentTransactions: Array<{
    id: string;
    invoiceNumber: string;
    amount: number;
    currency: string;
    status: string;
    createdAt: string;
    paidAt?: string | null;
    provider?: string | null;
  }>;
  recommendedPackages: Array<{
    id: string;
    name: string;
    price: number;
    currency: string;
    durationDays: number;
    quotaBytes?: number | null;
    isFeatured: boolean;
    protocols: Array<{ id: string; key: string; displayName: string; engine: string }>;
  }>;
}

export function CustomerDashboard() {
  const setView = useAppStore((s) => s.setView);
  const [configAccountId, setConfigAccountId] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["customer-dashboard"],
    queryFn: () => apiFetch("/api/portal/customer/dashboard"),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const totalQuotaUsed = Number(data.stats.totalQuotaUsed || 0);
  const totalQuotaLimit = Number(data.stats.totalQuotaLimit || 0);

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <Card className="p-6 gap-0 bg-gradient-to-br from-emerald-500/10 via-card to-card border-emerald-500/20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Halo, {data.profile.name} 👋
              </h1>
              <Badge
                variant="outline"
                className="font-mono text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
              >
                {data.profile.customerCode}
              </Badge>
              <StatusBadge status={data.profile.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              Selamat datang di portal pelanggan MVMP. Kelola akun VPN dan transaksi Anda di sini.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setView("c-packages")}
            >
              <PackageIcon className="h-4 w-4" />
              Beli Paket
            </Button>
            <Button size="sm" onClick={() => setView("c-accounts")}>
              <ShieldCheck className="h-4 w-4" />
              Akun Saya
            </Button>
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Akun Aktif"
          value={formatNumber(data.stats.activeAccounts)}
          icon={ShieldCheck}
          accent="emerald"
          sublabel={`${data.stats.activeSubscriptions} subscription aktif`}
        />
        <StatCard
          title="Total Kuota"
          value={totalQuotaLimit > 0 ? formatBytes(totalQuotaLimit) : "Unlimited"}
          icon={HardDrive}
          accent="cyan"
          sublabel={totalQuotaLimit > 0 ? `${formatBytes(Number(data.stats.totalQuotaRemaining))} tersisa` : "Tanpa batas"}
        />
        <StatCard
          title="Total Pemakaian"
          value={formatBytes(totalQuotaUsed)}
          icon={Activity}
          accent="amber"
          sublabel="Upload + Download"
        />
        <StatCard
          title="Transaksi"
          value={formatNumber(data.recentTransactions.length)}
          icon={CreditCard}
          accent="rose"
          sublabel="Transaksi terbaru"
        />
      </div>

      {/* Active VPN accounts */}
      <Card className="p-6 gap-4">
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">
              Akun VPN Aktif
            </h2>
            <p className="text-xs text-muted-foreground">
              {data.activeAccounts.length} akun sedang aktif
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setView("c-accounts")}
          >
            Lihat Semua
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        {data.activeAccounts.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Belum ada akun VPN aktif"
            description="Beli paket pertama Anda untuk mulai menggunakan VPN."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.activeAccounts.map((acc) => (
              <AccountCard
                key={acc.id}
                account={acc}
                onViewConfig={() => setConfigAccountId(acc.id)}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Upcoming expirations + Recent transactions */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6 gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">
              Akun Akan Kedaluwarsa
            </h2>
            <p className="text-xs text-muted-foreground">
              Kadaluwarsa dalam 7 hari ke depan
            </p>
          </div>
          {data.upcomingExpirations.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="Tidak ada kedaluwarsa mendatang"
              description="Semua akun VPN Anda aktif untuk jangka panjang."
            />
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {data.upcomingExpirations.map((exp) => (
                <div
                  key={exp.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base">
                      {getCountryFlag(exp.server.countryCode || "")}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium font-mono text-foreground truncate">
                        {exp.username}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {exp.protocol.displayName} · {exp.server.name}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-amber-400 font-medium">
                      {formatDate(exp.expiresAt)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {timeAgo(exp.expiresAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6 gap-4">
          <div className="flex items-center justify-between gap-2">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">
                Transaksi Terbaru
              </h2>
              <p className="text-xs text-muted-foreground">
                5 transaksi terakhir
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setView("c-transactions")}
            >
              Lihat Semua
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          {data.recentTransactions.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="Belum ada transaksi"
              description="Transaksi pembelian paket akan muncul di sini."
            />
          ) : (
            <div className="overflow-x-auto -mx-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Nominal</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tanggal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentTransactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="font-mono text-xs">
                        {tx.invoiceNumber}
                      </TableCell>
                      <TableCell className="text-xs font-medium tabular-nums">
                        {formatCurrency(tx.amount, tx.currency)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={tx.status} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(tx.paidAt || tx.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>

      {/* Recommended packages */}
      <Card className="p-6 gap-4">
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-400" />
              Paket Rekomendasi
            </h2>
            <p className="text-xs text-muted-foreground">
              Paket unggulan untuk Anda
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setView("c-packages")}
          >
            Lihat Semua
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
        {data.recommendedPackages.length === 0 ? (
          <EmptyState
            icon={PackageIcon}
            title="Belum ada paket rekomendasi"
            description="Paket unggulan akan muncul di sini."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {data.recommendedPackages.map((pkg) => (
              <div
                key={pkg.id}
                className="rounded-lg border border-border bg-muted/20 p-4 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground truncate">
                    {pkg.name}
                  </h3>
                  {pkg.isFeatured ? (
                    <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30">
                      <Zap className="h-3 w-3" />
                      Populer
                    </Badge>
                  ) : null}
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground tabular-nums">
                    {formatCurrency(pkg.price, pkg.currency)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {pkg.durationDays} hari · {pkg.quotaBytes ? formatBytes(pkg.quotaBytes) : "Unlimited"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {pkg.protocols.slice(0, 3).map((p) => (
                    <Badge
                      key={p.id}
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        statusBadgeClass(engineColor(p?.engine))
                      )}
                    >
                      {p.displayName}
                    </Badge>
                  ))}
                </div>
                <Button
                  size="sm"
                  className="mt-auto"
                  onClick={() => setView("c-packages")}
                >
                  Beli Paket
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

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
  account: DashboardData["activeAccounts"][number];
  onViewConfig: () => void;
}) {
  const used = account.quotaUsed;
  const limit = account.quotaLimit;
  const percent = account.quotaUsagePercent;
  const quotaColor = percent >= 90 ? "rose" : percent >= 70 ? "amber" : "emerald";

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base">
            {getCountryFlag(account.server?.countryCode || "")}
          </span>
          <span className="text-sm font-mono font-medium text-foreground truncate">
            {account.username}
          </span>
        </div>
        <StatusBadge status={account.status} />
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="truncate">{account.server?.name || "-"}</span>
        <span className="text-muted-foreground/50">·</span>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px]",
            statusBadgeClass(engineColor(account.protocol?.engine))
          )}
        >
          {account.protocol?.displayName || "-"}
        </Badge>
      </div>

      {limit > 0 ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Kuota</span>
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
        </div>
      ) : (
        <div className="text-xs text-emerald-400 font-medium">
          Unlimited kuota
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
        <div className="text-[10px] text-muted-foreground">
          <Users className="inline h-3 w-3 mr-1" />
          {formatDate(account.expiresAt)}
        </div>
        <Button size="sm" variant="outline" onClick={onViewConfig}>
          Lihat Config
        </Button>
      </div>
    </div>
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
    if (!data?.configText) return;
    const blob = new Blob([data.configText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.username}.conf`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("File .conf diunduh");
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
              {/* QR code */}
              <div className="shrink-0 mx-auto">
                <div className="rounded-lg border border-border bg-white p-2 w-fit">
                  {/* Using img to render QR code */}
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

              {/* Config text */}
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
                <Loader2 className="hidden" />
                Tutup
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
