"use client";

// MVMP — Public Landing Page (SaaS/NOC grade)
// Modern, professional, selling. Dark hero with gradient, stats, features,
// pricing table, server locations, testimonials, FAQ, CTA, footer.
//
// Test in sandbox: localhost:3000/?site=customer
// Production: deployed to mvmp.customer.com

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  ChevronDown,
  Clock,
  Globe,
  Github,
  Instagram,
  Linkedin,
  MessageCircle,
  Server,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Twitter,
  Zap,
} from "lucide-react";
import { ChatWidget } from "@/components/chat/ChatWidget";

// ============================================================================
// DATA — hardcoded from seed (production: fetch from public API)
// ============================================================================

const PACKAGES = [
  {
    name: "Paket Hemat",
    protocols: ["SSH", "OpenVPN", "Shadowsocks"],
    target: "Pengguna Kasual",
    desc: "Cukup untuk browsing, WhatsApp, dan media sosial tanpa buffering.",
    monthly: 25000,
    yearly: 225000,
    color: "from-cyan-500/20 to-cyan-500/5",
    accent: "cyan",
    icon: Smartphone,
    features: ["3 protokol VPN", "3 perangkat", "Browsing & Sosmed", "WhatsApp lancar"],
  },
  {
    name: "Paket Pro",
    protocols: ["WireGuard", "VMess", "VLESS", "Trojan"],
    target: "Pekerja & Streamer",
    desc: "Koneksi stabil, cepat, dan aman untuk kerja remote, Zoom, dan Netflix.",
    monthly: 40000,
    yearly: 360000,
    color: "from-emerald-500/20 to-emerald-500/5",
    accent: "emerald",
    icon: Zap,
    features: ["4 protokol VPN", "5 perangkat", "Streaming HD", "Work from home"],
    popular: false,
  },
  {
    name: "Paket Sultan",
    protocols: ["Hysteria2", "TUIC", "VLESS+Reality"],
    target: "Gamer & Tech-Savvy",
    desc: "Performa maksimal, anti-lag, anti-blokir ISP, dan privasi absolut.",
    monthly: 55000,
    yearly: 500000,
    color: "from-amber-500/20 to-amber-500/5",
    accent: "amber",
    icon: Shield,
    features: ["3 protokol premium", "5 perangkat", "Anti-lag gaming", "Anti-blokir ISP"],
    popular: true,
  },
  {
    name: "👑 ALL ACCESS",
    protocols: ["Semua 10 Protokol"],
    target: "Bebas Pilih!",
    desc: "Satu akun untuk semua kebutuhan. Jika 1 protokol gangguan, tinggal ganti.",
    monthly: 65000,
    yearly: 585000,
    color: "from-violet-500/20 to-violet-500/5",
    accent: "violet",
    icon: Sparkles,
    features: ["10 protokol VPN", "5 perangkat", "Garansi koneksi", "Prioritas support"],
    popular: true,
  },
];

const SERVERS = [
  { name: "ID-JKT-01", location: "Indonesia, Jakarta", flag: "🇮🇩", latency: "5ms", load: 32 },
  { name: "ID-JKT-02", location: "Indonesia, Jakarta", flag: "🇮🇩", latency: "5ms", load: 28 },
  { name: "SG-Premium-01", location: "Singapore", flag: "🇸🇬", latency: "15ms", load: 45 },
  { name: "US-LAX-01", location: "United States, LA", flag: "🇺🇸", latency: "180ms", load: 22 },
  { name: "NL-AMS-01", location: "Netherlands, Amsterdam", flag: "🇳🇱", latency: "250ms", load: 18 },
];

const PROTOCOLS = [
  { name: "OpenVPN", engine: "openvpn", desc: "Paling populer & kompatibel luas" },
  { name: "WireGuard", engine: "wireguard", desc: "Modern, cepat, ringan" },
  { name: "VMess", engine: "xray", desc: "Klasik V2Ray dengan enkripsi" },
  { name: "VLESS", engine: "xray", desc: "Ringan, ideal untuk Reality" },
  { name: "VLESS+Reality", engine: "xray", desc: "Kamuflase sebagai situs nyata" },
  { name: "Trojan", engine: "xray", desc: "Kamuflase traffic HTTPS" },
  { name: "Shadowsocks", engine: "sing-box", desc: "Sulit dideteksi" },
  { name: "Hysteria2", engine: "sing-box", desc: "QUIC-based, super cepat" },
  { name: "TUIC", engine: "sing-box", desc: "QUIC alternatif yang efisien" },
  { name: "SSH Tunnel", engine: "openssh", desc: "Populer di Indonesia" },
];

