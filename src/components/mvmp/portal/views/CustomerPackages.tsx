"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  CheckCircle2,
  Crown,
  Gauge,
  HardDrive,
  Loader2,
  Lock,
  Package as PackageIcon,
  Smartphone,
  Users,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "../../PageHeader";
import { EmptyState, apiFetch, engineColor, statusBadgeClass } from "../../lib";
import { formatBytes, formatCurrency } from "@/lib/utils-mvmp";
import { cn } from "@/lib/utils";

interface PackageItem {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  currency: string;
  durationDays: number;
  quotaBytes?: number | null;
  maxDevices: number;
  isFeatured: boolean;
  isPremium: boolean;
  eligible: boolean;
  subscribersCount: number;
  protocols: Array<{
    id: string;
    key: string;
    displayName: string;
    engine: string;
    isPremium: boolean;
  }>;
}

type PaymentMethod = "QRIS" | "BANK_TRANSFER";

interface BuyResult {
  transaction: {
    id: string;
    invoiceNumber: string;
    amount: number;
    currency: string;
    status: string;
  };
  payment: {
    id: string;
    provider: string;
    paymentMethod: PaymentMethod;
    status: string;
    qrisData?: string | null;
    vaNumber?: string | null;
    expiresAt?: string | null;
  };
  invoice: {
    id: string;
    invoiceNumber: string;
    dueAt: string;
  };
}

export function CustomerPackages() {
  const { data, isLoading } = useQuery<{ items: PackageItem[]; hasPriorPaid: boolean }>({
    queryKey: ["customer-packages"],
    queryFn: () => apiFetch("/api/portal/customer/packages"),
  });

  const [buyingPackage, setBuyingPackage] = React.useState<PackageItem | null>(null);
  const [buyResult, setBuyResult] = React.useState<BuyResult | null>(null);

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Beli Paket"
        description="Pilih paket subscription yang tersedia untuk Anda"
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-72 w-full rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="p-0 gap-0">
          <EmptyState
            icon={PackageIcon}
            title="Belum ada paket tersedia"
            description="Paket subscription akan muncul di sini saat admin menambahkannya."
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((pkg) => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              onBuy={() => setBuyingPackage(pkg)}
            />
          ))}
        </div>
      )}

      <BuyDialog
        pkg={buyingPackage}
        onClose={() => setBuyingPackage(null)}
        onSuccess={(result) => {
          setBuyingPackage(null);
          setBuyResult(result);
        }}
      />

      <SuccessDialog result={buyResult} onClose={() => setBuyResult(null)} />
    </div>
  );
}

