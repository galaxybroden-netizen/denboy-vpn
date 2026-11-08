"use client";

// MVMP — Branding & General Settings
// Manages SystemSetting entries: app identity, company info, theme colors, regional prefs.
// Reads via GET /api/settings/system (excludes sensitive), saves via PATCH (bulk).

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Check,
  Globe,
  Image as ImageIcon,
  Loader2,
  Palette,
  Save,
  Settings as SettingsIcon,
  Upload,
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
import { apiFetch } from "../../lib";

interface SettingItem {
  key: string;
  value: any; // parsed JSON
  category: string;
  isSensitive: boolean;
}

const CATEGORIES = [
  { value: "branding", label: "Identitas Aplikasi", icon: ImageIcon },
  { value: "company", label: "Informasi Perusahaan", icon: Building2 },
  { value: "general", label: "Pengaturan Umum & Regional", icon: Globe },
  { value: "portal", label: "Branding Portal Pelanggan", icon: Palette },
];

export function BrandingSettings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ items: SettingItem[] }>({
    queryKey: ["system-settings"],
    queryFn: () => apiFetch("/api/settings/system"),
  });

  // Local draft state — map of key → value
  const [draft, setDraft] = React.useState<Record<string, any>>({});
  const [hasChanges, setHasChanges] = React.useState(false);

  // Sync draft from server data when it loads
  React.useEffect(() => {
    if (data?.items) {
      const map: Record<string, any> = {};
      for (const item of data.items) {
        map[item.key] = item.value;
      }
      setDraft(map);
      setHasChanges(false);
    }
  }, [data]);

  function updateField(key: string, value: any) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  }

  const saveMut = useMutation({
    mutationFn: () => {
      // Find changed keys
      const changes: Array<{ key: string; value: any }> = [];
      for (const item of data?.items || []) {
        if (draft[item.key] !== item.value) {
          changes.push({ key: item.key, value: draft[item.key] });
        }
      }
      return apiFetch("/api/settings/system", {
        method: "PATCH",
        body: JSON.stringify({ settings: changes }),
      });
    },
    onSuccess: () => {
      toast.success("Pengaturan berhasil disimpan");
      setHasChanges(false);
      qc.invalidateQueries({ queryKey: ["system-settings"] });
    },
    onError: (e: any) => toast.error(e?.message || "Gagal menyimpan pengaturan"),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {hasChanges ? (
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 backdrop-blur-md px-4 py-2.5">
          <span className="text-xs text-amber-400 font-medium">
            Anda memiliki perubahan yang belum disimpan
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => {
              const map: Record<string, any> = {};
              for (const item of data.items) map[item.key] = item.value;
              setDraft(map);
              setHasChanges(false);
            }}>
              Batal
            </Button>
            <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Simpan Perubahan
            </Button>
          </div>
        </div>
      ) : null}

      {/* A. Identitas Aplikasi */}
      <Card className="p-6 space-y-4">
        <SectionHeader
          icon={ImageIcon}
          title="Identitas Aplikasi"
          description="Nama, tagline, dan deskripsi aplikasi yang tampil di sidebar, login, dan dashboard"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama Aplikasi">
            <Input value={draft["app.name"] ?? ""} onChange={(e) => updateField("app.name", e.target.value)} />
          </Field>
          <Field label="Tagline">
            <Input value={draft["app.tagline"] ?? ""} onChange={(e) => updateField("app.tagline", e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Deskripsi Aplikasi">
              <Textarea
                value={draft["app.description"] ?? ""}
                onChange={(e) => updateField("app.description", e.target.value)}
                rows={2}
              />
            </Field>
          </div>
        </div>

        {/* Logo upload (mock — saves URL only) */}
        <div className="space-y-2 pt-2 border-t border-border">
          <Label className="text-xs">Logo Aplikasi</Label>
          <div className="flex items-center gap-4">
            <div className="size-16 rounded-lg border-2 border-dashed border-border bg-muted/30 flex items-center justify-center">
              {draft["app.logo_url"] ? (
                <img src={draft["app.logo_url"]} alt="Logo" className="size-full object-contain p-1" />
              ) : (
                <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
              )}
            </div>
            <div className="flex-1 space-y-1.5">
              <Input
                placeholder="URL logo (https://... atau /uploads/logo.png)"
                value={draft["app.logo_url"] ?? ""}
                onChange={(e) => updateField("app.logo_url", e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">
                Upload file logo ke folder <code>/public/uploads/</code> lalu isi URL di sini.
                Format: PNG/JPG/SVG/WebP. Maks 1MB.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => toast.info("Upload file — fitur ini diaktifkan saat deploy production (butuh storage service)")}>
              <Upload className="h-3 w-3" />
              Upload
            </Button>
          </div>
        </div>
      </Card>

      {/* B. Tema Warna */}
      <Card className="p-6 space-y-4">
        <SectionHeader
          icon={Palette}
          title="Tema & Warna"
          description="Warna primary, secondary, accent. Default theme (light/dark)."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Primary Color">
            <div className="flex gap-2">
              <input
                type="color"
                value={draft["theme.primary_color"] ?? "#10b981"}
                onChange={(e) => updateField("theme.primary_color", e.target.value)}
                className="size-9 rounded-md border border-border cursor-pointer"
              />
              <Input
                value={draft["theme.primary_color"] ?? "#10b981"}
                onChange={(e) => updateField("theme.primary_color", e.target.value)}
                className="font-mono"
              />
            </div>
          </Field>
          <Field label="Secondary Color">
            <div className="flex gap-2">
              <input
                type="color"
                value={draft["theme.secondary_color"] ?? "#06b6d4"}
                onChange={(e) => updateField("theme.secondary_color", e.target.value)}
                className="size-9 rounded-md border border-border cursor-pointer"
              />
              <Input
                value={draft["theme.secondary_color"] ?? "#06b6d4"}
                onChange={(e) => updateField("theme.secondary_color", e.target.value)}
                className="font-mono"
              />
            </div>
          </Field>
          <Field label="Accent Color">
            <div className="flex gap-2">
              <input
                type="color"
                value={draft["theme.accent_color"] ?? "#f59e0b"}
                onChange={(e) => updateField("theme.accent_color", e.target.value)}
                className="size-9 rounded-md border border-border cursor-pointer"
              />
              <Input
                value={draft["theme.accent_color"] ?? "#f59e0b"}
                onChange={(e) => updateField("theme.accent_color", e.target.value)}
                className="font-mono"
              />
            </div>
          </Field>
          <Field label="Default Theme">
            <Select
              value={draft["theme.default_mode"] ?? "dark"}
              onValueChange={(v) => updateField("theme.default_mode", v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Catatan: perubahan warna tema memerlukan rebuild CSS Tailwind untuk diterapkan sepenuhnya.
          Nama aplikasi & logo langsung berlaku setelah simpan.
        </p>
      </Card>

      {/* C. Informasi Perusahaan */}
      <Card className="p-6 space-y-4">
        <SectionHeader
          icon={Building2}
          title="Informasi Perusahaan"
          description="Data perusahaan yang tampil di invoice, halaman pelanggan, dan kontak"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama Perusahaan">
            <Input value={draft["company.name"] ?? ""} onChange={(e) => updateField("company.name", e.target.value)} />
          </Field>
          <Field label="Website">
            <Input value={draft["company.website"] ?? ""} onChange={(e) => updateField("company.website", e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Alamat">
              <Input value={draft["company.address"] ?? ""} onChange={(e) => updateField("company.address", e.target.value)} />
            </Field>
          </div>
          <Field label="Kota">
            <Input value={draft["company.city"] ?? ""} onChange={(e) => updateField("company.city", e.target.value)} />
          </Field>
          <Field label="Provinsi">
            <Input value={draft["company.province"] ?? ""} onChange={(e) => updateField("company.province", e.target.value)} />
          </Field>
          <Field label="Kode Pos">
            <Input value={draft["company.postal_code"] ?? ""} onChange={(e) => updateField("company.postal_code", e.target.value)} />
          </Field>
          <Field label="Negara">
            <Input value={draft["company.country"] ?? ""} onChange={(e) => updateField("company.country", e.target.value)} />
          </Field>
          <Field label="Nomor Telepon">
            <Input value={draft["company.phone"] ?? ""} onChange={(e) => updateField("company.phone", e.target.value)} />
          </Field>
          <Field label="WhatsApp Perusahaan">
            <Input value={draft["company.whatsapp"] ?? ""} onChange={(e) => updateField("company.whatsapp", e.target.value)} />
          </Field>
          <Field label="Email Perusahaan">
            <Input type="email" value={draft["company.email"] ?? ""} onChange={(e) => updateField("company.email", e.target.value)} />
          </Field>
        </div>
      </Card>

      {/* D. Pengaturan Umum & Regional */}
      <Card className="p-6 space-y-4">
        <SectionHeader
          icon={Globe}
          title="Pengaturan Umum & Regional"
          description="Bahasa, zona waktu, format, dan preferensi sistem"
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Bahasa">
            <Select value={draft["general.language"] ?? "id"} onValueChange={(v) => updateField("general.language", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="id">Bahasa Indonesia</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Zona Waktu">
            <Select value={draft["general.timezone"] ?? "Asia/Jakarta"} onValueChange={(v) => updateField("general.timezone", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Asia/Jakarta">Asia/Jakarta (WIB)</SelectItem>
                <SelectItem value="Asia/Makassar">Asia/Makassar (WITA)</SelectItem>
                <SelectItem value="Asia/Jayapura">Asia/Jayapura (WIT)</SelectItem>
                <SelectItem value="Asia/Singapore">Asia/Singapore</SelectItem>
                <SelectItem value="UTC">UTC</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Mata Uang">
            <Select value={draft["general.currency"] ?? "IDR"} onValueChange={(v) => updateField("general.currency", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="IDR">IDR (Rupiah)</SelectItem>
                <SelectItem value="USD">USD (Dollar)</SelectItem>
                <SelectItem value="EUR">EUR (Euro)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Format Tanggal">
            <Input value={draft["general.date_format"] ?? ""} onChange={(e) => updateField("general.date_format", e.target.value)} />
          </Field>
          <Field label="Format Jam">
            <Input value={draft["general.time_format"] ?? ""} onChange={(e) => updateField("general.time_format", e.target.value)} />
          </Field>
          <Field label="Default Pagination">
            <Input
              type="number"
              min={5}
              max={100}
              value={draft["general.default_pagination"] ?? 20}
              onChange={(e) => updateField("general.default_pagination", Number(e.target.value))}
            />
          </Field>
          <Field label="Session Timeout (menit)">
            <Input
              type="number"
              min={5}
              max={1440}
              value={draft["general.session_timeout_minutes"] ?? 60}
              onChange={(e) => updateField("general.session_timeout_minutes", Number(e.target.value))}
            />
          </Field>
        </div>
      </Card>

      {/* E. Branding Portal Pelanggan (independent from admin) */}
      <Card className="p-6 space-y-4">
        <SectionHeader
          icon={Palette}
          title="Branding Portal Pelanggan"
          description="Tampilan & informasi khusus halaman pelanggan (independen dari admin)"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama Portal Pelanggan">
            <Input value={draft["portal.name"] ?? ""} onChange={(e) => updateField("portal.name", e.target.value)} />
          </Field>
          <Field label="Warna Tema Portal">
            <div className="flex gap-2">
              <input
                type="color"
                value={draft["portal.primary_color"] ?? "#10b981"}
                onChange={(e) => updateField("portal.primary_color", e.target.value)}
                className="size-9 rounded-md border border-border cursor-pointer"
              />
              <Input
                value={draft["portal.primary_color"] ?? "#10b981"}
                onChange={(e) => updateField("portal.primary_color", e.target.value)}
                className="font-mono"
              />
            </div>
          </Field>
          <Field label="WhatsApp Support">
            <Input value={draft["portal.support_whatsapp"] ?? ""} onChange={(e) => updateField("portal.support_whatsapp", e.target.value)} />
          </Field>
          <Field label="Email Support">
            <Input type="email" value={draft["portal.support_email"] ?? ""} onChange={(e) => updateField("portal.support_email", e.target.value)} />
          </Field>
          <Field label="URL Terms & Conditions">
            <Input value={draft["portal.terms_url"] ?? ""} onChange={(e) => updateField("portal.terms_url", e.target.value)} />
          </Field>
          <Field label="URL Privacy Policy">
            <Input value={draft["portal.privacy_url"] ?? ""} onChange={(e) => updateField("portal.privacy_url", e.target.value)} />
          </Field>
        </div>
      </Card>

      {/* SMTP Settings */}
      <Card className="p-6 space-y-4">
        <SectionHeader
          icon={SettingsIcon}
          title="SMTP / Email Server"
          description="Konfigurasi pengiriman email. Password SMTP tidak ditampilkan kembali setelah disimpan."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="SMTP Host">
            <Input value={draft["smtp.host"] ?? ""} onChange={(e) => updateField("smtp.host", e.target.value)} placeholder="smtp.gmail.com" />
          </Field>
          <Field label="SMTP Port">
            <Input
              type="number"
              value={draft["smtp.port"] ?? 587}
              onChange={(e) => updateField("smtp.port", Number(e.target.value))}
            />
          </Field>
          <Field label="SMTP Username">
            <Input value={draft["smtp.username"] ?? ""} onChange={(e) => updateField("smtp.username", e.target.value)} />
          </Field>
          <Field label="SMTP Password">
            <Input
              type="password"
              placeholder="•••••••• (kosongkan jika tidak diubah)"
              onChange={(e) => updateField("smtp.password", e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">Tersimpan terenkripsi. Tidak ditampilkan ulang.</p>
          </Field>
          <Field label="Encryption">
            <Select value={draft["smtp.encryption"] ?? "TLS"} onValueChange={(v) => updateField("smtp.encryption", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TLS">TLS</SelectItem>
                <SelectItem value="SSL">SSL</SelectItem>
                <SelectItem value="None">None</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Sender Name">
            <Input value={draft["smtp.sender_name"] ?? ""} onChange={(e) => updateField("smtp.sender_name", e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Sender Email">
              <Input type="email" value={draft["smtp.sender_email"] ?? ""} onChange={(e) => updateField("smtp.sender_email", e.target.value)} />
            </Field>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => toast.info("Test email — fitur ini mengirim email tes via SMTP sungguhan (aktif saat produksi)")}>
          Kirim Test Email
        </Button>
      </Card>

      {/* Save button at bottom */}
      <div className="flex justify-end gap-2 pb-4">
        <Button variant="outline" onClick={() => {
          const map: Record<string, any> = {};
          for (const item of data.items) map[item.key] = item.value;
          setDraft(map);
          setHasChanges(false);
        }} disabled={!hasChanges}>
          Batal
        </Button>
        <Button onClick={() => saveMut.mutate()} disabled={!hasChanges || saveMut.isPending}>
          {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Simpan Semua Perubahan
        </Button>
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="space-y-1">
      <h3 className="text-base font-semibold flex items-center gap-2">
        <Icon className="h-4 w-4 text-emerald-400" />
        {title}
      </h3>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
