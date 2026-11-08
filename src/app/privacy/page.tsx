import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Kebijakan Privasi — MVMP" };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <Link href="/?site=customer" className="inline-flex items-center gap-1 text-xs text-white/40 hover:text-white mb-6">
          <ArrowLeft className="h-3 w-3" /> Kembali ke beranda
        </Link>
        <h1 className="text-3xl font-bold mb-8">Kebijakan Privasi</h1>
        <div className="prose prose-invert max-w-none space-y-6 text-sm text-white/60">
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">1. Data yang Dikumpulkan</h2>
            <ul className="space-y-1 list-disc list-inside">
              <li>Nama lengkap, email, nomor telepon (saat registrasi)</li>
              <li>Waktu login, IP address, user agent (untuk keamanan)</li>
              <li>Riwayat transaksi & pembayaran</li>
              <li>Bandwidth usage per akun VPN (total upload/download)</li>
            </ul>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">2. Data yang TIDAK Dikumpulkan</h2>
            <ul className="space-y-1 list-disc list-inside">
              <li>Log aktivitas browsing / situs yang dikunjungi</li>
              <li>Konten traffic VPN (terenkripsi end-to-end)</li>
              <li>DNS queries</li>
            </ul>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">3. Penyimpanan & Keamanan</h2>
            <p>Password di-hash dengan bcrypt (10 rounds). Kredensial VPN disimpan terenkripsi. Akses ke data dibatasi via RBAC (hanya SUPER_ADMIN). Semua aktivitas sensitif tercatat di audit log.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">4. Pembagian Data</h2>
            <p>Kami TIDAK menjual, menyewakan, atau membagikan data pribadi Anda ke pihak ketiga. Data hanya dibagikan jika diwajibkan oleh hukum (surat perintah pengadilan).</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">5. Hak Anda</h2>
            <p>Anda berhak: (a) mengakses data Anda, (b) meminta koreksi, (c) meminta penghapusan akun, (d) export data. Hubungi hello@mvmp.id untuk permintaan.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">6. Cookies</h2>
            <p>Layanan menggunakan session cookie (untuk autentikasi) dan localStorage (untuk preferensi tampilan). Tidak menggunakan tracking cookies pihak ketiga.</p>
          </section>
        </div>
        <p className="text-xs text-white/30 mt-8">Terakhir diperbarui: 6 November 2026</p>
      </div>
    </div>
  );
}
