"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  PlusCircle,
  Smartphone,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PageHeader } from "../../PageHeader";
import { EmptyState, apiFetch } from "../../lib";
import { formatCurrency, formatDateTime } from "@/lib/utils-mvmp";
import { cn } from "@/lib/utils";

interface LedgerItem {
  id: string;
  entryType: string;
  amount: number;
  balanceAfter: number;
  description: string;
  reference?: string | null;
  createdAt: string;
}

interface LedgerResponse {
  items: LedgerItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  currentBalance: number;
}

type Method = "QRIS" | "BANK_TRANSFER";

export function ResellerTopup() {
  const qc = useQueryClient();
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<Method>("QRIS");
  const [note, setNote] = React.useState("");

  const { data, isLoading } = useQuery<LedgerResponse>({
    queryKey: ["reseller-ledger-pending", "CREDIT_PENDING"],
    queryFn: () =>
      apiFetch("/api/portal/reseller/ledger?limit=10&entryType=CREDIT_PENDING"),
  });

  const pendingItems = data?.items ?? [];
  const balance = data?.currentBalance ?? 0;

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/portal/reseller/topup", {
        method: "POST",
        body: JSON.stringify({
          amount: Number(amount),
          method,
          proofNote: note || undefined,
        }),
      }),
    onSuccess: () => {
      toast.success("Topup dicatat, menunggu verifikasi admin");
      qc.invalidateQueries({ queryKey: ["reseller-ledger-pending"] });
      qc.invalidateQueries({ queryKey: ["reseller-dashboard"] });
      qc.invalidateQueries({ queryKey: ["reseller-ledger"] });
      setAmount("");
      setNote("");
    },
    onError: (e: any) => {
      toast.error(e?.message || "Gagal mengirim permintaan topup");
    },
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error("Masukkan nominal topup yang valid");
      return;
    }
    if (amt < 10000) {
      toast.error("Minimal topup Rp 10.000");
      return;
    }
    mutation.mutate();
  }

  const amountPreview = amount
    ? formatCurrency(Number(amount) || 0)
    : "Rp 0";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Topup Saldo"
        description="Tambah saldo reseller Anda"
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Form */}
        <Card className="p-6 gap-4 lg:col-span-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15 border border-emerald-500/30">
              <PlusCircle className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-foreground">
                Formulir Topup
              </h2>
              <p className="text-xs text-muted-foreground">
                Saldo saat ini:{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {formatCurrency(balance)}
                </span>
              </p>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            {/* Amount */}
            <div className="space-y-1.5">
              <Label htmlFor="amount" className="text-xs">
                Nominal Topup (IDR)
              </Label>
              <Input
                id="amount"
                type="number"
                min="10000"
                step="1000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="50000"
                className="text-sm"
              />
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-muted-foreground">
                  Minimum Rp 10.000
                </p>
                <p className="text-xs font-semibold text-foreground tabular-nums">
                  {amountPreview}
                </p>
              </div>
              {/* Quick amounts */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[50000, 100000, 250000, 500000, 1000000].map((amt) => (
                  <Button
                    key={amt}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px]"
                    onClick={() => setAmount(String(amt))}
                  >
                    {formatCurrency(amt)}
                  </Button>
                ))}
              </div>
            </div>

            {/* Method */}
            <div className="space-y-2">
              <Label className="text-xs">Metode Pembayaran</Label>
              <RadioGroup
                value={method}
                onValueChange={(v) => setMethod(v as Method)}
                className="grid grid-cols-2 gap-2"
              >
                <Label
                  htmlFor="m-qris"
                  className={cn(
                    "flex items-center gap-2 rounded-md border border-border bg-muted/20 p-3 cursor-pointer hover:bg-muted/40 transition-colors",
                    method === "QRIS" && "border-emerald-500/40 bg-emerald-500/10"
                  )}
                >
                  <RadioGroupItem id="m-qris" value="QRIS" />
                  <Smartphone className="h-4 w-4 text-emerald-400" />
                  <div className="flex flex-col leading-none">
                    <span className="text-sm font-medium">QRIS</span>
                    <span className="text-[10px] text-muted-foreground">
                      Scan & Bayar
                    </span>
                  </div>
                </Label>
                <Label
                  htmlFor="m-bank"
                  className={cn(
                    "flex items-center gap-2 rounded-md border border-border bg-muted/20 p-3 cursor-pointer hover:bg-muted/40 transition-colors",
                    method === "BANK_TRANSFER" && "border-cyan-500/40 bg-cyan-500/10"
                  )}
                >
                  <RadioGroupItem id="m-bank" value="BANK_TRANSFER" />
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

            {/* Note */}
            <div className="space-y-1.5">
              <Label htmlFor="note" className="text-xs">
                Catatan (opsional)
              </Label>
              <Textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Contoh: bukti transfer dari rekening BCA a/n Joko"
                rows={3}
              />
              <p className="text-[10px] text-muted-foreground">
                Catatan akan terlihat oleh admin saat verifikasi.
              </p>
            </div>

            <Button
              type="submit"
              disabled={mutation.isPending}
              className="w-full"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Mengirim…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Kirim Permintaan Topup
                </>
              )}
            </Button>
          </form>
        </Card>

        {/* Info card */}
        <div className="space-y-4">
          <Card className="p-5 gap-3 bg-amber-500/5 border-amber-500/20">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">
                  Informasi Verifikasi
                </h3>
                <p className="text-xs text-muted-foreground">
                  Topup akan diverifikasi admin dalam 1×24 jam. Saldo akan
                  bertambah setelah verifikasi berhasil.
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-5 gap-3">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-foreground">
                Cara Kerja
              </h3>
            </div>
            <ol className="space-y-2 text-xs text-muted-foreground">
              <li className="flex gap-2">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-semibold">
                  1
                </span>
                Isi formulir & kirim permintaan
              </li>
              <li className="flex gap-2">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-semibold">
                  2
                </span>
                Lakukan pembayaran via metode yang dipilih
              </li>
              <li className="flex gap-2">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-semibold">
                  3
                </span>
                Admin memverifikasi pembayaran
              </li>
              <li className="flex gap-2">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-semibold">
                  4
                </span>
                Saldo masuk ke akun reseller Anda
              </li>
            </ol>
          </Card>
        </div>
      </div>

      {/* Recent topups */}
      <Card className="p-6 gap-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-400" />
            Permintaan Topup Terbaru
          </h3>
          <p className="text-xs text-muted-foreground">
            Topup yang masih menunggu verifikasi admin
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : pendingItems.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="Belum ada permintaan topup"
            description="Permintaan topup Anda akan muncul di sini."
          />
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {pendingItems.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 rounded-md border border-border bg-muted/20 px-3 py-2"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-amber-400">
                  <Clock className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground tabular-nums">
                      {formatCurrency(item.amount)}
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/30"
                    >
                      Pending
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground line-clamp-1">
                    {item.description}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatDateTime(item.createdAt)} · Ref: {item.reference || "-"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