function PackageCard({
  pkg,
  onBuy,
}: {
  pkg: PackageItem;
  onBuy: () => void;
}) {
  return (
    <Card
      className={cn(
        "p-6 gap-4 flex flex-col relative overflow-hidden",
        pkg.isFeatured && "border-emerald-500/40 ring-1 ring-emerald-500/20"
      )}
    >
      {pkg.isFeatured ? (
        <div className="absolute top-0 right-0 bg-gradient-to-l from-emerald-500/30 to-transparent px-3 py-1 text-[10px] uppercase tracking-wider font-semibold text-emerald-400">
          ⭐ Populer
        </div>
      ) : null}

      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="text-xl font-semibold text-foreground truncate">
            {pkg.name}
          </h3>
          {pkg.isPremium ? (
            <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 shrink-0">
              <Crown className="h-3 w-3" />
              Premium
            </Badge>
          ) : null}
        </div>
        {pkg.description ? (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {pkg.description}
          </p>
        ) : null}
      </div>

      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-foreground tabular-nums">
          {formatCurrency(pkg.price, pkg.currency)}
        </span>
        <span className="text-xs text-muted-foreground">
          / {pkg.durationDays} hari
        </span>
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <HardDrive className="h-3.5 w-3.5 text-cyan-400" />
          <span className="text-muted-foreground">Kuota:</span>
          <span className="font-medium text-foreground">
            {pkg.quotaBytes ? formatBytes(pkg.quotaBytes) : "Unlimited"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-muted-foreground">Perangkat:</span>
          <span className="font-medium text-foreground">
            {pkg.maxDevices} perangkat
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Gauge className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-muted-foreground">Subscribers:</span>
          <span className="font-medium text-foreground">
            {pkg.subscribersCount}
          </span>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
          Protokol
        </p>
        <div className="flex flex-wrap gap-1.5">
          {pkg.protocols.length === 0 ? (
            <span className="text-xs text-muted-foreground italic">
              Tidak ada protokol
            </span>
          ) : (
            pkg.protocols.map((p) => (
              <Badge
                key={p.id}
                variant="outline"
                className={cn(
                  "text-[10px]",
                  statusBadgeClass(engineColor(p.engine))
                )}
              >
                {p.displayName}
                {p.isPremium ? " ⭐" : ""}
              </Badge>
            ))
          )}
        </div>
      </div>

      <Button
        className="mt-auto w-full"
        onClick={onBuy}
        disabled={!pkg.eligible}
      >
        {pkg.eligible ? (
          <>
            <Zap className="h-4 w-4" />
            Beli Paket
          </>
        ) : (
          <>
            <Lock className="h-4 w-4" />
            Premium Terkunci
          </>
        )}
      </Button>
      {!pkg.eligible ? (
        <p className="text-[10px] text-amber-400/80 text-center -mt-2">
          Butuh riwayat pembayaran untuk membuka paket premium
        </p>
      ) : null}
    </Card>
  );
}

function BuyDialog({
  pkg,
  onClose,
  onSuccess,
}: {
  pkg: PackageItem | null;
  onClose: () => void;
  onSuccess: (result: BuyResult) => void;
}) {
  const qc = useQueryClient();
  const [serverId, setServerId] = React.useState<string>("");
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>("QRIS");

  // Fetch registered servers from customer-facing endpoint (only ONLINE servers,
  // minimal public info — no SSH port, no monthly cost, no agent details)
  const { data: serversData } = useQuery<{ items: ServerItem[] }>({
    queryKey: ["customer-servers-list"],
    queryFn: () => apiFetch("/api/portal/customer/servers"),
    enabled: !!pkg,
  });

  const servers = serversData?.items ?? [];

  // Default-select first ONLINE server when list loads
  React.useEffect(() => {
    if (pkg && !serverId && servers.length > 0) {
      const firstOnline = servers.find((s) => s.status === "ONLINE");
      setServerId((firstOnline || servers[0]).id);
    }
    if (pkg) {
      setPaymentMethod("QRIS");
    }
  }, [pkg, servers, serverId]);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<BuyResult>("/api/portal/customer/buy", {
        method: "POST",
        body: JSON.stringify({
          packageId: pkg?.id,
          serverId,
          paymentMethod,
          // protocolId intentionally omitted → backend auto-provisions ALL protocols in the package
        }),
      }),
    onSuccess: (data) => {
      toast.success("Pembayaran dibuat, menunggu konfirmasi");
      qc.invalidateQueries({ queryKey: ["customer-transactions"] });
      qc.invalidateQueries({ queryKey: ["customer-dashboard"] });
      onSuccess(data);
    },
    onError: (e: any) => {
      toast.error(e?.message || "Gagal membuat pembayaran");
    },
  });

  const total = pkg?.price ?? 0;
  const selectedServer = servers.find((s) => s.id === serverId);

  // Protocols in this package (informational — actual provisioning happens server-side
  // when the payment is approved, creating one VPN account per protocol on the chosen server)
  const protocolsInPackage = pkg?.protocols ?? [];

  return (
    <Dialog open={!!pkg} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageIcon className="h-4 w-4 text-emerald-400" />
            Beli Paket
          </DialogTitle>
          <DialogDescription>
            {pkg?.name} · {pkg?.durationDays} hari
          </DialogDescription>
        </DialogHeader>

        {pkg ? (
          <div className="space-y-4">
            {/* Summary */}
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Paket</span>
                <span className="font-medium text-foreground">{pkg.name}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Durasi</span>
                <span className="font-medium text-foreground">
                  {pkg.durationDays} hari
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Kuota</span>
                <span className="font-medium text-foreground">
                  {pkg.quotaBytes ? formatBytes(pkg.quotaBytes) : "Unlimited"}
                </span>
              </div>
              <div className="h-px bg-border/60" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Harga</span>
                <span className="text-lg font-bold text-foreground tabular-nums">
                  {formatCurrency(pkg.price, pkg.currency)}
                </span>
              </div>
            </div>

            {/* Server location picker (dynamic from /api/servers) */}
            <div className="space-y-2">
              <Label className="text-xs">
                Pilih Lokasi Server{" "}
                <span className="text-muted-foreground/70">
                  ({servers.length} server terdaftar)
                </span>
              </Label>
              <Select value={serverId} onValueChange={setServerId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih lokasi server VPN" />
                </SelectTrigger>
                <SelectContent>
                  {servers.map((s) => (
                    <SelectItem
                      key={s.id}
                      value={s.id}
                      disabled={s.status !== "ONLINE"}
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-base leading-none">
                          {getCountryFlagEmoji(s.countryCode)}
                        </span>
                        <span>{s.name}</span>
                        <span className="text-muted-foreground text-xs">
                          · {s.region}
                        </span>
                        {s.status !== "ONLINE" ? (
                          <span className="text-rose-400 text-xs ml-1">
                            (offline)
                          </span>
                        ) : null}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedServer ? (
                <p className="text-[10px] text-muted-foreground">
                  IP: <span className="font-mono">{selectedServer.publicIp}</span> ·{" "}
                  Provider: {selectedServer.provider}
                </p>
              ) : null}
            </div>

            {/* Protocols that will be auto-provisioned (informational) */}
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-1.5">
              <p className="text-xs font-medium text-emerald-400">
                ✓ {protocolsInPackage.length} protokol akan di-generate otomatis di server ini:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {protocolsInPackage.map((p) => (
                  <Badge
                    key={p.id}
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      statusBadgeClass(engineColor(p.engine))
                    )}
                  >
                    {p.displayName}
                    {p.isPremium ? " ⭐" : ""}
                  </Badge>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Setelah pembayaran dikonfirmasi admin, semua akun VPN muncul di halaman{" "}
                <span className="font-medium text-foreground">"Akun Saya"</span>.
              </p>
            </div>

            {/* Payment method */}
            <div className="space-y-2">
              <Label className="text-xs">Metode Pembayaran</Label>
              <RadioGroup
                value={paymentMethod}
                onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
                className="grid grid-cols-2 gap-2"
              >
                <Label
                  htmlFor="pm-qris"
                  className={cn(
                    "flex items-center gap-2 rounded-md border border-border bg-muted/20 p-3 cursor-pointer hover:bg-muted/40 transition-colors",
                    paymentMethod === "QRIS" && "border-emerald-500/40 bg-emerald-500/10"
                  )}
                >
                  <RadioGroupItem id="pm-qris" value="QRIS" />
                  <Smartphone className="h-4 w-4 text-emerald-400" />
                  <div className="flex flex-col leading-none">
                    <span className="text-sm font-medium">QRIS</span>
                    <span className="text-[10px] text-muted-foreground">
                      Scan & Bayar
                    </span>
                  </div>
                </Label>
                <Label
                  htmlFor="pm-bank"
                  className={cn(
                    "flex items-center gap-2 rounded-md border border-border bg-muted/20 p-3 cursor-pointer hover:bg-muted/40 transition-colors",
                    paymentMethod === "BANK_TRANSFER" && "border-cyan-500/40 bg-cyan-500/10"
                  )}
                >
                  <RadioGroupItem id="pm-bank" value="BANK_TRANSFER" />
                  <Banknote className="h-4 w-4 text-cyan-400" />
                  <div className="flex flex-col leading-none">
                    <span className="text-sm font-medium">Transfer Bank</span>
                    <span className="text-[10px] text-muted-foreground">
                      Virtual Account
                    </span>
                  </div>
                </Label>
              </RadioGroup>
            </div>

            {/* Total */}
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 flex items-center justify-between">
              <span className="text-xs text-emerald-400 font-medium">
                Total Bayar
              </span>
              <span className="text-lg font-bold text-foreground tabular-nums">
                {formatCurrency(total, pkg.currency)}
              </span>
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !serverId}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Memproses…
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Konfirmasi Pembayaran
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Helper: emoji flag from country code (same as admin uses)
function getCountryFlagEmoji(code: string): string {
  if (!code || code.length !== 2) return "🌐";
  const A = 0x1f1e6;
  return String.fromCodePoint(A + (code.charCodeAt(0) - 65), A + (code.charCodeAt(1) - 65));
}

interface ServerItem {
  id: string;
  name: string;
  hostname: string;
  publicIp: string;
  region: string;
  countryCode: string;
  provider: string;
  status: string;
}

function SuccessDialog({
  result,
  onClose,
}: {
  result: BuyResult | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = React.useState<string | null>(null);

  function copyValue(value: string, label: string) {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(label);
        toast.success(`${label} disalin`);
        setTimeout(() => setCopied(null), 2000);
      })
      .catch(() => toast.error("Gagal menyalin"));
  }

  const isQRIS = result?.payment.paymentMethod === "QRIS";

  return (
    <Dialog open={!!result} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            Pembayaran Dibuat
          </DialogTitle>
          <DialogDescription>
            Invoice{" "}
            <span className="font-mono text-foreground">
              {result?.transaction.invoiceNumber}
            </span>{" "}
            · Jatuh tempo 24 jam
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            {/* Status banner */}
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-3 flex items-center gap-3">
              <Loader2 className="h-4 w-4 text-amber-400" />
              <div className="text-xs">
                <p className="font-medium text-amber-400">
                  Menunggu Pembayaran
                </p>
                <p className="text-amber-400/70">
                  Selesaikan pembayaran dalam 24 jam agar transaksi tidak
                  kedaluwarsa.
                </p>
              </div>
            </div>

            {isQRIS ? (
              <div className="flex flex-col items-center gap-3">
                <div className="rounded-lg border border-border bg-white p-2">
                  {/* QR code */}
                  { }
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(result.payment.qrisData || "")}`}
                    alt="QRIS payment code"
                    width={200}
                    height={200}
                    className="rounded"
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center max-w-xs">
                  Pindai kode QRIS di atas menggunakan aplikasi e-wallet atau
                  mobile banking Anda.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyValue(result.payment.qrisData || "", "QRIS data")}
                >
                  {copied === "QRIS data" ? "Tersalin!" : "Salin QRIS Data"}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Nomor Virtual Account
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs"
                      onClick={() =>
                        copyValue(result.payment.vaNumber || "", "VA Number")
                      }
                    >
                      {copied === "VA Number" ? "Tersalin!" : "Salin"}
                    </Button>
                  </div>
                  <p className="font-mono text-lg font-semibold text-foreground tracking-wider">
                    {result.payment.vaNumber}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground mb-2">
                    Transfer ke rekening berikut:
                  </p>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Bank</span>
                      <span className="font-medium">BCA / Mandiri / BNI / BRI</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Nama</span>
                      <span className="font-medium">MVMP STORE</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Jumlah</span>
                      <span className="font-bold text-foreground tabular-nums">
                        {formatCurrency(result.transaction.amount, result.transaction.currency)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Tutup
          </Button>
          <Button onClick={onClose}>Saya Mengerti</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
