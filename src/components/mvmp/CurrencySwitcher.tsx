"use client";

// MVMP — Currency switcher (Batch 3 multi-currency)

import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppStore } from "@/lib/store";
import { CURRENCIES, CURRENCY_CODES } from "@/lib/currency";
import { cn } from "@/lib/utils";

export function CurrencySwitcher() {
  const currency = useAppStore((s) => s.currency);
  const setCurrency = useAppStore((s) => s.setCurrency);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9 gap-1.5 px-2.5" aria-label="Mata uang tampilan">
          <Globe className="h-4 w-4" />
          <span className="text-xs font-semibold">{currency}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Mata uang tampilan</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {CURRENCY_CODES.map((code) => {
          const meta = CURRENCIES[code];
          return (
            <DropdownMenuItem
              key={code}
              onClick={() => setCurrency(code)}
              className="flex items-center justify-between gap-2"
            >
              <span className="flex items-center gap-2">
                <span className="w-5 text-center text-sm font-semibold">{meta.symbol}</span>
                <span className="flex flex-col leading-tight">
                  <span className="text-sm">{code}</span>
                  <span className="text-[10px] text-muted-foreground">{meta.label}</span>
                </span>
              </span>
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  currency === code ? "bg-emerald-400" : "bg-transparent"
                )}
              />
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <p className="px-2 pb-1.5 text-[10px] text-muted-foreground">
          Kurs tetap (mock): 1 USD = 15.800 IDR · 1 EUR = 17.200 IDR
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