const TESTIMONIALS = [
  { name: "Budi Santoso", role: "Reseller VPN", text: "MVMP bikin gampang kelola 100+ pelanggan VPN. Dashboard real-time, auto-provisioning, langsung jalan. Mantap!", rating: 5 },
  { name: "Siti Rahayu", role: "Streamer Netflix", text: "Paket Pro nonton Netflix HD tanpa buffering. Server Singapore stabil banget, gak pernah putus.", rating: 5 },
  { name: "Ahmad Fauzi", role: "Gamer Mobile Legends", text: "Paket Sultan anti-lag banget! Ping turun dari 80ms ke 15ms. Recommended buat gamer.", rating: 5 },
  { name: "Dewi Lestari", role: "Work From Home", text: "Zoom meeting lancar, VPN gak mempengaruhi kualitas call. Plus WhatsApp support cepat respon.", rating: 5 },
];

const FAQS = [
  { q: "Berapa lama akun VPN aktif setelah bayar?", a: "Otomatis! Setelah pembayaran dikonfirmasi (QRIS instan atau transfer manual diverifikasi admin), akun VPN langsung ter-generate dalam hitungan detik. Anda bisa download config di portal pelanggan." },
  { q: "Bisa ganti protokol VPN kapan saja?", a: "Ya! Untuk paket ALL ACCESS, Anda punya 10 protokol sekaligus. Jika satu protokol ganggu, tinggal pakai protokol lain. Garansi koneksi selalu ada." },
  { q: "Berapa perangkat yang bisa dipakai?", a: "Tergantung paket: Hemat 3 perangkat, Pro/Sultan/ALL ACCESS 5 perangkat. Semua perangkat bisa connect bersamaan." },
  { q: "Apakah ada kuota bandwidth?", a: "Semua paket saat ini UNLIMITED bandwidth. Tidak ada batas kuota bulanan — pakai sepuasnya." },
  { q: "Server mana saja yang tersedia?", a: "Indonesia (Jakarta ×2), Singapore, United States (Los Angeles), Netherlands (Amsterdam). Semua server terinstal 10 protokol VPN." },
  { q: "Bagaimana cara pembayaran?", a: "QRIS (scan via e-wallet/banking), Transfer Manual (BCA, Mandiri, BNI, BRI), atau Payment Gateway (Xendit, Midtrans, DOKU, iPaymu)." },
  { q: "Apakah data saya aman?", a: "Ya. Password di-hash dengan bcrypt. Kredensial VPN dienkripsi. Semua aktivitas sensitif tercatat di audit log. Privasi Anda prioritas kami." },
  { q: "Bisa jadi reseller?", a: "Bisa! Daftar sebagai reseller, dapat komisi otomatis per transaksi, kelola pelanggan sendiri, topup saldo via portal. Hubungi admin untuk info lebih lanjut." },
];

const STATS = [
  { label: "Server Online", value: "5", suffix: "/5" },
  { label: "Protokol VPN", value: "10", suffix: "" },
  { label: "Uptime", value: "99.9", suffix: "%" },
  { label: "Pelanggan Aktif", value: "500+", suffix: "" },
];

// ============================================================================
// COMPONENT
// ============================================================================

