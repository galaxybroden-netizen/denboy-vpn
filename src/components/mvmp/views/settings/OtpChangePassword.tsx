"use client";

// MVMP — OTP-based Change Password (for SUPER_ADMIN without old password)
// Flow: request OTP → receive mock OTP in response → verify OTP → set new password

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { apiFetch } from "../../lib";
import { cn } from "@/lib/utils";

type Step = "idle" | "otp-requested" | "otp-verified" | "done";

export function OtpChangePassword() {
  const [step, setStep] = React.useState<Step>("idle");
  const [mockOtp, setMockOtp] = React.useState<string>("");
  const [otpInput, setOtpInput] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [cooldown, setCooldown] = React.useState(0);
  const [otpExpiresAt, setOtpExpiresAt] = React.useState<Date | null>(null);

  // OTP request mutation
  const requestOtpMut = useMutation({
    mutationFn: () =>
      apiFetch<{ mockOtp?: string; expiresAt?: string; sentTo?: string }>(
        "/api/security/otp/request",
        { method: "POST", body: JSON.stringify({ purpose: "password_change", channel: "email" }) }
      ),
    onSuccess: (data) => {
      setStep("otp-requested");
      setMockOtp(data.mockOtp || "");
      setOtpExpiresAt(data.expiresAt ? new Date(data.expiresAt) : null);
      setCooldown(60);
      toast.success(`OTP dikirim ke ${data.sentTo || "email Anda"}`);
    },
    onError: (e: any) => toast.error(e?.message || "Gagal meminta OTP"),
  });

  // OTP verify mutation
  const verifyOtpMut = useMutation({
    mutationFn: () =>
      apiFetch("/api/security/otp/verify", {
        method: "POST",
        body: JSON.stringify({ purpose: "password_change", code: otpInput }),
      }),
    onSuccess: () => {
      setStep("otp-verified");
      toast.success("OTP terverifikasi. Sekarang masukkan password baru.");
    },
    onError: (e: any) => toast.error(e?.message || "OTP tidak valid"),
  });

  // Change password mutation
  const changePassMut = useMutation({
    mutationFn: () =>
      apiFetch("/api/security/change-password", {
        method: "POST",
        body: JSON.stringify({
          otp_purpose: "password_change",
          otp_code: otpInput,
          newPassword,
          confirmPassword,
        }),
      }),
    onSuccess: () => {
      setStep("done");
      toast.success("Password berhasil diubah. Sesi lain telah dicabut.");
      setNewPassword("");
      setConfirmPassword("");
      setOtpInput("");
      setMockOtp("");
    },
    onError: (e: any) => toast.error(e?.message || "Gagal mengubah password"),
  });

  // Cooldown countdown
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  // Password strength check
  const passwordStrength = React.useMemo(() => {
    let score = 0;
    if (newPassword.length >= 8) score += 25;
    if (newPassword.length >= 12) score += 15;
    if (/[A-Z]/.test(newPassword)) score += 20;
    if (/[0-9]/.test(newPassword)) score += 20;
    if (/[^A-Za-z0-9]/.test(newPassword)) score += 20;
    return Math.min(100, score);
  }, [newPassword]);

  const strengthLabel = passwordStrength < 40 ? "Lemah" : passwordStrength < 70 ? "Sedang" : "Kuat";
  const strengthColor = passwordStrength < 40 ? "rose" : passwordStrength < 70 ? "amber" : "emerald";

  const passwordsMatch = newPassword && confirmPassword && newPassword === confirmPassword;
  const canSubmit = step === "otp-verified" && newPassword.length >= 8 && passwordsMatch;

  function reset() {
    setStep("idle");
    setOtpInput("");
    setNewPassword("");
    setConfirmPassword("");
    setMockOtp("");
    setOtpExpiresAt(null);
  }

  return (
    <Card className="p-6 space-y-5">
      <div className="space-y-1">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-emerald-400" />
          Ubah Password (via OTP)
        </h3>
        <p className="text-xs text-muted-foreground">
          Superadmin dapat mengubah password sendiri tanpa password lama.
          Wajib verifikasi via OTP yang dikirim ke email terverifikasi.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs">
        <StepBadge num={1} label="Minta OTP" active={step === "idle"} done={step !== "idle"} />
        <span className="text-muted-foreground">→</span>
        <StepBadge num={2} label="Verifikasi OTP" active={step === "otp-requested"} done={step === "otp-verified" || step === "done"} />
        <span className="text-muted-foreground">→</span>
        <StepBadge num={3} label="Password Baru" active={step === "otp-verified"} done={step === "done"} />
      </div>

      {/* Step 1: Request OTP */}
      {step === "idle" ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Klik tombol di bawah untuk meminta kode OTP. OTP akan dikirim ke email
            Anda yang sudah terverifikasi.
          </p>
          <Button onClick={() => requestOtpMut.mutate()} disabled={requestOtpMut.isPending}>
            {requestOtpMut.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Mengirim OTP...</>
            ) : (
              <><Mail className="h-4 w-4" /> Kirim Kode OTP</>
            )}
          </Button>
        </div>
      ) : null}

      {/* Step 2: Verify OTP */}
      {step === "otp-requested" || step === "otp-verified" ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-1.5">
            <p className="text-xs font-medium text-emerald-400 flex items-center gap-2">
              <ShieldCheck className="h-3 w-3" />
              OTP telah dikirim
            </p>
            {mockOtp ? (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Mode demo:</span> kode OTP Anda adalah{" "}
                <span className="font-mono font-bold text-emerald-400 text-base tracking-wider">{mockOtp}</span>
                <br />
                <span className="text-[10px]">Di produksi, OTP hanya dikirim via email sungguhan dan tidak ditampilkan di sini.</span>
              </p>
            ) : null}
            {otpExpiresAt ? (
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Berlaku sampai: {otpExpiresAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Masukkan Kode OTP (6 digit)</Label>
            <Input
              value={otpInput}
              onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="font-mono text-lg tracking-widest text-center"
              maxLength={6}
              disabled={step === "otp-verified"}
            />
          </div>

          {step === "otp-requested" ? (
            <div className="flex gap-2">
              <Button
                onClick={() => verifyOtpMut.mutate()}
                disabled={verifyOtpMut.isPending || otpInput.length !== 6}
              >
                {verifyOtpMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Verifikasi OTP
              </Button>
              <Button
                variant="outline"
                onClick={() => requestOtpMut.mutate()}
                disabled={cooldown > 0 || requestOtpMut.isPending}
              >
                {cooldown > 0 ? `Kirim ulang (${cooldown}s)` : "Kirim Ulang OTP"}
              </Button>
            </div>
          ) : (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              OTP terverifikasi
            </Badge>
          )}
        </div>
      ) : null}

      {/* Step 3: New password */}
      {step === "otp-verified" || step === "done" ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Password Baru</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              disabled={step === "done"}
            />
            {newPassword ? (
              <div className="space-y-1">
                <Progress value={passwordStrength} className={cn("h-1.5",
                  strengthColor === "rose" && "[&>div]:bg-rose-500",
                  strengthColor === "amber" && "[&>div]:bg-amber-500",
                  strengthColor === "emerald" && "[&>div]:bg-emerald-500"
                )} />
                <p className={cn("text-[10px]",
                  strengthColor === "rose" && "text-rose-400",
                  strengthColor === "amber" && "text-amber-400",
                  strengthColor === "emerald" && "text-emerald-400"
                )}>
                  Kekuatan: {strengthLabel} ({passwordStrength}%)
                </p>
              </div>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Konfirmasi Password Baru</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              disabled={step === "done"}
            />
            {confirmPassword && !passwordsMatch ? (
              <p className="text-[10px] text-rose-400">Password tidak cocok</p>
            ) : null}
          </div>

          <ul className="text-[10px] text-muted-foreground space-y-0.5">
            <li>• Minimal 8 karakter</li>
            <li>• Disarankan: campuran huruf besar, angka, dan simbol</li>
            <li>• Sesi login lain akan otomatis dicabut setelah password diubah</li>
          </ul>

          {step === "otp-verified" ? (
            <Button
              onClick={() => changePassMut.mutate()}
              disabled={!canSubmit || changePassMut.isPending}
              className="bg-emerald-500 hover:bg-emerald-600"
            >
              {changePassMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              Simpan Password Baru
            </Button>
          ) : null}

          {step === "done" ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5" />
                <div className="text-xs">
                  <p className="font-medium text-emerald-400">Password berhasil diubah</p>
                  <p className="text-muted-foreground">Semua sesi login lain telah dicabut. Notifikasi keamanan telah dikirim.</p>
                </div>
              </div>
              <Button variant="outline" onClick={reset}>Mulai Lagi</Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function StepBadge({ num, label, active, done }: { num: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs",
      active && "bg-emerald-500/15 text-emerald-400",
      done && "text-emerald-400",
      !active && !done && "text-muted-foreground"
    )}>
      <span className={cn(
        "size-4 rounded-full flex items-center justify-center text-[10px] font-bold",
        active ? "bg-emerald-500 text-white" : done ? "bg-emerald-500/30 text-emerald-400" : "bg-muted text-muted-foreground"
      )}>
        {done ? "✓" : num}
      </span>
      <span>{label}</span>
    </div>
  );
}
