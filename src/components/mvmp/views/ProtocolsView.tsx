"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Boxes,
  Crown,
  Server as ServerIcon,
  Power,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "../PageHeader";
import { EmptyState, apiFetch, engineColor, statusBadgeClass } from "../lib";
import { cn } from "@/lib/utils";

interface ProtocolItem {
  id: string;
  key: string;
  displayName: string;
  engine: string;
  description?: string | null;
  isEnabled: boolean;
  isPremium: boolean;
  _count?: { serverProtocols: number };
}

export function ProtocolsView() {
  const { data, isLoading } = useQuery<{ items: ProtocolItem[] }>({
    queryKey: ["protocols"],
    queryFn: () => apiFetch("/api/protocols"),
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Protokol VPN"
        description="Daftar semua protokol yang didukung sistem"
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : !items.length ? (
        <Card className="p-6">
          <EmptyState
            icon={Boxes}
            title="Belum ada protokol"
            description="Belum ada protokol yang terdaftar pada sistem."
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((p) => {
            const color = engineColor(p.engine);
            return (
              <Card key={p.id} className="p-6 gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
                        statusBadgeClass(color)
                      )}
                    >
                      <Boxes className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <h3 className="text-sm font-semibold text-foreground truncate">
                        {p.displayName}
                      </h3>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={statusBadgeClass(color)}
                        >
                          {p.engine}
                        </Badge>
                        {p.isPremium ? (
                          <Badge
                            variant="outline"
                            className={statusBadgeClass("amber")}
                          >
                            <Crown className="h-3 w-3" />
                            Premium
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <Switch checked={p.isEnabled} disabled aria-label="enabled" />
                </div>

                {p.description ? (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {p.description}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    Tanpa deskripsi
                  </p>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <ServerIcon className="h-3.5 w-3.5" />
                    Server berjalan
                  </span>
                  <span className="font-semibold text-foreground">
                    {p._count?.serverProtocols ?? 0}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Power className="h-3.5 w-3.5" />
                    Status
                  </span>
                  <Badge
                    variant="outline"
                    className={statusBadgeClass(p.isEnabled ? "emerald" : "zinc")}
                  >
                    {p.isEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
