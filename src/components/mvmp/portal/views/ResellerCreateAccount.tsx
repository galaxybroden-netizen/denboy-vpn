"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Globe2,
  Loader2,
  Package as PackageIcon,
  ShieldCheck,
  UserPlus,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import { apiFetch, engineColor, statusBadgeClass } from "../../lib";
import { formatBytes, formatCurrency, formatDate } from "@/lib/utils-mvmp";
import { cn } from "@/lib/utils";

interface CustomerItem {
  id: string;
  customerCode: string;
  name: string;
  email: string;
}

interface PackageItem {
  id: string;
  name: string;
  price: number;
  currency: string;
  durationDays: number;
  quotaBytes?: number | null;
  maxDevices: number;
  status: string;
  protocols: Array<{
    protocol: {
      id: string;
      key: string;
      displayName: string;
      engine: string;
    };
  }>;
}

const REGIONS = [
  { value: "", label: "Any (otomatis)" },
  { value: "Indonesia", label: "🇮🇩 Indonesia" },
  { value: "Singapore", label: "🇸🇬 Singapore" },
  { value: "US West", label: "🇺🇸 US West" },
  { value: "Netherlands", label: "🇳🇱 Netherlands" },
];

interface CreateResult {
  transaction: {
    id: string;
    invoiceNumber: string;
    amount: number;
    currency: string;
    status: string;
  };
  subscription: {
    id: string;
    status: string;
    startsAt: string;
    expiresAt: string;
  };
  vpnAccount: {
    id: string;
    username: string;
    status: string;
    expiresAt: string;
    maxDevices: number;
  };
}

