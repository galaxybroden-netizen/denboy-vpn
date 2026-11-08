"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Percent,
  Receipt,
} from "lucide-react";
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
import { PageHeader } from "../../PageHeader";
import { StatCard } from "../../StatCard";
import { StatusBadge } from "../../StatusBadge";
import { EmptyState, apiFetch } from "../../lib";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils-mvmp";

interface CommissionItem {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
  paidAt?: string | null;
  transaction?: {
    invoiceNumber: string;
    status: string;
    amount: number;
    customer?: { id: string; name: string; customerCode: string } | null;
  } | null;
}

interface CommissionResponse {
  items: CommissionItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  totalEarned: number;
}

const STATUS_FILTERS = [
  { value: "ALL", label: "Semua Status" },
  { value: "PAID", label: "Lunas" },
  { value: "PENDING", label: "Pending" },
];

export function ResellerCommissions() {
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState("ALL");

  const params = new URLSearchParams({ page: String(page), limit: "20" });
  if (status !== "ALL") params.set("status", status);

  const { data, isLoading } = useQuery<CommissionResponse>({
    queryKey: ["reseller-commissions", page, status],
    queryFn: () =>
      apiFetch(`/api/portal/reseller/commissions?${params.toString()}`),
  });

  const items = data?.items ?? [];
  const pagination = data?.pagination;
  const totalEarned = data?.totalEarned ?? 0;
  const pendingTotal = items
    .filter((i) => i.status === "PENDING")
    .reduce((sum, i) => sum + i.amount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Komisi"
        description="Komisi yang Anda peroleh dari transaksi pelanggan"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          title="Total Komisi"
          value={formatCurrency(totalEarned)}
          icon={Percent}
          accent="emerald"
          sublabel="Seluruh komisi yang diperoleh"
        />
        <StatCard
          title="Komisi Pending"
          value={formatCurrency(pendingTotal)}
          icon={Receipt}
          accent="amber"
          sublabel="Menunggu pembayaran pelanggan"
        />
      </div>

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
            icon={Percent}
            title="Belum ada komisi"
            description="Komisi akan muncul saat pelanggan Anda melakukan transaksi berbayar."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Pelanggan</TableHead>
                  <TableHead>Nominal Komisi</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Dibayar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(c.createdAt)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {c.transaction?.invoiceNumber || "-"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {c.transaction?.customer?.name || "-"}
                    </TableCell>
                    <TableCell className="text-sm font-semibold tabular-nums text-emerald-400">
                      +{formatCurrency(c.amount)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(c.paidAt)}
                    </TableCell>
                  </TableRow>
                ))}
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
