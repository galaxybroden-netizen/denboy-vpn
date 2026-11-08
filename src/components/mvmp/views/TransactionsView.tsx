"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Loader2,
  Receipt,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "../PageHeader";
import { StatusBadge } from "../StatusBadge";
import { EmptyState, apiFetch } from "../lib";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
} from "@/lib/utils-mvmp";
import { generateInvoicePDF } from "@/lib/pdf";

interface TransactionItem {
  id: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  status: string;
  type?: string;
  createdAt: string;
  paidAt?: string | null;
  customer?: {
    id: string;
    name: string;
    customerCode: string;
    email: string;
  };
  reseller?: {
    id: string;
    resellerCode: string;
    user?: { name?: string };
  } | null;
  payments?: any[];
}

const STATUSES = [
  { value: "all", label: "Semua Status" },
  { value: "PAID", label: "Lunas" },
  { value: "PENDING", label: "Menunggu" },
  { value: "EXPIRED", label: "Kedaluwarsa" },
  { value: "REVIEW_REQUIRED", label: "Perlu Review" },
  { value: "CANCELLED", label: "Dibatalkan" },
  { value: "REFUNDED", label: "Dikembalikan" },
];

export function TransactionsView() {
  const qc = useQueryClient();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [cancelItem, setCancelItem] = React.useState<TransactionItem | null>(null);
  const [cancelBusy, setCancelBusy] = React.useState(false);

  async function confirmCancel() {
    if (!cancelItem) return;
    setCancelBusy(true);
    try {
      await apiFetch(`/api/transactions/${cancelItem.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "cancel" }),
      });
      toast.success(`Invoice ${cancelItem.invoiceNumber} dibatalkan`);
      setCancelItem(null);
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e: any) {
      toast.error(e?.message || "Gagal membatalkan transaksi");
    } finally {
      setCancelBusy(false);
    }
  }

  const debounced = useDebounce(search, 400);

  const params = new URLSearchParams({ page: String(page), limit: "15" });
  if (debounced) params.set("search", debounced);
  if (status !== "all") params.set("status", status);
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);

  const { data, isLoading } = useQuery<{
    items: TransactionItem[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>({
    queryKey: ["transactions", page, debounced, status, startDate, endDate],
    queryFn: () => apiFetch(`/api/transactions?${params.toString()}`),
  });

  const items = data?.items ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transaksi"
        description="Riwayat transaksi pelanggan"
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Cari invoice…"
            className="pl-9"
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Dari Tanggal</Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Sampai Tanggal</Label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <Card className="p-0 gap-0 overflow-hidden">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !items.length ? (
          <EmptyState
            icon={Receipt}
            title="Belum ada transaksi"
            description="Coba ubah filter atau tunggu pelanggan membuat transaksi baru."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Pelanggan</TableHead>
                <TableHead>Reseller</TableHead>
                <TableHead>Nominal</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Metode</TableHead>
                <TableHead>Dibuat</TableHead>
                <TableHead>Lunas Pada</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((t) => {
                const method = t.payments?.[0]?.paymentMethod || "-";
                return (
                  <TableRow
                    key={t.id}
                    className="cursor-pointer"
                    onClick={() => setDetailId(t.id)}
                  >
                    <TableCell className="font-mono text-xs">
                      {t.invoiceNumber}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">
                          {t.customer?.name || "-"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t.customer?.customerCode}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {t.reseller?.user?.name || t.reseller?.resellerCode || "-"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatCurrency(t.amount, t.currency)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={t.status} />
                    </TableCell>
                    <TableCell className="text-xs">{method}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(t.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(t.paidAt)}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => setDetailId(t.id)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Lihat detail</TooltipContent>
                        </Tooltip>
                        {t.status === "PENDING" ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-rose-500 hover:text-rose-400 hover:bg-rose-500/10"
                                onClick={() => setCancelItem(t)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Batalkan invoice</TooltipContent>
                          </Tooltip>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
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

      <TransactionDetailDialog id={detailId} onClose={() => setDetailId(null)} />

      {/* Cancel PENDING transaction confirmation */}
      <AlertDialog
        open={!!cancelItem}
        onOpenChange={(v) => !v && !cancelBusy && setCancelItem(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Batalkan invoice {cancelItem?.invoiceNumber}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Transaksi berstatus PENDING akan ditandai CANCELLED. Tindakan
              ini tidak dapat dibatalkan — hanya berlaku untuk invoice yang
              belum dibayar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelBusy}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelBusy}
              className="bg-rose-600 hover:bg-rose-700"
              onClick={(e) => {
                e.preventDefault();
                confirmCancel();
              }}
            >
              {cancelBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Batalkan Invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TransactionDetailDialog({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const [downloading, setDownloading] = React.useState(false);
  const { data, isLoading } = useQuery<any>({
    queryKey: ["transaction", id],
    queryFn: () => apiFetch(`/api/transactions/${id}`),
    enabled: !!id,
  });

  function handleDownloadInvoice() {
    if (!data) return;
    setDownloading(true);
    try {
      generateInvoicePDF(data, {
        customer: data.customer,
        package: data.subscription?.package,
        reseller: data.reseller,
      });
      toast.success("Invoice PDF diunduh");
    } catch (e: any) {
      toast.error(e?.message || "Gagal mengunduh invoice");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Dialog open={!!id} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-emerald-400" />
            {data?.invoiceNumber || "Detail Transaksi"}
          </DialogTitle>
          <DialogDescription>
            {data?.customer?.name} · {data?.customer?.email}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field
                label="Nominal"
                value={formatCurrency(data.amount, data.currency)}
              />
              <Field
                label="Status"
                value={<StatusBadge status={data.status} />}
              />
              <Field
                label="Reseller"
                value={
                  data.reseller?.user?.name ||
                  data.reseller?.resellerCode ||
                  "Langsung"
                }
              />
              <Field label="Tipe" value={data.type || "PURCHASE"} />
              <Field
                label="Dibuat"
                value={formatDateTime(data.createdAt)}
              />
              <Field
                label="Lunas"
                value={data.paidAt ? formatDateTime(data.paidAt) : "-"}
              />
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-foreground">
                Pembayaran
              </h4>
              {!data.payments?.length ? (
                <p className="text-xs text-muted-foreground">
                  Belum ada pembayaran.
                </p>
              ) : (
                <Card className="p-0 gap-0 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Provider</TableHead>
                        <TableHead>Metode</TableHead>
                        <TableHead>Nominal</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Tanggal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.payments.map((p: any) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-xs">{p.provider}</TableCell>
                          <TableCell className="text-xs">
                            {p.paymentMethod}
                          </TableCell>
                          <TableCell className="text-xs">
                            {formatCurrency(p.amount, p.currency)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={p.status} />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateTime(p.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              )}
            </div>

            {data.payments?.some((p: any) => p.manualProofs?.length) ? (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground">
                  Bukti Pembayaran Manual
                </h4>
                <div className="rounded-lg border border-border/60 divide-y divide-border/60">
                  {data.payments
                    .flatMap((p: any) =>
                      (p.manualProofs || []).map((mp: any) => ({
                        ...mp,
                        paymentMethod: p.paymentMethod,
                      }))
                    )
                    .map((mp: any) => (
                      <div
                        key={mp.id}
                        className="flex items-center justify-between px-3 py-2 text-xs"
                      >
                        <span className="font-mono text-foreground">
                          {mp.fileName || mp.fileReference}
                        </span>
                        <div className="flex items-center gap-2">
                          <StatusBadge
                            status={
                              mp.reviewStatus === "PENDING"
                                ? "PENDING"
                                : mp.reviewStatus === "APPROVED"
                                ? "PAID"
                                : "REVOKED"
                            }
                            label={mp.reviewStatus}
                          />
                          <span className="text-muted-foreground">
                            {formatDateTime(mp.submittedAt)}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ) : null}

            {data.commissions?.length ? (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground">
                  Komisi Reseller
                </h4>
                <div className="rounded-lg border border-border/60 divide-y divide-border/60">
                  {data.commissions.map((c: any) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between px-3 py-2 text-xs"
                    >
                      <span className="text-foreground">
                        {c.reseller?.user?.name ||
                          c.reseller?.resellerCode}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {formatCurrency(c.amount)}
                        </span>
                        <StatusBadge status={c.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {!isLoading && data ? (
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={handleDownloadInvoice}
              disabled={downloading}
            >
              <FileText className="h-4 w-4" />
              {downloading ? "Memproses…" : "Unduh Invoice PDF"}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Tutup
            </Button>
          </DialogFooter>
        ) : null}
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
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function useDebounce<T>(v: T, d: number): T {
  const [s, setS] = React.useState(v);
  React.useEffect(() => {
    const t = setTimeout(() => setS(v), d);
    return () => clearTimeout(t);
  }, [v, d]);
  return s;
}