export function ResellerCreateAccount() {
  const [step, setStep] = React.useState(1);
  const [customerId, setCustomerId] = React.useState("");
  const [packageId, setPackageId] = React.useState("");
  const [protocolId, setProtocolId] = React.useState("");
  const [preferredRegion, setPreferredRegion] = React.useState("");
  const [successResult, setSuccessResult] = React.useState<CreateResult | null>(null);

  // Fetch customers
  const { data: customersData, isLoading: customersLoading } = useQuery<{ items: CustomerItem[] }>({
    queryKey: ["reseller-customers-mini"],
    queryFn: () => apiFetch("/api/portal/reseller/my-customers?limit=100"),
  });

  // Fetch packages (reseller has packages.view permission)
  const { data: packagesData, isLoading: packagesLoading } = useQuery<{ items: PackageItem[] }>({
    queryKey: ["packages-mini"],
    queryFn: () => apiFetch("/api/packages?status=ACTIVE"),
  });

  const customers = customersData?.items ?? [];
  const packages = (packagesData?.items ?? []).filter((p) => p.status === "ACTIVE");
  const selectedPackage = packages.find((p) => p.id === packageId);
  const selectedCustomer = customers.find((c) => c.id === customerId);

  const availableProtocols = selectedPackage?.protocols
    ? selectedPackage.protocols.map((pp) => pp.protocol)
    : [];

  React.useEffect(() => {
    if (packageId) {
      // Reset protocol when package changes
      setProtocolId("");
    }
  }, [packageId]);

  React.useEffect(() => {
    if (availableProtocols.length > 0 && !protocolId) {
      setProtocolId(availableProtocols[0].id);
    }
  }, [availableProtocols, protocolId]);

  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<CreateResult>("/api/portal/reseller/create-account", {
        method: "POST",
        body: JSON.stringify({
          customerId,
          packageId,
          protocolId,
          preferredRegion: preferredRegion || undefined,
        }),
      }),
    onSuccess: (data) => {
      toast.success("Akun VPN berhasil dibuat");
      qc.invalidateQueries({ queryKey: ["reseller-dashboard"] });
      qc.invalidateQueries({ queryKey: ["reseller-customers"] });
      qc.invalidateQueries({ queryKey: ["reseller-ledger"] });
      setSuccessResult(data);
    },
    onError: (e: any) => {
      toast.error(e?.message || "Gagal membuat akun VPN");
    },
  });

  function reset() {
    setStep(1);
    setCustomerId("");
    setPackageId("");
    setProtocolId("");
    setPreferredRegion("");
    setSuccessResult(null);
  }

  function next() {
    if (step < 4) setStep((s) => s + 1);
  }
  function prev() {
    if (step > 1) setStep((s) => s - 1);
  }

  const canProceed = [
    () => !!customerId,
    () => !!packageId,
    () => !!protocolId,
    () => true,
  ][step - 1];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Buat Akun VPN"
        description="Provisioning akun VPN untuk pelanggan Anda"
      />

      {/* Stepper */}
      <Card className="p-4 gap-0">
        <div className="flex items-center justify-between gap-2">
          {[
            { n: 1, label: "Pilih Pelanggan" },
            { n: 2, label: "Pilih Paket" },
            { n: 3, label: "Pilih Protokol" },
            { n: 4, label: "Region & Konfirmasi" },
          ].map((s, idx) => (
            <React.Fragment key={s.n}>
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    step > s.n
                      ? "bg-emerald-500 border-emerald-500 text-white"
                      : step === s.n
                      ? "bg-emerald-500/15 border-emerald-500 text-emerald-400"
                      : "border-border text-muted-foreground"
                  )}
                >
                  {step > s.n ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    s.n
                  )}
                </div>
                <span
                  className={cn(
                    "text-xs font-medium truncate hidden sm:inline",
                    step === s.n
                      ? "text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {s.label}
                </span>
              </div>
              {idx < 3 ? (
                <div
                  className={cn(
                    "flex-1 h-px",
                    step > s.n ? "bg-emerald-500/40" : "bg-border"
                  )}
                />
              ) : null}
            </React.Fragment>
          ))}
        </div>
      </Card>

      <Card className="p-6 gap-4">
        {/* Step 1: Customer */}
        {step === 1 ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">
                Pilih Pelanggan
              </h3>
              <p className="text-xs text-muted-foreground">
                Pilih pelanggan yang akan menerima akun VPN baru
              </p>
            </div>
            {customersLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : customers.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center">
                <UserPlus className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Belum ada pelanggan. Tambahkan pelanggan terlebih dahulu.
                </p>
              </div>
            ) : (
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih pelanggan…" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="text-[10px] font-mono"
                        >
                          {c.customerCode}
                        </Badge>
                        {c.name} · {c.email}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        ) : null}

        {/* Step 2: Package */}
        {step === 2 ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">
                Pilih Paket
              </h3>
              <p className="text-xs text-muted-foreground">
                Harga paket akan dipotong dari saldo reseller Anda
              </p>
            </div>
            {packagesLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : packages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Tidak ada paket tersedia
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {packages.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPackageId(p.id)}
                    className={cn(
                      "text-left rounded-md border bg-muted/20 p-3 transition-colors",
                      packageId === p.id
                        ? "border-emerald-500/40 bg-emerald-500/10"
                        : "border-border hover:bg-muted/40"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {p.name}
                      </span>
                      {packageId === p.id ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(p.price, p.currency)} · {p.durationDays} hari
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {p.quotaBytes ? formatBytes(p.quotaBytes) : "Unlimited"} · {p.maxDevices} perangkat
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {/* Step 3: Protocol */}
        {step === 3 ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">
                Pilih Protokol VPN
              </h3>
              <p className="text-xs text-muted-foreground">
                Protokol yang tersedia untuk paket {selectedPackage?.name}
              </p>
            </div>
            {availableProtocols.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Tidak ada protokol pada paket ini
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {availableProtocols.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProtocolId(p.id)}
                    className={cn(
                      "flex items-center gap-3 rounded-md border bg-muted/20 p-3 text-left transition-colors",
                      protocolId === p.id
                        ? "border-emerald-500/40 bg-emerald-500/10"
                        : "border-border hover:bg-muted/40"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                        statusBadgeClass(engineColor(p.engine))
                      )}
                    >
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {p.displayName}
                      </p>
                      <p className="text-[10px] text-muted-foreground capitalize">
                        {p.engine}
                      </p>
                    </div>
                    {protocolId === p.id ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {/* Step 4: Region + Summary */}
        {step === 4 ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Preferensi Region Server</Label>
              <Select value={preferredRegion} onValueChange={setPreferredRegion}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih region (opsional)" />
                </SelectTrigger>
                <SelectContent>
                  {REGIONS.map((r) => (
                    <SelectItem key={r.value || "any"} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Sistem akan memilih server online yang tersedia. Jika preferensi
                tidak ditemukan, region lain akan dipilih otomatis.
              </p>
            </div>

            {/* Summary */}
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <h4 className="text-sm font-semibold text-foreground">
                Ringkasan
              </h4>
              <div className="grid gap-2 sm:grid-cols-2 text-sm">
                <SummaryRow
                  icon={UserPlus}
                  label="Pelanggan"
                  value={
                    selectedCustomer
                      ? `${selectedCustomer.name} (${selectedCustomer.customerCode})`
                      : "-"
                  }
                />
                <SummaryRow
                  icon={PackageIcon}
                  label="Paket"
                  value={
                    selectedPackage
                      ? selectedPackage.name
                      : "-"
                  }
                />
                <SummaryRow
                  icon={CreditCard}
                  label="Harga"
                  value={
                    selectedPackage
                      ? formatCurrency(selectedPackage.price, selectedPackage.currency)
                      : "-"
                  }
                />
                <SummaryRow
                  icon={ShieldCheck}
                  label="Protokol"
                  value={
                    availableProtocols.find((p) => p.id === protocolId)
                      ?.displayName || "-"
                  }
                />
                <SummaryRow
                  icon={Globe2}
                  label="Region"
                  value={
                    REGIONS.find((r) => r.value === preferredRegion)?.label ||
                    "Any"
                  }
                />
                <SummaryRow
                  icon={Wallet}
                  label="Estimasi Kedaluwarsa"
                  value={
                    selectedPackage
                      ? formatDate(
                          new Date(
                            Date.now() +
                              selectedPackage.durationDays * 24 * 3600 * 1000
                          )
                        )
                      : "-"
                  }
                />
              </div>
              <div className="h-px bg-border/60" />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Akan dipotong dari saldo
                </span>
                <span className="text-lg font-bold text-rose-400 tabular-nums">
                  -{formatCurrency(selectedPackage?.price ?? 0)}
                </span>
              </div>
            </div>
          </div>
        ) : null}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <Button
            variant="ghost"
            onClick={step === 1 ? undefined : prev}
            disabled={step === 1}
          >
            Kembali
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Langkah {step} dari 4
            </span>
            {step < 4 ? (
              <Button onClick={next} disabled={!canProceed()}>
                Lanjut
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={() => mutation.mutate()}
                disabled={
                  mutation.isPending ||
                  !customerId ||
                  !packageId ||
                  !protocolId
                }
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Membuat…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Konfirmasi & Buat Akun
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </Card>

      <SuccessDialog
        result={successResult}
        onClose={reset}
      />
    </div>
  );
}

function SummaryRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
      <span className="text-xs text-muted-foreground shrink-0">{label}:</span>
      <span className="text-sm text-foreground font-medium truncate">
        {value}
      </span>
    </div>
  );
}

function SuccessDialog({
  result,
  onClose,
}: {
  result: CreateResult | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!result} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            Akun VPN Berhasil Dibuat
          </DialogTitle>
          <DialogDescription>
            Akun VPN baru telah di-provisioning dan siap digunakan
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-3">
              <div className="grid gap-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Username</span>
                  <span className="font-mono font-semibold text-foreground">
                    {result.vpnAccount.username}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Status Akun
                  </span>
                  <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/30">
                    {result.vpnAccount.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Invoice
                  </span>
                  <span className="font-mono text-xs text-foreground">
                    {result.transaction.invoiceNumber}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Kedaluwarsa
                  </span>
                  <span className="text-xs text-foreground">
                    {formatDate(result.vpnAccount.expiresAt)}
                  </span>
                </div>
                <div className="h-px bg-border/60" />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-emerald-400">
                    Status Pembayaran
                  </span>
                  <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                    {result.transaction.status}
                  </Badge>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Saldo reseller telah dipotong. Akun VPN berstatus{" "}
              <span className="font-medium text-amber-400">PENDING</span> dan
              akan diaktifkan otomatis setelah provisioning server selesai.
            </p>
          </div>
        ) : null}

        <DialogFooter>
          <Button onClick={onClose}>Buat Akun Lain</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
