// MVMP — PDF Invoice generator (browser-only, uses jspdf + jspdf-autotable)
// Imported from client components on demand.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatCurrencyRaw, formatDate } from "@/lib/utils-mvmp";

// ---------------------------------------------------------------------------
// Types — kept loose (any) to tolerate either admin or customer transaction
// shapes returned by the respective API endpoints.
// ---------------------------------------------------------------------------

export interface InvoiceTransaction {
  id?: string;
  invoiceNumber?: string;
  amount?: number;
  currency?: string;
  status?: string;
  type?: string;
  createdAt?: string;
  paidAt?: string | null;
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
    customerCode?: string;
  } | null;
  reseller?: {
    resellerCode?: string;
    user?: { name?: string; email?: string } | null;
  } | null;
  payments?: Array<{
    provider?: string;
    paymentMethod?: string;
    status?: string;
    providerReference?: string | null;
    vaNumber?: string | null;
    qrisData?: string | null;
    expiresAt?: string | null;
    createdAt?: string;
  }> | null;
  invoice?: {
    invoiceNumber?: string;
    issuedAt?: string;
    dueAt?: string | null;
  } | null;
  subscription?: {
    package?: {
      name?: string;
      description?: string;
      durationDays?: number;
      price?: number;
      currency?: string;
    } | null;
  } | null;
}

export interface InvoiceOptions {
  customer?: any;
  package?: any;
  reseller?: any;
}

// Emerald accent (RGB: 16, 185, 129 — Tailwind emerald-500)
const EMERALD: [number, number, number] = [16, 185, 129];
const DARK_TEXT: [number, number, number] = [30, 41, 59]; // slate-800
const MUTED_TEXT: [number, number, number] = [100, 116, 139]; // slate-500
const BORDER_GRAY: [number, number, number] = [226, 232, 240]; // slate-200
const TOTAL_BG: [number, number, number] = [241, 245, 249]; // slate-100

/**
 * generateInvoicePDF
 * Renders a professional A4 portrait invoice PDF for an MVMP transaction
 * and triggers a browser download as `Invoice-{invoiceNumber}.pdf`.
 */
