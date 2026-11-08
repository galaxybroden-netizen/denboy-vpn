"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  Copy,
  Key,
  KeyRound,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, apiFetch, statusBadgeClass } from "./lib";
import { formatDate, timeAgo } from "@/lib/utils-mvmp";
import { cn } from "@/lib/utils";

const SCOPE_OPTIONS = [
  "servers:read",
  "vpn-accounts:read",
  "vpn-accounts:write",
  "customers:read",
  "transactions:read",
  "monitoring:read",
];

interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export function ApiKeysManager() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ items: ApiKeyRow[] }>({
    queryKey: ["api-keys"],
    queryFn: () => apiFetch("/api/api-keys"),
  });

  const items = data?.items ?? [];

  const [createOpen, setCreateOpen] = React.useState(false);
  const [createdKey, setCreatedKey] = React.useState<string | null>(null);
  const [createdName, setCreatedName] = React.useState<string>("");
  const [revokeTarget, setRevokeTarget] = React.useState<ApiKeyRow | null>(
    null
  );
  const [revoking, setRevoking] = React.useState(false);

  async function handleRevoke() {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await apiFetch(`/api/api-keys/${revokeTarget.id}`, { method: "DELETE" });
      toast.success("API key dicabut");
      setRevokeTarget(null);
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    } catch (e: any) {
      toast.error(e?.message || "Gagal mencabut API key");
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-6 gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-foreground">
                API Keys
              </h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Kelola kunci API untuk integrasi eksternal
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Buat API Key
          </Button>
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 text-xs text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            API key hanya ditampilkan satu kali saat dibuat. Simpan dengan
            aman.
          </span>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !items.length ? (
          <EmptyState
            icon={KeyRound}
            title="Belum ada API key"
            description="Buat satu untuk mulai integrasi."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Key Prefix</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Dibuat</TableHead>
                  <TableHead>Kedaluwarsa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((k) => {
                  const expired =
                    k.expiresAt && new Date(k.expiresAt) < new Date();
                  return (
                    <TableRow key={k.id}>
                      <TableCell className="font-medium text-foreground">
                        {k.name}
                      </TableCell>
                      <TableCell>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
                          {k.keyPrefix}
                        </code>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[240px]">
                          {k.scopes.length ? (
                            k.scopes.map((s) => (
                              <Badge
                                key={s}
                                variant="outline"
                                className="text-[10px] font-mono"
                              >
                                {s}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              -
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {k.lastUsedAt ? timeAgo(k.lastUsedAt) : "-"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(k.createdAt)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {k.expiresAt ? formatDate(k.expiresAt) : "Tidak ada"}
                      </TableCell>
                      <TableCell>
                        {expired ? (
                          <Badge
                            variant="outline"
                            className={statusBadgeClass("zinc")}
                          >
                            Expired
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className={statusBadgeClass("emerald")}
                          >
                            Active
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                          onClick={() => setRevokeTarget(k)}
                          aria-label={`Cabut ${k.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Create dialog */}
      <CreateApiKeyDialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) {
            // If we just created a key (createdKey set), switch to success dialog
            // handled separately below
          }
        }}
        onCreated={(fullKey, name) => {
          setCreatedKey(fullKey);
          setCreatedName(name);
          setCreateOpen(false);
          qc.invalidateQueries({ queryKey: ["api-keys"] });
        }}
      />

      {/* Success dialog showing the full key once */}
      <SuccessDialog
        open={!!createdKey}
        fullKey={createdKey}
        name={createdName}
        onClose={() => {
          setCreatedKey(null);
          setCreatedName("");
        }}
      />

      {/* Revoke confirmation */}
      <AlertDialog
        open={!!revokeTarget}
        onOpenChange={(o) => {
          if (!o) setRevokeTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cabut API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              API key{" "}
              <span className="font-medium text-foreground">
                {revokeTarget?.name}
              </span>{" "}
              ({revokeTarget?.keyPrefix}) akan dicabut permanen dan tidak dapat
              digunakan kembali. Aksi ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              disabled={revoking}
              className="bg-rose-500 text-white hover:bg-rose-600 focus-visible:ring-rose-500/40"
            >
              {revoking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Cabut
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create dialog
// ---------------------------------------------------------------------------

function CreateApiKeyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (fullKey: string, name: string) => void;
}) {
  const [name, setName] = React.useState("");
  const [scopes, setScopes] = React.useState<string[]>([]);
  const [expiry, setExpiry] = React.useState("never");
  const [submitting, setSubmitting] = React.useState(false);

  function toggleScope(s: string) {
    setScopes((cur) =>
      cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Nama harus diisi");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch<{
        fullKey: string;
        name: string;
      }>("/api/api-keys", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          scopes,
          expiresAt: expiry,
        }),
      });
      toast.success("API key dibuat");
      onCreated(res.fullKey, res.name);
      // reset form
      setName("");
      setScopes([]);
      setExpiry("never");
    } catch (e: any) {
      toast.error(e?.message || "Gagal membuat API key");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setName("");
          setScopes([]);
          setExpiry("never");
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Buat API Key Baru</DialogTitle>
          <DialogDescription>
            Kunci akan ditampilkan satu kali setelah dibuat.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="api-key-name" className="text-xs text-muted-foreground">
              Nama
            </Label>
            <Input
              id="api-key-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mis. Integrasi WHMCS"
              maxLength={100}
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Scopes</Label>
            <div className="grid grid-cols-1 gap-2 rounded-lg border border-border/60 p-3">
              {SCOPE_OPTIONS.map((s) => (
                <label
                  key={s}
                  className="flex items-center gap-2 cursor-pointer text-sm"
                >
                  <Checkbox
                    checked={scopes.includes(s)}
                    onCheckedChange={() => toggleScope(s)}
                  />
                  <span className="font-mono text-xs text-foreground">{s}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Kedaluwarsa</Label>
            <RadioGroup
              value={expiry}
              onValueChange={setExpiry}
              className="grid grid-cols-2 gap-2"
            >
              {[
                { value: "never", label: "Tidak ada kedaluwarsa" },
                { value: "30d", label: "30 hari" },
                { value: "90d", label: "90 hari" },
                { value: "1y", label: "1 tahun" },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={cn(
                    "flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm cursor-pointer transition-colors",
                    expiry === opt.value
                      ? "border-emerald-500/40 bg-emerald-500/[0.06] text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <RadioGroupItem value={opt.value} />
                  <span>{opt.label}</span>
                </label>
              ))}
            </RadioGroup>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Batal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Buat
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Success dialog (show full key once)
// ---------------------------------------------------------------------------

function SuccessDialog({
  open,
  fullKey,
  name,
  onClose,
}: {
  open: boolean;
  fullKey: string | null;
  name: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = React.useState(false);

  async function copyKey() {
    if (!fullKey) return;
    try {
      await navigator.clipboard.writeText(fullKey);
      setCopied(true);
      toast.success("Key disalin ke clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Gagal menyalin. Salin manual.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-emerald-400" />
            API Key Dibuat
          </DialogTitle>
          <DialogDescription>
            Key untuk{" "}
            <span className="font-medium text-foreground">{name}</span>{" "}
            berhasil dibuat.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 text-xs text-amber-300 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Simpan key ini dengan aman. Anda tidak akan melihatnya lagi.
          </span>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">API Key</Label>
          <div className="flex items-stretch gap-2">
            <code className="flex-1 min-w-0 truncate rounded-md border border-border bg-muted px-3 py-2 text-xs font-mono text-foreground">
              {fullKey}
            </code>
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={copyKey}
              aria-label="Salin key"
            >
              {copied ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Tutup</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
