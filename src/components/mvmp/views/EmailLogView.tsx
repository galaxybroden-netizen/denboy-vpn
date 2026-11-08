"use client";

// MVMP — Email Log view (Batch 3): history of mock-SMTP notification emails

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Eye,
  Loader2,
  Mail,
  MailCheck,
  Trash2,
  TriangleAlert,
  UserPlus,
  ReceiptText,
  Inbox,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader } from "../PageHeader";
import { StatCard } from "../StatCard";
import { EmptyState, LoadingSkeleton, apiFetch } from "../lib";
import { formatDateTime } from "@/lib/utils-mvmp";

interface EmailLogItem {
  id: string;
  toEmail: string;
  subject: string;
  body: string;
  template: string;
  status: string;
  createdAt: string;
}

interface EmailLogsData {
  logs: EmailLogItem[];
  total: number;
  stats: Record<string, number>;
}

const TEMPLATE_META: Record<string, { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  WELCOME_ACCOUNT: { label: "Selamat Datang", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30", icon: UserPlus },
  PAYMENT_RECEIPT: { label: "Kwitansi", cls: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30", icon: ReceiptText },
  EXPIRY_WARNING: { label: "Peringatan Kedaluwarsa", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30", icon: TriangleAlert },
  GENERIC: { label: "Umum", cls: "bg-muted text-muted-foreground border-border", icon: Mail },
};

export function EmailLogView() {
  const qc = useQueryClient();
  const [selected, setSelected] = React.useState<EmailLogItem | null>(null);
  const [deleteItem, setDeleteItem] = React.useState<EmailLogItem | null>(null);
  const [busy, setBusy] = React.useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery<EmailLogsData>({
    queryKey: ["email-logs"],
    queryFn: () => apiFetch("/api/email-logs"),
    refetchInterval: 60_000,
  });

  const logs = data?.logs ?? [];
  const stats = data?.stats ?? {};

  async function confirmDelete() {
    if (!deleteItem) return;
    setBusy(true);
    try {
      await apiFetch(`/api/email-logs/${deleteItem.id}`, { method: "DELETE" });
      toast.success("Log email dihapus");
      setDeleteItem(null);
      qc.invalidateQueries({ queryKey: ["email-logs"] });
    } catch (e: any) {
      toast.error(e?.message || "Gagal menghapus log email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Log Email"
        description="Riwayat email notifikasi yang dikirim sistem (mock SMTP — produksi: Resend/Mailgun/SES)."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
            <MailCheck className="h-4 w-4" />
            Segarkan
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Email" value={data?.total ?? 0} icon={Mail} accent="emerald" />
        <StatCard
          title="Selamat Datang"
          value={stats["WELCOME_ACCOUNT"] ?? 0}
          icon={UserPlus}
          accent="cyan"
          sublabel="Akun VPN baru dibuat"
        />
        <StatCard
          title="Kwitansi"
          value={stats["PAYMENT_RECEIPT"] ?? 0}
          icon={ReceiptText}
          accent="emerald"
          sublabel="Pembayaran disetujui"
        />
        <StatCard
          title="Peringatan Kedaluwarsa"
          value={stats["EXPIRY_WARNING"] ?? 0}
          icon={TriangleAlert}
          accent="amber"
          sublabel="Langganan ≤ 3 hari"
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Email Terkirim (100 terakhir)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingSkeleton />
          ) : logs.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Belum ada email terkirim"
              description="Email akan muncul di sini saat akun dibuat, pembayaran disetujui, atau langganan mendekati kedaluwarsa."
            />
          ) : (
            <div className="max-h-[560px] overflow-y-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="w-36">Waktu</TableHead>
                    <TableHead>Penerima</TableHead>
                    <TableHead className="w-44">Template</TableHead>
                    <TableHead>Subjek</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="w-24 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const meta = TEMPLATE_META[log.template] || TEMPLATE_META.GENERIC;
                    const Icon = meta.icon;
                    return (
                      <TableRow
                        key={log.id}
                        className="cursor-pointer"
                        onClick={() => setSelected(log)}
                      >
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(log.createdAt)}
                        </TableCell>
                        <TableCell className="text-xs font-medium truncate max-w-48">
                          {log.toEmail}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`gap-1 ${meta.cls}`}>
                            <Icon className="h-3 w-3" />
                            {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs truncate max-w-72">
                          {log.subject}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              log.status === "SENT"
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30"
                            }
                          >
                            {log.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelected(log);
                                  }}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Lihat isi email</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-rose-500 hover:text-rose-400 hover:bg-rose-500/10"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteItem(log);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Hapus log</TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base pr-6">{selected?.subject}</DialogTitle>
            <DialogDescription>
              Kepada <span className="font-medium text-foreground">{selected?.toEmail}</span> ·{" "}
              {selected ? formatDateTime(selected.createdAt) : ""}
            </DialogDescription>
          </DialogHeader>
          <pre className="whitespace-pre-wrap rounded-md bg-muted p-4 text-xs font-mono leading-relaxed max-h-80 overflow-y-auto">
            {selected?.body}
          </pre>
        </DialogContent>
      </Dialog>

      {/* Delete email log confirmation */}
      <AlertDialog
        open={!!deleteItem}
        onOpenChange={(v) => !v && !busy && setDeleteItem(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus log email ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Log "{deleteItem?.subject}" ke {deleteItem?.toEmail} akan
              dihapus permanen dari riwayat outbox.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="bg-rose-600 hover:bg-rose-700"
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