export function LandingPage() {
  const [billingCycle, setBillingCycle] = React.useState<"monthly" | "yearly">("monthly");
  const [openFaq, setOpenFaq] = React.useState<number | null>(0);

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white overflow-x-hidden">
      {/* === NAVBAR === */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#0a0e1a]/80 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
            </div>
            <span className="text-lg font-bold tracking-tight">MVMP</span>
            <span className="text-[10px] text-white/40 hidden sm:block">Multi VPN Management</span>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm">
            <a href="#fitur" className="text-white/60 hover:text-white transition-colors">Fitur</a>
            <a href="#harga" className="text-white/60 hover:text-white transition-colors">Harga</a>
            <a href="#server" className="text-white/60 hover:text-white transition-colors">Server</a>
            <a href="#faq" className="text-white/60 hover:text-white transition-colors">FAQ</a>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/portal" className="text-sm text-white/70 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
              Login
            </Link>
            <Link href="/register" className="text-sm font-medium bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg transition-colors">
              Daftar Sekarang
            </Link>
          </div>
        </div>
      </nav>

      {/* === HERO === */}
      <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-28">
        {/* Background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-[120px]" />
          <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-cyan-500/10 rounded-full blur-[100px]" />
          <div className="absolute bottom-0 left-1/3 w-[300px] h-[300px] bg-violet-500/10 rounded-full blur-[80px]" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 mb-6">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-white/60">10 Protokol VPN · 5 Server · Auto-Provisioning</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight mb-6">
            VPN Multi-Protokol
            <br />
            <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-violet-400 bg-clip-text text-transparent">
              Tercepat di Indonesia
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-lg sm:text-xl text-white/50 max-w-2xl mx-auto mb-10">
            Browsing, streaming, gaming, dan kerja remote tanpa lag. Pilih dari 10 protokol VPN,
            5 lokasi server, auto-provisioning instan. Garansi koneksi selalu ada.
          </p>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-12">
            <Link href="/register" className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-medium text-base transition-all hover:scale-[1.02] shadow-lg shadow-emerald-500/20">
              Daftar Gratis Sekarang
            </Link>
            <a href="#harga" className="w-full sm:w-auto px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium text-base transition-colors">
              Lihat Harga
            </a>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {STATS.map((s) => (
              <div key={s.label} className="rounded-xl bg-white/5 border border-white/10 p-4">
                <p className="text-2xl sm:text-3xl font-bold text-white">
                  {s.value}<span className="text-emerald-400">{s.suffix}</span>
                </p>
                <p className="text-xs text-white/40 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* === FEATURES === */}
      <section id="fitur" className="py-20 sm:py-28 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-3">Kenapa MVMP?</h2>
            <p className="text-white/40 max-w-xl mx-auto">Platform VPN terlengkap dengan teknologi terdepan untuk kebutuhan semua pengguna.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: Server, title: "10 Protokol VPN", desc: "OpenVPN, WireGuard, VMess, VLESS, Reality, Trojan, Shadowsocks, Hysteria2, TUIC, SSH. Pilih sesuai kebutuhan jaringan.", color: "emerald" },
              { icon: Zap, title: "Auto-Provisioning", desc: "Bayar → langsung aktif. Akun VPN ter-generate otomatis dalam detik. Download config & QR code dari portal.", color: "cyan" },
              { icon: Shield, title: "Anti-Blokir ISP", desc: "Reality & Trojan kamuflase sebagai traffic HTTPS biasah. ISP tidak bisa deteksi atau blokir koneksi VPN Anda.", color: "amber" },
              { icon: Globe, title: "5 Lokasi Server", desc: "Indonesia (Jakarta), Singapore, USA (Los Angeles), Netherlands (Amsterdam). Semua server 10 protokol.", color: "violet" },
              { icon: MessageCircle, title: "WhatsApp Support", desc: "Live chat 24/7 via WhatsApp. Notifikasi otomatis saat pembayaran berhasil, akun aktif, atau mendekati expired.", color: "emerald" },
              { icon: Activity, title: "Dashboard Real-time", desc: "Monitoring server live, CPU/RAM/bandwidth, active accounts. Status update setiap 30 detik via SSE.", color: "cyan" },
            ].map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="rounded-2xl bg-white/5 border border-white/10 p-6 hover:bg-white/[0.07] transition-colors group">
                  <div className={`size-12 rounded-xl flex items-center justify-center mb-4 bg-${f.color}-500/10 border border-${f.color}-500/20`}>
                    <Icon className={`h-6 w-6 text-${f.color}-400`} />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                  <p className="text-sm text-white/40 leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* === PROTOCOLS === */}
      <section className="py-16 border-t border-white/5 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">10 Protokol VPN Tersedia</h2>
            <p className="text-white/40">Setiap server terinstal semua protokol. Pilih yang terbaik untuk jaringan Anda.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {PROTOCOLS.map((p) => (
              <div key={p.name} className="rounded-xl bg-white/5 border border-white/10 p-4 text-center hover:border-emerald-500/30 transition-colors">
                <p className="text-sm font-medium text-white">{p.name}</p>
                <p className="text-[10px] text-white/30 mt-1">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* === PRICING === */}
      <section id="harga" className="py-20 sm:py-28 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-bold mb-3">Pilih Paket Anda</h2>
            <p className="text-white/40">Harga transparan, tanpa biaya tersembunyi. Semua paket unlimited bandwidth.</p>

            {/* Billing toggle */}
            <div className="inline-flex items-center gap-1 mt-6 p-1 rounded-full bg-white/5 border border-white/10">
              <button
                onClick={() => setBillingCycle("monthly")}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${billingCycle === "monthly" ? "bg-emerald-500 text-white" : "text-white/50 hover:text-white"}`}
              >
                Bulanan
              </button>
              <button
                onClick={() => setBillingCycle("yearly")}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${billingCycle === "yearly" ? "bg-emerald-500 text-white" : "text-white/50 hover:text-white"}`}
              >
                Tahunan
                <span className="ml-1 text-[10px] text-emerald-400">Hemat 15%</span>
              </button>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {PACKAGES.map((pkg) => {
              const Icon = pkg.icon;
              const price = billingCycle === "monthly" ? pkg.monthly : pkg.yearly;
              const period = billingCycle === "monthly" ? "/bulan" : "/tahun";
              return (
                <div
                  key={pkg.name}
                  className={`relative rounded-2xl border p-6 bg-gradient-to-b ${pkg.color} ${
                    pkg.popular ? "border-emerald-500/40 ring-1 ring-emerald-500/20" : "border-white/10"
                  }`}
                >
                  {pkg.popular ? (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-emerald-500 text-[10px] font-bold uppercase tracking-wider">
                      Populer
                    </div>
                  ) : null}

                  <div className="size-10 rounded-lg bg-white/10 flex items-center justify-center mb-4">
                    <Icon className="h-5 w-5 text-white" />
                  </div>

                  <h3 className="text-lg font-bold mb-1">{pkg.name}</h3>
                  <p className="text-xs text-white/40 mb-4">{pkg.target}</p>

                  <div className="mb-4">
                    <span className="text-3xl font-bold">Rp {price.toLocaleString("id-ID")}</span>
                    <span className="text-sm text-white/40">{period}</span>
                  </div>

                  <p className="text-xs text-white/50 mb-4 leading-relaxed">{pkg.desc}</p>

                  <ul className="space-y-2 mb-6">
                    {pkg.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-xs text-white/60">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/register"
                    className={`block w-full py-2.5 rounded-xl text-center text-sm font-medium transition-colors ${
                      pkg.popular
                        ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                        : "bg-white/10 hover:bg-white/20 text-white"
                    }`}
                  >
                    Pilih {pkg.name}
                  </Link>
                </div>
              );
            })}
          </div>

          <p className="text-center text-xs text-white/30 mt-8">
            Semua paket termasuk: unlimited bandwidth, 5 perangkat, WhatsApp support, dashboard real-time, garansi koneksi.
          </p>
        </div>
      </section>

      {/* === SERVERS === */}
      <section id="server" className="py-20 border-t border-white/5 bg-white/[0.02]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold mb-2">Lokasi Server</h2>
            <p className="text-white/40">5 server online dengan 10 protokol terinstal di setiap server</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {SERVERS.map((s) => (
              <div key={s.name} className="rounded-xl bg-white/5 border border-white/10 p-4 hover:border-emerald-500/30 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl">{s.flag}</span>
                  <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                    <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Online
                  </span>
                </div>
                <p className="text-sm font-medium">{s.name}</p>
                <p className="text-xs text-white/40">{s.location}</p>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                  <span className="text-[10px] text-white/30">Latency: <span className="text-white/60">{s.latency}</span></span>
                  <span className="text-[10px] text-white/30">Load: <span className="text-white/60">{s.load}%</span></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* === TESTIMONIALS === */}
      <section className="py-20 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold mb-2">Apa Kata Pelanggan</h2>
            <p className="text-white/40">Ribuan pelanggan sudah mempercayai MVMP untuk kebutuhan VPN mereka</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="rounded-2xl bg-white/5 border border-white/10 p-6">
                <div className="flex gap-1 mb-3">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <span key={i} className="text-amber-400 text-sm">★</span>
                  ))}
                </div>
                <p className="text-sm text-white/60 leading-relaxed mb-4">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="size-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-xs font-bold text-emerald-400">
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-[10px] text-white/30">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* === FAQ === */}
      <section id="faq" className="py-20 border-t border-white/5 bg-white/[0.02]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold mb-2">Pertanyaan Umum</h2>
            <p className="text-white/40">Hal yang sering ditanyakan calon pelanggan</p>
          </div>
          <div className="space-y-3">
            {FAQS.map((faq, idx) => (
              <div key={idx} className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 hover:bg-white/[0.07] transition-colors"
                >
                  <span className="text-sm font-medium">{faq.q}</span>
                  <ChevronDown className={`h-4 w-4 text-white/40 shrink-0 transition-transform ${openFaq === idx ? "rotate-180" : ""}`} />
                </button>
                {openFaq === idx ? (
                  <div className="px-5 pb-4 text-sm text-white/50 leading-relaxed">{faq.a}</div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* === CTA === */}
      <section className="py-20 sm:py-28 border-t border-white/5">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <div className="relative rounded-3xl bg-gradient-to-br from-emerald-500/10 via-cyan-500/10 to-violet-500/10 border border-white/10 p-10 sm:p-16 overflow-hidden">
            <div className="absolute inset-0 bg-emerald-500/5 blur-[80px] pointer-events-none" />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">Siap Mulai?</h2>
              <p className="text-white/50 max-w-xl mx-auto mb-8">
                Daftar gratis sekarang, pilih paket, bayar, dan akun VPN Anda langsung aktif.
                Tanpa tunggu, tanpa ribet, tanpa admin manual.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link href="/register" className="w-full sm:w-auto px-8 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-medium transition-all hover:scale-[1.02] shadow-lg shadow-emerald-500/20">
                  Daftar Gratis
                </Link>
                <a href="https://wa.me/62811000002" target="_blank" rel="noopener" className="w-full sm:w-auto px-8 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium transition-colors flex items-center justify-center gap-2">
                  <MessageCircle className="h-4 w-4" />
                  Chat WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* === FOOTER === */}
      <footer className="border-t border-white/5 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
            {/* Brand */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                </div>
                <span className="text-lg font-bold">MVMP</span>
              </div>
              <p className="text-xs text-white/40 leading-relaxed">
                Multi VPN Management Panel — Platform VPN multi-protokol dengan auto-provisioning,
                billing, dan WhatsApp integration.
              </p>
            </div>

            {/* Product */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">Produk</p>
              {["Fitur", "Harga", "Server", "Protokol", "FAQ"].map((l) => (
                <a key={l} href={`#${l.toLowerCase()}`} className="block text-xs text-white/40 hover:text-white transition-colors">{l}</a>
              ))}
            </div>

            {/* Company */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">Perusahaan</p>
              <a href="/terms" className="block text-xs text-white/40 hover:text-white transition-colors">Syarat & Ketentuan</a>
              <a href="/privacy" className="block text-xs text-white/40 hover:text-white transition-colors">Kebijakan Privasi</a>
              <a href="https://wa.me/62811000002" className="block text-xs text-white/40 hover:text-white transition-colors">WhatsApp Support</a>
              <a href="mailto:hello@mvmp.id" className="block text-xs text-white/40 hover:text-white transition-colors">hello@mvmp.id</a>
            </div>

            {/* Social */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">Ikuti Kami</p>
              <div className="flex gap-2">
                {[Twitter, Instagram, Linkedin, Github].map((Icon, i) => (
                  <a key={i} href="#" className="size-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
                    <Icon className="h-4 w-4 text-white/50" />
                  </a>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-2">
                <Clock className="h-3 w-3 text-emerald-400" />
                <span className="text-[10px] text-white/40">Support 24/7 via WhatsApp</span>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-[10px] text-white/30">© 2026 MVMP Store. All rights reserved.</p>
            <p className="text-[10px] text-white/30">Powered by Next.js · Prisma · 10 VPN Protocols</p>
          </div>
        </div>
      </footer>

      {/* Chat Widget — AI assistant for visitors */}
      <ChatWidget context="landing" />
    </div>
  );
}
