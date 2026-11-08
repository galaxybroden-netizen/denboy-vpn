"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Check,
  Clock,
  CreditCard,
  Eye,
  Loader2,
  Receipt,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
import { PageHeader } from "../PageHeader";
import { StatusBadge } from "../StatusBadge";
import { EmptyState, apiFetch, statusBadgeClass } from "../lib";
import { formatCurrency, formatDateTime } from "@/lib/utils-mvmp";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface PaymentItem {
  id: string;
  provider: string;
  paymentMethod: string;
  amount: number;
  currency: string;
  status: string;
  paidAt?: string | null;
  createdAt: string;
  vaNumber?: string | null;
  qrisData?: string | null;
  transaction?: {
    id: string;
    invoiceNumber: string;
    amount: number;
    currency: string;
    status: string;
    customer?: { id: string; name: string; customerCode: string };
  };
  manualProofs?: any[];
}

export function PaymentsView() {
  const qc = useQueryClient();
  const [status, setStatus] = React.useState("REVIEW_REQUIRED");
  const [approveId, setApproveId] = React.useState<string | null>(null);
  const [rejectId, setRejectId] = React.useState<string | null>(null);
  const [detailId, setDetailId] = React.useState<string | null>(null);

  const params = new URLSearchParams({ page: "1", limit: "50" });
  if (status !== "all") params.set("status", status);

  const { data, isLoading } = useQuery<{
    items: PaymentItem[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>({
    queryKey: ["payments", status],
    queryFn: () => apiFetch(`/api/payments?${params.toString()}`),
  });

  const items = data?.items ?? [];
  const needReview = items.filter((p) => p.status === "REVIEW_REQUIRED");
  const history = items.filter((p) => p.status !== "REVIEW_REQUIRED");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pembayaran"
        description="Verifikasi pembayaran manual"
        actions={
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="REVIEW_REQUIRED">Perlu Verifikasi</SelectItem>
              <SelectItem value="all">Semua</SelectItem>
              <SelectItem value="PAID">Lunas</SelectItem>
              <SelectItem value="PENDING">Menunggu</SelectItem>
              <SelectItem value="CANCELLED">Dibatalkan</SelectItem>
              <SelectItem value="EXPIRED">Kedaluwarsa</SelectItem>
              <SelectItem value="FAILED">Gagal</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {/* Section 1: Perlu Verifikasi */}
      <Card className="p-6 gap-4 border-amber-500/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-400" />
            <h2 className="text-sm font-semibold text-foreground">
              Perlu Verifikasi
            </h2>
            <Badge
              variant="outline"
              className={statusBadgeClass("amber")}
            >
              {needReview.length}
            </Badge>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : !needReview.length ? (
          <EmptyState
            icon={Check}
            title="Tidak ada pembayaran menunggu verifikasi"
            description="Semua pembayaran manual telah diproses."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {needReview.map((p) => (
              <ReviewCard
                key={p.id}
                payment={p}
                onApprove={() => setApproveId(p.id)}
                onReject={() => setRejectId(p.id)}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Section 2: Riwayat Pembayaran */}
      <Card className="p-0 gap-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-border/60">
          <h2 className="text-sm font-semibold text-foreground">
            Riwayat Pembayaran
          </h2>
        </div>
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !history.length ? (
          <EmptyState
            icon={CreditCard}
            title="Belum ada riwayat"
            description="Belum ada pembayaran yang diproses."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Pelanggan</TableHead>
                <TableHead>Nominal</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Metode</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Dikirim</TableHead>
                <TableHead>Reviewer</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">
                    {p.transaction?.invoiceNumber}
                  </TableCell>
                  <TableCell className="text-sm">
                    {p.transaction?.customer?.name || "-"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatCurrency(p.amount, p.currency)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={statusBadgeClass(
                        p.provider === "QRIS" ? "cyan" : "blue"
                      )}
                    >
                      {p.provider}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {p.paymentMethod}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={p.status} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTime(p.createdAt)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {p.manualProofs?.find((mp: any) => mp.reviewedBy)?.reviewedBy || "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => setDetailId(p.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Lihat detail pembayaran</TooltipContent>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <ApproveDialog
        id={approveId}
        onClose={() => setApproveId(null)}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["payments"] });
          qc.invalidateQueries({ queryKey: ["dashboard"] });
        }}
      />
      <RejectDialog
        id={rejectId}
        onClose={() => setRejectId(null)}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["payments"] });
          qc.invalidateQueries({ queryKey: ["dashboard"] });
        }}
      />

      <PaymentDetailDialog id={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// PaymentDetailDialog — read-only detail of a payment (history table)
// ---------------------------------------------------------------------------

function PaymentDetailDialog({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery<PaymentItem>({
    queryKey: ["payment-detail", id],
    queryFn: () => apiFetch(`/api/payments/${id}`),
    enabled: !!id,
  });

  return (
    <Dialog open={!!id} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-emerald-400" />
            Detail Pembayaran
          </DialogTitle>
          <DialogDescription>
            {data?.transaction?.invoiceNumber || "-"} ·{" "}
            {data?.transaction?.customer?.name || "-"}
          </DialogDescription>
        </DialogHeader>
        {isLoading || !data ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <Row label="Invoice" value={data.transaction?.invoiceNumber} />
            <Row
              label="Pelanggan"
              value={
                data.transaction?.customer?.name
                  ? `${data.transaction.customer.name} (${data.transaction.customer.customerCode})`
                  : "-"
              }
            />
            <Row
              label="Nominal"
              value={formatCurrency(data.amount, data.currency)}
            />
            <Row
              label="Provider / Metode"
              value={`${data.provider} · ${data.paymentMethod}`}
            />
            <Row label="Status" value={<StatusBadge status={data.status} />} />
            <Row
              label="VA / QRIS"
              value={data.vaNumber || data.qrisData || "-"}
            />
            <Row
              label="Dikirim"
              value={formatDateTime(data.createdAt)}
            />
            <Row
              label="Dibayar"
              value={data.paidAt ? formatDateTime(data.paidAt) : "-"}
            />
            {data.manualProofs?.length ? (
              <Row
                label="Bukti Manual"
                value={data.manualProofs
                  .map((mp: any) => mp.fileName || mp.fileReference)
                  .join(", ")}
              />
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReviewCard({
  payment,
  onApprove,
  onReject,
}: {
  payment: PaymentItem;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.03] p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-amber-400" />
            <span className="font-mono text-xs text-foreground truncate">
              {payment.transaction?.invoiceNumber}
            </span>
          </div>
          <p className="text-sm font-medium text-foreground">
            {payment.transaction?.customer?.name}
          </p>
        </div>
        <span className="text-sm font-semibold text-foreground">
          {formatCurrency(payment.amount, payment.currency)}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <CreditCard className="h-3 w-3" />
          {payment.provider} · {payment.paymentMethod}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatDateTime(payment.createdAt)}
        </span>
      </div>

      {payment.manualProofs?.length ? (
        <div className="rounded-md bg-muted/30 px-2 py-1.5 text-xs">
          <span className="text-muted-foreground">Bukti: </span>
          <span className="font-mono text-foreground">
            {payment.manualProofs[0].fileName || payment.manualProofs[0].fileReference}
          </span>
        </div>
      ) : null}

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          className="flex-1"
          onClick={onApprove}
        >
          <Check className="h-4 w-4" />
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 hover:bg-rose-500/10 hover:text-rose-400"
          onClick={onReject}
        >
          <X className="h-4 w-4" />
          Reject
        </Button>
      </div>
    </div>
  );
}

function ApproveDialog({
  id,
  onClose,
  onDone,
}: {
  id: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { data, isLoading } = useQuery<PaymentItem>({
    queryKey: ["payment-approve", id],
    queryFn: () => apiFetch(`/api/payments?limit=50`).then((d: any) => {
      const item = d.items.find((p: any) => p.id === id);
      if (!item) throw new Error("Pembayaran tidak ditemukan");
      return item;
    }),
    enabled: !!id,
  });
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    if (!id) return;
    setBusy(true);
    try {
      await apiFetch(`/api/payments/${id}/approve`, { method: "POST" });
      toast.success("Pembayaran disetujui");
      onDone();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Gagal menyetujui pembayaran");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!id} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-400" />
            Setujui Pembayaran
          </DialogTitle>
          <DialogDescription>
            Pastikan bukti pembayaran valid sebelum menyetujui.
          </DialogDescription>
        </DialogHeader>
        {isLoading || !data ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="space-y-2 text-sm">
            <Row label="Invoice" value={data.transaction?.invoiceNumber} />
            <Row label="Pelanggan" value={data.transaction?.customer?.name} />
            <Row
              label="Nominal"
              value={formatCurrency(data.amount, data.currency)}
            />
            <Row label="Metode" value={`${data.provider} · ${data.paymentMethod}`} />
            {data.manualProofs?.[0] ? (
              <Row
                label="Bukti"
                value={data.manualProofs[0].fileName || data.manualProofs[0].fileReference}
              />
            ) : null}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Setujui
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({
  id,
  onClose,
  onDone,
}: {
  id: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { data, isLoading } = useQuery<PaymentItem>({
    queryKey: ["payment-reject", id],
    queryFn: () => apiFetch(`/api/payments?limit=50`).then((d: any) => {
      const item = d.items.find((p: any) => p.id === id);
      if (!item) throw new Error("Pembayaran tidak ditemukan");
      return item;
    }),
    enabled: !!id,
  });
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    if (!id) return;
    setBusy(true);
    try {
      await apiFetch(`/api/payments/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      toast.success("Pembayaran ditolak");
      onDone();
      onClose();
      setReason("");
    } catch (e: any) {
      toast.error(e?.message || "Gagal menolak pembayaran");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!id} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <X className="h-4 w-4 text-rose-400" />
            Tolak Pembayaran
          </DialogTitle>
          <DialogDescription>
            Pembayaran akan ditandai sebagai dibatalkan.
          </DialogDescription>
        </DialogHeader>
        {isLoading || !data ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="space-y-3">
            <div className="space-y-2 text-sm">
              <Row label="Invoice" value={data.transaction?.invoiceNumber} />
              <Row label="Pelanggan" value={data.transaction?.customer?.name} />
              <Row
                label="Nominal"
                value={formatCurrency(data.amount, data.currency)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Alasan Penolakan
              </Label>
              <Textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Contoh: Nominal tidak sesuai, bukti tidak valid…"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={busy}
            className={cn(busy && "opacity-80")}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Tolak Pembayaran
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value || "-"}</span>
    </div>
  );
}