export function generateInvoicePDF(
  transaction: InvoiceTransaction,
  options: InvoiceOptions = {}
) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  // Merge customer/package/reseller overrides onto the transaction
  const customer = options.customer ?? transaction.customer ?? null;
  const pkg = options.package ?? transaction.subscription?.package ?? null;
  const reseller = options.reseller ?? transaction.reseller ?? null;

  const invoiceNumber =
    transaction.invoiceNumber ||
    transaction.invoice?.invoiceNumber ||
    "INV-UNKNOWN";
  const currency = transaction.currency || "IDR";
  const amount = Number(transaction.amount ?? 0);
  const durationDays = Number(pkg?.durationDays ?? 30);

  // Page geometry
  const pageWidth = doc.internal.pageSize.getWidth(); // 210
  const pageHeight = doc.internal.pageSize.getHeight(); // 297
  const margin = 14;
  const contentWidth = pageWidth - margin * 2; // 182
  let y = margin;

  // ---------------------------------------------------------------------------
  // Header
  // ---------------------------------------------------------------------------
  // Left side — brand
  doc.setFont("helvetica", "bold");
  doc.setTextColor(EMERALD[0], EMERALD[1], EMERALD[2]);
  doc.setFontSize(28);
  doc.text("MVMP", margin, y + 8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(MUTED_TEXT[0], MUTED_TEXT[1], MUTED_TEXT[2]);
  doc.text("Multi VPN Management Panel", margin, y + 14);
  doc.text("support@mvmp.id", margin, y + 18.5);

  // Right side — invoice block
  const rightX = pageWidth - margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(MUTED_TEXT[0], MUTED_TEXT[1], MUTED_TEXT[2]);
  doc.text("INVOICE", rightX, y + 4, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(DARK_TEXT[0], DARK_TEXT[1], DARK_TEXT[2]);
  doc.text(`#${invoiceNumber}`, rightX, y + 11, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(MUTED_TEXT[0], MUTED_TEXT[1], MUTED_TEXT[2]);
  const issuedAt = transaction.invoice?.issuedAt || transaction.createdAt;
  const dueAt = transaction.invoice?.dueAt;
  doc.text(
    `Tanggal Terbit: ${formatDate(issuedAt || null)}`,
    rightX,
    y + 17,
    { align: "right" }
  );
  doc.text(
    `Jatuh Tempo: ${formatDate(dueAt || null)}`,
    rightX,
    y + 21.5,
    { align: "right" }
  );

  y += 28;

  // Divider line
  doc.setDrawColor(BORDER_GRAY[0], BORDER_GRAY[1], BORDER_GRAY[2]);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // ---------------------------------------------------------------------------
  // Bill To
  // ---------------------------------------------------------------------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(MUTED_TEXT[0], MUTED_TEXT[1], MUTED_TEXT[2]);
  doc.text("DITAGIHKAN KEPADA", margin, y);

  y += 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(DARK_TEXT[0], DARK_TEXT[1], DARK_TEXT[2]);
  doc.text(customer?.name || "Pelanggan", margin, y);

  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(MUTED_TEXT[0], MUTED_TEXT[1], MUTED_TEXT[2]);
  if (customer?.email) {
    doc.text(customer.email, margin, y);
    y += 4.5;
  }
  if (customer?.phone) {
    doc.text(customer.phone, margin, y);
    y += 4.5;
  }
  if (customer?.customerCode) {
    doc.text(`Kode Pelanggan: ${customer.customerCode}`, margin, y);
    y += 4.5;
  }
  if (reseller?.user?.name || reseller?.resellerCode) {
    const resellerLabel = reseller.user?.name
      ? `Reseller: ${reseller.user.name}${
          reseller.resellerCode ? ` (${reseller.resellerCode})` : ""
        }`
      : `Reseller: ${reseller.resellerCode}`;
    doc.text(resellerLabel, margin, y);
    y += 4.5;
  }

  y += 4;

  // ---------------------------------------------------------------------------
  // Items table (autotable)
  // ---------------------------------------------------------------------------
  const packageName = pkg?.name || "Paket VPN";
  const packageDesc = pkg?.description || transaction.type || "Layanan VPN";
  const packageLine = `${packageName}\n${packageDesc}`;

  const amountText = formatCurrencyRaw(amount, currency);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Deskripsi", "Durasi", "Jumlah"]],
    body: [
      [
        { content: packageLine, styles: { cellWidth: contentWidth * 0.6 } },
        { content: `${durationDays} hari`, styles: { halign: "center" } },
        { content: amountText, styles: { halign: "right" } },
      ],
      [
        { content: "Pajak/PPN 0% (sudah termasuk)" },
        { content: "-", styles: { halign: "center" } },
        { content: formatCurrencyRaw(0, currency), styles: { halign: "right" } },
      ],
    ],
    foot: [
      [
        { content: "", styles: { fillColor: TOTAL_BG } },
        {
          content: "Total",
          styles: {
            halign: "right",
            fillColor: TOTAL_BG,
            textColor: DARK_TEXT,
            fontStyle: "bold",
          },
        },
        {
          content: amountText,
          styles: {
            halign: "right",
            fillColor: TOTAL_BG,
            textColor: EMERALD,
            fontStyle: "bold",
          },
        },
      ],
    ],
    headStyles: {
      fillColor: EMERALD,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 10,
    },
    bodyStyles: {
      textColor: DARK_TEXT,
      fontSize: 10,
      cellPadding: 3,
    },
    footStyles: {
      fontSize: 11,
      cellPadding: 3,
    },
    theme: "grid",
    styles: {
      lineColor: BORDER_GRAY,
      lineWidth: 0.1,
      overflow: "linebreak",
    },
    columnStyles: {
      0: { cellWidth: contentWidth * 0.6 },
      1: { cellWidth: contentWidth * 0.2, halign: "center" },
      2: { cellWidth: contentWidth * 0.2, halign: "right" },
    },
  });

  // @ts-ignore — lastAutoTable is injected by the plugin at runtime
  y = (doc as any).lastAutoTable.finalY + 8;

  // ---------------------------------------------------------------------------
  // Payment info section
  // ---------------------------------------------------------------------------
  const payment = transaction.payments?.[0];
  const paymentMethod = payment?.paymentMethod || transaction.payments?.[0]?.paymentMethod;
  const statusLabel = transaction.status || (payment?.status ?? "-");
  const providerRef = payment?.providerReference || "-";
  const vaNumber = payment?.vaNumber || "-";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(DARK_TEXT[0], DARK_TEXT[1], DARK_TEXT[2]);
  doc.text("Informasi Pembayaran", margin, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  const payRows: Array<[string, string]> = [
    ["Metode Pembayaran", paymentMethod || "-"],
    ["Status", String(statusLabel).toUpperCase()],
    ["Referensi Provider", providerRef || "-"],
    ["Nomor Virtual Account", vaNumber || "-"],
  ];

  // Draw simple key/value rows with a left label and right value
  for (const [label, value] of payRows) {
    doc.setTextColor(MUTED_TEXT[0], MUTED_TEXT[1], MUTED_TEXT[2]);
    doc.text(label, margin, y);
    doc.setTextColor(DARK_TEXT[0], DARK_TEXT[1], DARK_TEXT[2]);
    doc.text(String(value), margin + 45, y);
    y += 5;
  }

  // ---------------------------------------------------------------------------
  // Footer
  // ---------------------------------------------------------------------------
  const footerY = pageHeight - 24;
  doc.setDrawColor(BORDER_GRAY[0], BORDER_GRAY[1], BORDER_GRAY[2]);
  doc.setLineWidth(0.3);
  doc.line(margin, footerY, pageWidth - margin, footerY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(MUTED_TEXT[0], MUTED_TEXT[1], MUTED_TEXT[2]);
  const thanks =
    "Terima kasih atas kepercayaan Anda. Pembayaran harus diterima sebelum jatuh tempo. Hubungi support@mvmp.id untuk pertanyaan.";
  const splitThanks = doc.splitTextToSize(thanks, contentWidth);
  doc.text(splitThanks, margin, footerY + 5);

  // Page number
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(MUTED_TEXT[0], MUTED_TEXT[1], MUTED_TEXT[2]);
    doc.text(
      `Halaman ${i} dari ${pageCount}`,
      pageWidth - margin,
      pageHeight - 8,
      { align: "right" }
    );
    doc.text(
      `MVMP · ${invoiceNumber}`,
      margin,
      pageHeight - 8
    );
  }

  // Save
  doc.save(`Invoice-${invoiceNumber}.pdf`);
}
