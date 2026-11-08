"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Loader2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  transaction?: {
    invoiceNumber: string;
    status: string;
    amount: number;
  } | null;
}

interface LedgerResponse {
  items: LedgerItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  currentBalance: number;
}

function entryTypeBadge(entryType: string) {
  switch (entryType) {
    case "CREDIT":
      return { label: "Kredit (Masuk)", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" };
    case "DEBIT":
      return { label: "Debit (Keluar)", className: "bg-rose-500/10 text-rose-400 border-rose-500/30" };
    case "CREDIT_PENDING":
      return { label: "Kredit Pending", className: "bg-amber-500/10 text-amber-400 border-amber-500/30" };
    default:
      return { label: entryType, className: "bg-muted text-muted-foreground" };
  }
}

export function ResellerLedger() {
  const [page, setPage] = React.useState(1);

  const params = new URLSearchParams({ page: String(page), limit: "25" });
  const { data, isLoading } = useQuery<LedgerResponse>({
    queryKey: ["reseller-ledger", page],
    queryFn: () => apiFetch(`/api/portal/reseller/ledger?${params.toString()}`),
  });

  const items = data?.items ?? [];
  const pagination = data?.pagination;
  const balance = data?.currentBalance ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ledger Saldo"
        description="Riwayat transaksi saldo reseller"
      />

      {/* Balance card */}
      <Card className="p-6 gap-0 bg-gradient-to-br from-emerald-500/10 via-card to-card border-emerald-500/20">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Saldo Saat Ini
            </p>
            <p className="text-3xl font-bold text-foreground tabular-nums">
              {formatCurrency(balance)}
            </p>
            <p className="text-xs text-muted-foreground">
              Saldo yang dapat digunakan untuk membuat akun VPN pelanggan
            </p>
          </div>
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30">
            <Wallet className="h-7 w-7 text-emerald-400" />
          </div>
        </div>
      </Card>

      <Card className="p-0 gap-0 overflow-hidden">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="Belum ada ledger"
            description="Riwayat transaksi saldo akan muncul di sini."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Nominal</TableHead>
                  <TableHead>Saldo Setelah</TableHead>
                  <TableHead>Referensi</TableHead>
                  <TableHead>Keterangan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((l) => {
                  const badge = entryTypeBadge(l.entryType);
                  const isDebit = l.entryType === "DEBIT";
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(l.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn("text-[10px]", badge.className)}
                        >
                          {badge.label}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-sm font-semibold tabular-nums",
                          isDebit ? "text-rose-400" : "text-emerald-400"
                        )}
                      >
                        {isDebit ? "-" : "+"}
                        {formatCurrency(l.amount)}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums text-foreground">
                        {formatCurrency(l.balanceAfter)}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {l.transaction?.invoiceNumber || l.reference || "-"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                        {l.description}
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
            {pagination.total} entri · halaman {pagination.page} /{" "}
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
    </div>
  );
}
