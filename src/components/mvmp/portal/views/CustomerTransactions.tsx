"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Banknote,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Eye,
  FileText,
  Receipt,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { EmptyState, apiFetch } from "../../lib";
import { formatCurrency, formatDate } from "@/lib/utils-mvmp";
import { generateInvoicePDF } from "@/lib/pdf";
import { cn } from "@/lib/utils";

interface TransactionItem {
  id: string;
  invoiceNumber: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  paidAt?: string | null;
  payment?: {
    provider: string;
    paymentMethod: string;
    status: string;
    qrisData?: string | null;
    vaNumber?: string | null;
    expiresAt?: string | null;
    createdAt: string;
  } | null;
  invoice?: { invoiceNumber: string; dueAt: string } | null;
}

interface TxListResponse {
  items: TransactionItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const STATUS_FILTERS = [
  { value: "ALL", label: "Semua Status" },
  { value: "PAID", label: "Lunas" },
  { value: "PENDING", label: "Menunggu Bayar" },
  { value: "EXPIRED", label: "Kedaluwarsa" },
];

export function CustomerTransactions() {
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState("ALL");
  const [detailTx, setDetailTx] = React.useState<TransactionItem | null>(null);
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);

  const params = new URLSearchParams({
    page: String(page),
    limit: "15",
    status,
  });
  const { data, isLoading } = useQuery<TxListResponse>({
    queryKey: ["customer-transactions", page, status],
    queryFn: () =>
      apiFetch(`/api/portal/customer/my-transactions?${params.toString()}`),
  });

  const items = data?.items ?? [];
  const pagination = data?.pagination;

  function handleDownloadInvoice(tx: TransactionItem) {
    setDownloadingId(tx.id);
    try {
      generateInvoicePDF(tx);
      toast.success("Invoice PDF diunduh");
    } catch (e: any) {
      toast.error(e?.message || "Gagal mengunduh invoice");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Riwayat Transaksi"
        description="Daftar transaksi pembelian paket Anda"
      />

      <div className="flex items-center gap-2">
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="p-0 gap-0 overflow-hidden">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Belum ada transaksi"
            description="Riwayat pembelian paket akan muncul di sini."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Nominal</TableHead>
                  <TableHead>Metode</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Dibuat</TableHead>
                  <TableHead>Dibayar</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((tx) => {
                  const isQRIS = tx.payment?.paymentMethod === "QRIS";
                  return (
                    <TableRow key={tx.id}>
                      <TableCell className="font-mono text-xs">
                        {tx.invoiceNumber}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="text-[10px] text-muted-foreground"
                        >
                          {tx.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium tabular-nums">
                        {formatCurrency(tx.amount, tx.currency)}
                      </TableCell>
                      <TableCell>
                        {tx.payment ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px]",
                              isQRIS
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                : "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                            )}
                          >
                            {isQRIS ? (
                              <>
                                <Smartphone className="h-3 w-3" />
                                QRIS
                              </>
                            ) : (
                              <>
                                <Banknote className="h-3 w-3" />
                                BANK
                              </>
                            )}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={tx.status} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(tx.createdAt)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(tx.paidAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDetailTx(tx)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Detail
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2"
                            disabled={downloadingId === tx.id}
                            onClick={() => handleDownloadInvoice(tx)}
                            aria-label="Unduh invoice"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">
                              {downloadingId === tx.id ? "…" : "Invoice"}
                            </span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {pagination && pagination.totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {pagination.total} transaksi · halaman {pagination.page} /{" "}
            {pagination.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
              Sebelumnya
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Berikutnya
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}

      <TransactionDetailDialog
        tx={detailTx}
        onClose={() => setDetailTx(null)}
      />
    </div>
  );
}

function TransactionDetailDialog({
  tx,
  onClose,
}: {
  tx: TransactionItem | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = React.useState<string | null>(null);
  const [downloading, setDownloading] = React.useState(false);

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

  function handleDownloadInvoice() {
    if (!tx) return;
    setDownloading(true);
    try {
      generateInvoicePDF(tx);
      toast.success("Invoice PDF diunduh");
    } catch (e: any) {
      toast.error(e?.message || "Gagal mengunduh invoice");
    } finally {
      setDownloading(false);
    }
  }

  const isQRIS = tx?.payment?.paymentMethod === "QRIS";

  return (
    <Dialog open={!!tx} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-emerald-400" />
            Detail Transaksi
          </DialogTitle>
          <DialogDescription>
            Invoice{" "}
            <span className="font-mono text-foreground">
              {tx?.invoiceNumber}
            </span>
          </DialogDescription>
        </DialogHeader>

        {tx ? (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Invoice" value={tx.invoiceNumber} />
              <Field label="Tipe" value={tx.type} />
              <Field label="Status" value={<StatusBadge status={tx.status} />} />
              <Field
                label="Nominal"
                value={
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(tx.amount, tx.currency)}
                  </span>
                }
              />
              <Field label="Dibuat" value={formatDate(tx.createdAt)} />
              <Field
                label="Dibayar"
                value={formatDate(tx.paidAt)}
              />
              {tx.invoice ? (
                <Field
                  label="Jatuh Tempo"
                  value={formatDate(tx.invoice.dueAt)}
                />
              ) : null}
            </div>

            {tx.payment ? (
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Metode Pembayaran
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      isQRIS
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        : "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                    )}
                  >
                    {isQRIS ? "QRIS" : "Transfer Bank"}
                  </Badge>
                </div>

                {isQRIS ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="rounded-lg border border-border bg-white p-2">
                      { }
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(tx.payment.qrisData || "")}`}
                        alt="QRIS code"
                        width={180}
                        height={180}
                        className="rounded"
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        copyValue(tx.payment?.qrisData || "", "QRIS data")
                      }
                    >
                      {copied === "QRIS data" ? "Tersalin!" : "Salin QRIS Data"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Nomor Virtual Account
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs"
                        onClick={() =>
                          copyValue(tx.payment?.vaNumber || "", "VA Number")
                        }
                      >
                        {copied === "VA Number" ? "Tersalin!" : "Salin"}
                      </Button>
                    </div>
                    <p className="font-mono text-sm font-semibold text-foreground tracking-wider">
                      {tx.payment.vaNumber}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Transfer ke rekening MVMP STORE (BCA / Mandiri / BNI / BRI)
                    </p>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleDownloadInvoice}
            disabled={downloading}
          >
            <FileText className="h-4 w-4" />
            {downloading ? "Memproses…" : "Unduh Invoice PDF"}
          </Button>
          <Button onClick={onClose}>Tutup</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
        {label}
      </span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}
