"use client";

// MVMP — Customer self-service registration
// Public page — no login required. Creates User (CUSTOMER) + Customer record.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Loader2, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [success, setSuccess] = React.useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const phone = formData.get("phone") as string;
    const password = formData.get("password") as string;

    if (password.length < 8) {
      toast.error("Password minimal 8 karakter");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone: phone || null, password, resellerId: null }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error?.message || "Gagal mendaftar");
      }
      setSuccess(true);
      toast.success("Pendaftaran berhasil! Silakan login.");
    } catch (err: any) {
      toast.error(err?.message || "Gagal mendaftar");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#0a0e1a] text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="size-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Pendaftaran Berhasil!</h1>
            <p className="text-sm text-white/50">Akun pelanggan Anda sudah dibuat. Silakan login untuk mulai berbelanja paket VPN.</p>
          </div>
          <Link href="/portal" className="inline-block px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-medium transition-colors">
            Login Sekarang
          </Link>
          <Link href="/?site=customer" className="block text-xs text-white/40 hover:text-white mt-4">
            ← Kembali ke beranda
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <Link href="/?site=customer" className="inline-flex items-center gap-1 text-xs text-white/40 hover:text-white mb-6">
          <ArrowLeft className="h-3 w-3" /> Kembali ke beranda
        </Link>

        <div className="rounded-2xl bg-white/5 border border-white/10 p-8">
          <div className="flex items-center gap-2 mb-6">
            <div className="size-9 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <UserPlus className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Daftar Pelanggan</h1>
              <p className="text-xs text-white/40">Gratis — langsung aktif</p>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Nama Lengkap</Label>
              <Input name="name" required placeholder="Budi Santoso" className="bg-white/5 border-white/10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Email</Label>
              <Input name="email" type="email" required placeholder="budi@example.com" className="bg-white/5 border-white/10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Nomor WhatsApp (opsional)</Label>
              <Input name="phone" placeholder="0812xxxxxxx" className="bg-white/5 border-white/10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Password</Label>
              <Input name="password" type="password" required minLength={8} placeholder="••••••••" className="bg-white/5 border-white/10" />
              <p className="text-[10px] text-white/30">Minimal 8 karakter</p>
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-emerald-500 hover:bg-emerald-600">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Daftar Sekarang
            </Button>
          </form>

          <div className="mt-6 pt-4 border-t border-white/5 text-center">
            <p className="text-xs text-white/40">Sudah punya akun?</p>
            <Link href="/portal" className="text-sm text-emerald-400 hover:underline">Login di sini</Link>
          </div>
        </div>

        <p className="text-[10px] text-white/30 text-center mt-4 flex items-center justify-center gap-1">
          <ShieldCheck className="h-3 w-3" /> Data Anda aman. Password di-hash dengan bcrypt.
        </p>
      </div>
    </div>
  );
}
