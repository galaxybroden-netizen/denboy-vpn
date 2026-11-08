import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Syarat & Ketentuan — MVMP" };

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <Link href="/?site=customer" className="inline-flex items-center gap-1 text-xs text-white/40 hover:text-white mb-6">
          <ArrowLeft className="h-3 w-3" /> Kembali ke beranda
        </Link>
        <h1 className="text-3xl font-bold mb-8">Syarat & Ketentuan</h1>
        <div className="prose prose-invert max-w-none space-y-6 text-sm text-white/60">
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">1. Penerimaan Ketentuan</h2>
            <p>Dengan mendaftar dan menggunakan layanan MVMP ("Layanan"), Anda setuju untuk terikat oleh Syarat & Ketentuan ini. Jika Anda tidak setuju, mohon jangan menggunakan Layanan.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">2. Penggunaan Layanan</h2>
            <p>Layanan VPN disediakan untuk penggunaan pribadi yang sah. Anda dilarang menggunakan Layanan untuk: (a) aktivitas ilegal, (b) spamming, (c) DDoS attack, (d) distribusi malware, (e) pelanggaran hak cipta massal.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">3. Pembayaran & Refund</h2>
            <p>Pembayaran dilakukan melalui QRIS, transfer bank, atau payment gateway. Paket bulanan/tahunan aktif setelah pembayaran dikonfirmasi. Refund diberikan jika layanan tidak berfungsi selama 24+ jam karena kesalahan sistem kami.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">4. Batasan Layanan</h2>
            <p>Layanan VPN memiliki batasan perangkat sesuai paket (3-5 perangkat). Pelanggaran dapat menyebabkan suspend akun. Bandwidth unlimited namun fair-use policy berlaku (tidak untuk server/hosting).</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">5. Privasi Data</h2>
            <p>Kami tidak log aktivitas browsing Anda. Yang dicatat: waktu koneksi, durasi, bandwidth total (untuk billing). Data pribadi (nama, email, telepon) disimpan terenkripsi dan tidak dibagikan ke pihak ketiga.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">6. Perubahan Ketentuan</h2>
            <p>Kami berhak mengubah Syarat & Ketentuan ini kapan saja. Perubahan berlaku 7 hari setelah dipublikasikan di halaman ini.</p>
          </section>
        </div>
        <p className="text-xs text-white/30 mt-8">Terakhir diperbarui: 6 November 2026</p>
      </div>
    </div>
  );
}
