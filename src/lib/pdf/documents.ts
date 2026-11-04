import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import type {
  Apartment,
  Guest,
  Invoice,
  Quotation,
  ReceiptRecord,
  ReservationView,
  Settings,
} from '../domain/types';
import { normalizeBusinessName, OFFICIAL_BRAND_NAME } from '../brand';

// Exact brand palette derived from logo.jpg
const BRAND_CHARCOAL = rgb(0x1e / 255, 0x25 / 255, 0x30 / 255); // #1E2530
const BRAND_SLATE_DARK = rgb(0x41 / 255, 0x4d / 255, 0x5c / 255); // #414D5C
const BRAND_SLATE = rgb(0x70 / 255, 0x7e / 255, 0x91 / 255); // #707E91
const BRAND_MUTED = rgb(0x52 / 255, 0x60 / 255, 0x70 / 255); // #526070
const BRAND_SURFACE = rgb(0xf7 / 255, 0xf8 / 255, 0xfa / 255); // #F7F8FA
const BRAND_BORDER = rgb(0xdd / 255, 0xe2 / 255, 0xe9 / 255); // #DDE2E9
const BRAND_SUCCESS_BG = rgb(0xec / 255, 0xf7 / 255, 0xf1 / 255);
const BRAND_SUCCESS_TEXT = rgb(0x1e / 255, 0x6b / 255, 0x45 / 255);

function zmw(amount: number): string {
  const n = Math.round(amount * 100) / 100;
  return `ZMW ${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
}

function safeAscii(input: string | null | undefined): string {
  if (!input) return '';
  return String(input)
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u00b7/g, ' | ')
    .replace(/\u2026/g, '...')
    .replace(/[^\x20-\x7E\n]/g, '');
}

const VECTOR_BRAND_PATHS = [
  'M18 82A48 48 0 0 1 52 36.5L48 44A40 40 0 0 0 22 82H18Z',
  'M110 82A48 48 0 0 0 76 36.5L80 44A40 40 0 0 1 106 82H110Z',
  'M48 68V42L64 20V60L48 68Z',
  'M66 23H70V59H66Z',
  'M72 28H76V61H72Z',
  'M78 34H82V64H78Z',
  'M31 76V55L35 52V73L31 76Z',
  'M37 72V51L41 48V70L37 72Z',
  'M85 65V51L101 60V74L85 65Z',
  'M20 88L51 69L81 88H70L51 76L31 88H20Z',
  'M56 71L72 61L112 88H100L72 69L63 75L56 71Z',
  'M47 80H50.5V83.5H47Z',
  'M52 80H55.5V83.5H52Z',
  'M47 85H50.5V88.5H47Z',
  'M52 85H55.5V88.5H52Z',
  'M69 74H72.5V77.5H69Z',
  'M74 74H77.5V77.5H74Z',
  'M69 79H72.5V82.5H69Z',
  'M74 79H77.5V82.5H74Z',
];

function drawVectorBrandMark(page: PDFPage, x: number, bottomY: number, boxSize = 44): number {
  page.drawRectangle({
    x,
    y: bottomY,
    width: boxSize,
    height: boxSize,
    color: BRAND_SURFACE,
    borderColor: BRAND_BORDER,
    borderWidth: 1,
  });

  // SVG viewBox is 0..128 wide by 12..96 tall (center = 64, 54).
  const scale = (boxSize * 0.78) / 128;
  const originX = x + boxSize / 2 - 64 * scale;
  const originY = bottomY + boxSize / 2 + 54 * scale;

  for (const svgPath of VECTOR_BRAND_PATHS) {
    page.drawSvgPath(svgPath, {
      x: originX,
      y: originY,
      scale,
      color: BRAND_SLATE_DARK,
      borderWidth: 0,
    });
  }

  return boxSize;
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const clean = safeAscii(text);
  const paragraphs = clean.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let current = words[0];
    for (let i = 1; i < words.length; i++) {
      const candidate = `${current} ${words[i]}`;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = words[i];
      }
    }
    lines.push(current);
  }
  return lines;
}

interface DocChromeOptions {
  settings: Settings;
  documentTitle: string;
  documentNumber: string;
  statusLabel?: string;
}

async function createStandardA4Document(opts: DocChromeOptions) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`${opts.documentTitle} ${opts.documentNumber} - ${normalizeBusinessName(opts.settings.property.name)}`);
  pdfDoc.setAuthor(normalizeBusinessName(opts.settings.property.legalName || opts.settings.property.name));
  pdfDoc.setCreator(normalizeBusinessName(opts.settings.property.name));

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 portrait
  const { width, height } = page.getSize();
  const margin = 44;

  // Top slate accent rule
  page.drawRectangle({
    x: 0,
    y: height - 6,
    width,
    height: 6,
    color: BRAND_SLATE_DARK,
  });

  let y = height - 42;
  const boxSize = drawVectorBrandMark(page, margin, y - 34, 44);
  const textStartX = margin + boxSize + 12;

  const prop = opts.settings.property;
  page.drawText(safeAscii(normalizeBusinessName(prop.name)).toUpperCase(), {
    x: textStartX,
    y,
    size: 12,
    font: fontBold,
    color: BRAND_CHARCOAL,
  });
  page.drawText(safeAscii(`${prop.addressLine}, ${prop.city}, ${prop.country}`), {
    x: textStartX,
    y: y - 14,
    size: 8.5,
    font: fontRegular,
    color: BRAND_MUTED,
  });
  page.drawText(
    safeAscii(
      `${prop.phone} | ${prop.email}${prop.taxPayerId ? ` | TPIN ${prop.taxPayerId}` : ''}`,
    ),
    {
      x: textStartX,
      y: y - 26,
      size: 8.5,
      font: fontRegular,
      color: BRAND_MUTED,
    },
  );

  // Right-aligned Document Type + Number
  const titleText = safeAscii(opts.documentTitle).toUpperCase();
  const titleW = fontBold.widthOfTextAtSize(titleText, 16);
  page.drawText(titleText, {
    x: width - margin - titleW,
    y,
    size: 16,
    font: fontBold,
    color: BRAND_SLATE_DARK,
  });

  const numText = safeAscii(opts.documentNumber);
  const numW = fontBold.widthOfTextAtSize(numText, 10.5);
  page.drawText(numText, {
    x: width - margin - numW,
    y: y - 16,
    size: 10.5,
    font: fontBold,
    color: BRAND_CHARCOAL,
  });

  if (opts.statusLabel) {
    const badge = safeAscii(opts.statusLabel).toUpperCase();
    const badgeW = fontBold.widthOfTextAtSize(badge, 7.5) + 12;
    page.drawRectangle({
      x: width - margin - badgeW,
      y: y - 34,
      width: badgeW,
      height: 14,
      color: BRAND_SURFACE,
      borderColor: BRAND_BORDER,
      borderWidth: 0.75,
    });
    page.drawText(badge, {
      x: width - margin - badgeW + 6,
      y: y - 29.5,
      size: 7.5,
      font: fontBold,
      color: BRAND_SLATE_DARK,
    });
  }

  y -= 50;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.75,
    color: BRAND_BORDER,
  });

  // Footer
  const footerText = safeAscii(
    `${normalizeBusinessName(prop.legalName || prop.name)} | ${prop.addressLine}, ${prop.city} | ${prop.website}`,
  );
  page.drawLine({
    start: { x: margin, y: 46 },
    end: { x: width - margin, y: 46 },
    thickness: 0.5,
    color: BRAND_BORDER,
  });
  page.drawText(footerText, {
    x: margin,
    y: 32,
    size: 7.5,
    font: fontRegular,
    color: BRAND_MUTED,
  });

  return { pdfDoc, page, fontRegular, fontBold, width, height, margin, cursorY: y - 20 };
}

function drawKeyValueBlock(
  page: PDFPage,
  x: number,
  y: number,
  blockTitle: string,
  rows: [string, string][],
  fontRegular: PDFFont,
  fontBold: PDFFont,
): number {
  page.drawText(safeAscii(blockTitle).toUpperCase(), {
    x,
    y,
    size: 7.5,
    font: fontBold,
    color: BRAND_SLATE,
  });
  let curY = y - 14;
  for (const [label, value] of rows) {
    if (!value) continue;
    page.drawText(safeAscii(label), {
      x,
      y: curY,
      size: 8.5,
      font: fontRegular,
      color: BRAND_MUTED,
    });
    page.drawText(safeAscii(value), {
      x: x + 78,
      y: curY,
      size: 8.5,
      font: fontBold,
      color: BRAND_CHARCOAL,
    });
    curY -= 13;
  }
  return curY;
}

/* ------------------------------------------- 1. Quotation PDF */

export async function generateQuotationPdf(
  quotation: Quotation,
  settings: Settings,
): Promise<Uint8Array> {
  const ctx = await createStandardA4Document({
    settings,
    documentTitle: 'Quotation',
    documentNumber: quotation.quotationNumber,
    statusLabel: quotation.status.replace(/_/g, ' '),
  });
  const { pdfDoc, page, fontRegular, fontBold, width, margin } = ctx;
  let y = ctx.cursorY;

  const leftEndY = drawKeyValueBlock(
    page,
    margin,
    y,
    'Prepared For',
    [
      ['Customer', quotation.customerName],
      ['Company', quotation.customerCompany],
      ['Phone', quotation.customerPhone],
      ['Email', quotation.customerEmail],
      ['Address', quotation.customerAddress],
    ],
    fontRegular,
    fontBold,
  );

  const rightEndY = drawKeyValueBlock(
    page,
    width / 2 + 12,
    y,
    'Stay & Validity Details',
    [
      ['Issue Date', quotation.issueDate],
      ['Valid Until', quotation.expiryDate],
      ['Apartment', `Apt ${quotation.apartmentNumber ?? ''} - ${quotation.apartmentName}`],
      ['Check-in', `${quotation.checkIn} (from ${settings.booking.checkInTime})`],
      ['Check-out', `${quotation.checkOut} (by ${settings.booking.checkOutTime})`],
      ['Duration', `${quotation.nights} night(s) | ${quotation.guestCount} guest(s)`],
    ],
    fontRegular,
    fontBold,
  );

  y = Math.min(leftEndY, rightEndY) - 18;

  // Line Items Table Header
  const tableWidth = width - margin * 2;
  page.drawRectangle({
    x: margin,
    y: y - 20,
    width: tableWidth,
    height: 22,
    color: BRAND_SLATE_DARK,
  });
  page.drawText('DESCRIPTION', { x: margin + 10, y: y - 13, size: 8, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('QTY', { x: margin + 285, y: y - 13, size: 8, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('UNIT RATE', { x: margin + 350, y: y - 13, size: 8, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('AMOUNT', { x: margin + 435, y: y - 13, size: 8, font: fontBold, color: rgb(1, 1, 1) });
  y -= 20;

  for (const item of quotation.lineItems) {
    y -= 22;
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 0.5,
      color: BRAND_BORDER,
    });
    page.drawText(safeAscii(item.description).slice(0, 56), {
      x: margin + 10,
      y: y + 7,
      size: 8.5,
      font: fontRegular,
      color: BRAND_CHARCOAL,
    });
    page.drawText(safeAscii(`${item.quantity} ${item.unitLabel}`), {
      x: margin + 285,
      y: y + 7,
      size: 8.5,
      font: fontRegular,
      color: BRAND_MUTED,
    });
    page.drawText(zmw(item.unitPrice), {
      x: margin + 350,
      y: y + 7,
      size: 8.5,
      font: fontRegular,
      color: BRAND_CHARCOAL,
    });
    page.drawText(zmw(item.amount), {
      x: margin + 435,
      y: y + 7,
      size: 8.5,
      font: fontBold,
      color: BRAND_CHARCOAL,
    });
  }

  y -= 20;

  // Totals Summary Box
  const sumX = width - margin - 220;
  const drawTotalRow = (label: string, val: string, bold = false) => {
    page.drawText(safeAscii(label), {
      x: sumX,
      y,
      size: bold ? 9.5 : 8.5,
      font: bold ? fontBold : fontRegular,
      color: bold ? BRAND_CHARCOAL : BRAND_MUTED,
    });
    const valW = (bold ? fontBold : fontRegular).widthOfTextAtSize(val, bold ? 9.5 : 8.5);
    page.drawText(val, {
      x: width - margin - valW,
      y,
      size: bold ? 9.5 : 8.5,
      font: bold ? fontBold : fontRegular,
      color: BRAND_CHARCOAL,
    });
    y -= 15;
  };

  drawTotalRow('Subtotal', zmw(quotation.subtotal));
  if (quotation.discount > 0) {
    drawTotalRow('Discount', `- ${zmw(quotation.discount)}`);
  }
  if (quotation.taxRatePercent > 0) {
    drawTotalRow(
      `${quotation.taxName} (${quotation.taxRatePercent}% ${quotation.taxInclusive ? 'incl.' : 'excl.'})`,
      zmw(quotation.taxAmount),
    );
  }
  page.drawLine({
    start: { x: sumX, y: y + 8 },
    end: { x: width - margin, y: y + 8 },
    thickness: 1,
    color: BRAND_CHARCOAL,
  });
  drawTotalRow('Total Quoted Amount', zmw(quotation.totalAmount), true);
  drawTotalRow(
    `Deposit Required (${quotation.depositPercent}%)`,
    zmw(quotation.depositRequired),
  );

  y -= 14;
  // Payment Instructions & Terms
  if (quotation.paymentInstructions) {
    page.drawText('PAYMENT CHANNELS', {
      x: margin,
      y,
      size: 8,
      font: fontBold,
      color: BRAND_SLATE_DARK,
    });
    y -= 13;
    for (const line of wrapText(quotation.paymentInstructions, fontRegular, 8, tableWidth)) {
      if (y < 95) break;
      page.drawText(line, { x: margin, y, size: 8, font: fontRegular, color: BRAND_MUTED });
      y -= 11;
    }
  }

  if (quotation.termsAndConditions && y > 105) {
    y -= 8;
    page.drawText('TERMS & CONDITIONS', {
      x: margin,
      y,
      size: 8,
      font: fontBold,
      color: BRAND_SLATE_DARK,
    });
    y -= 13;
    for (const line of wrapText(quotation.termsAndConditions, fontRegular, 7.8, tableWidth)) {
      if (y < 62) break;
      page.drawText(line, { x: margin, y, size: 7.8, font: fontRegular, color: BRAND_MUTED });
      y -= 10.5;
    }
  }

  return pdfDoc.save();
}

/* ------------------------------------------- 2. Tax Invoice PDF */

export async function generateInvoicePdf(
  invoice: Invoice,
  settings: Settings,
): Promise<Uint8Array> {
  const ctx = await createStandardA4Document({
    settings,
    documentTitle: settings.tax?.enabled ? 'Tax Invoice' : 'Invoice',
    documentNumber: invoice.invoiceNumber,
    statusLabel: invoice.status.replace(/_/g, ' '),
  });
  const { pdfDoc, page, fontRegular, fontBold, width, margin } = ctx;
  let y = ctx.cursorY;

  const leftEndY = drawKeyValueBlock(
    page,
    margin,
    y,
    'Billed To',
    [
      ['Customer', invoice.customerName],
      ['Company', invoice.customerCompany],
      ['Customer TPIN', invoice.customerTpin],
      ['Phone', invoice.customerPhone],
      ['Email', invoice.customerEmail],
    ],
    fontRegular,
    fontBold,
  );

  const rightEndY = drawKeyValueBlock(
    page,
    width / 2 + 12,
    y,
    'Invoice & Stay Summary',
    [
      ['Issue Date', invoice.issueDate],
      ['Due Date', invoice.dueDate],
      ['Apartment', `Apt ${invoice.apartmentNumber ?? ''} - ${invoice.apartmentName}`],
      ['Check-in / Out', `${invoice.checkIn} to ${invoice.checkOut}`],
      ['Stay Length', `${invoice.nights} night(s) | ${invoice.guestCount} guest(s)`],
    ],
    fontRegular,
    fontBold,
  );

  y = Math.min(leftEndY, rightEndY) - 18;
  const tableWidth = width - margin * 2;

  page.drawRectangle({
    x: margin,
    y: y - 20,
    width: tableWidth,
    height: 22,
    color: BRAND_SLATE_DARK,
  });
  page.drawText('DESCRIPTION', { x: margin + 10, y: y - 13, size: 8, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('QTY', { x: margin + 285, y: y - 13, size: 8, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('UNIT RATE', { x: margin + 350, y: y - 13, size: 8, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('AMOUNT', { x: margin + 435, y: y - 13, size: 8, font: fontBold, color: rgb(1, 1, 1) });
  y -= 20;

  for (const item of invoice.lineItems) {
    y -= 22;
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 0.5,
      color: BRAND_BORDER,
    });
    page.drawText(safeAscii(item.description).slice(0, 56), {
      x: margin + 10,
      y: y + 7,
      size: 8.5,
      font: fontRegular,
      color: BRAND_CHARCOAL,
    });
    page.drawText(safeAscii(`${item.quantity} ${item.unitLabel}`), {
      x: margin + 285,
      y: y + 7,
      size: 8.5,
      font: fontRegular,
      color: BRAND_MUTED,
    });
    page.drawText(zmw(item.unitPrice), {
      x: margin + 350,
      y: y + 7,
      size: 8.5,
      font: fontRegular,
      color: BRAND_CHARCOAL,
    });
    page.drawText(zmw(item.amount), {
      x: margin + 435,
      y: y + 7,
      size: 8.5,
      font: fontBold,
      color: BRAND_CHARCOAL,
    });
  }

  y -= 20;
  const sumX = width - margin - 220;
  const drawRow = (label: string, val: string, bold = false) => {
    page.drawText(safeAscii(label), {
      x: sumX,
      y,
      size: bold ? 9.5 : 8.5,
      font: bold ? fontBold : fontRegular,
      color: bold ? BRAND_CHARCOAL : BRAND_MUTED,
    });
    const valW = (bold ? fontBold : fontRegular).widthOfTextAtSize(val, bold ? 9.5 : 8.5);
    page.drawText(val, {
      x: width - margin - valW,
      y,
      size: bold ? 9.5 : 8.5,
      font: bold ? fontBold : fontRegular,
      color: BRAND_CHARCOAL,
    });
    y -= 15;
  };

  drawRow('Subtotal', zmw(invoice.subtotal));
  if (invoice.discount > 0) drawRow('Discount', `- ${zmw(invoice.discount)}`);
  if (invoice.taxRatePercent > 0) {
    drawRow(
      `${invoice.taxName} (${invoice.taxRatePercent}% ${invoice.taxInclusive ? 'incl.' : 'excl.'})`,
      zmw(invoice.taxAmount),
    );
  }
  page.drawLine({
    start: { x: sumX, y: y + 8 },
    end: { x: width - margin, y: y + 8 },
    thickness: 1,
    color: BRAND_CHARCOAL,
  });
  drawRow('Invoice Total', zmw(invoice.totalAmount), true);
  drawRow('Verified Payments Received', zmw(invoice.verifiedPaid));
  drawRow('Balance Due', zmw(invoice.balanceDue), true);

  y -= 16;
  if (invoice.paymentInstructions) {
    page.drawText('REMITTANCE INSTRUCTIONS', {
      x: margin,
      y,
      size: 8,
      font: fontBold,
      color: BRAND_SLATE_DARK,
    });
    y -= 13;
    for (const line of wrapText(invoice.paymentInstructions, fontRegular, 8, tableWidth)) {
      if (y < 65) break;
      page.drawText(line, { x: margin, y, size: 8, font: fontRegular, color: BRAND_MUTED });
      y -= 11;
    }
  }

  return pdfDoc.save();
}

/* ------------------------------------------- 3. Official Payment Receipt PDF */

export async function generateReceiptPdf(
  receipt: ReceiptRecord,
  settings: Settings,
): Promise<Uint8Array> {
  const ctx = await createStandardA4Document({
    settings,
    documentTitle: 'Official Receipt',
    documentNumber: receipt.receiptNumber,
    statusLabel: 'Verified Payment',
  });
  const { pdfDoc, page, fontRegular, fontBold, width, margin } = ctx;
  let y = ctx.cursorY;

  // Highlighted Verified Amount Banner
  const bannerWidth = width - margin * 2;
  page.drawRectangle({
    x: margin,
    y: y - 54,
    width: bannerWidth,
    height: 54,
    color: BRAND_SUCCESS_BG,
    borderColor: BRAND_SUCCESS_TEXT,
    borderWidth: 0.75,
  });
  page.drawText('AMOUNT RECEIVED & VERIFIED', {
    x: margin + 16,
    y: y - 20,
    size: 8,
    font: fontBold,
    color: BRAND_SUCCESS_TEXT,
  });
  page.drawText(zmw(receipt.amount), {
    x: margin + 16,
    y: y - 40,
    size: 18,
    font: fontBold,
    color: BRAND_CHARCOAL,
  });
  page.drawText(
    safeAscii(`Verified by ${receipt.verifiedBy} on ${receipt.verifiedAt.slice(0, 10)}`),
    {
      x: margin + 260,
      y: y - 34,
      size: 8.5,
      font: fontRegular,
      color: BRAND_SUCCESS_TEXT,
    },
  );

  y -= 74;

  const leftEndY = drawKeyValueBlock(
    page,
    margin,
    y,
    'Received From',
    [
      ['Guest Name', receipt.customerName],
      ['Phone', receipt.customerPhone],
      ['Email', receipt.customerEmail],
      ['Booking Ref', receipt.bookingReference],
      ['Apartment', `Apt ${receipt.apartmentNumber} - ${receipt.apartmentName}`],
      [
        'Check-in',
        receipt.checkIn ? `${receipt.checkIn}${receipt.nights ? ` (${receipt.nights} night${receipt.nights === 1 ? '' : 's'})` : ''}` : '',
      ],
      ['Check-out', receipt.checkOut ?? ''],
    ],
    fontRegular,
    fontBold,
  );

  const rightEndY = drawKeyValueBlock(
    page,
    width / 2 + 12,
    y,
    'Payment & Account Summary',
    [
      ['Payment Date', receipt.paidAt],
      ['Method', receipt.method.replace(/_/g, ' ').toUpperCase()],
      ['Trans. Ref', receipt.transactionReference],
      ...(receipt.paymentDestination ? [['Paid To', receipt.paymentDestination] as [string, string]] : []),
      ['Stay Total', zmw(receipt.totalBookingAmount)],
      ['Amount Received', zmw(receipt.amount)],
      ['Verified Paid', zmw(receipt.totalVerifiedPaid)],
      ['Balance Due', zmw(receipt.remainingBalance)],
      ['Approved On', receipt.verifiedAt.slice(0, 10)],
    ],
    fontRegular,
    fontBold,
  );

  y = Math.min(leftEndY, rightEndY) - 28;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: BRAND_BORDER,
  });
  y -= 18;
  page.drawText(
    safeAscii(
      `This receipt confirms verified settlement recorded in the ${OFFICIAL_BRAND_NAME} property ledger.`,
    ),
    {
      x: margin,
      y,
      size: 8.5,
      font: fontRegular,
      color: BRAND_MUTED,
    },
  );

  return pdfDoc.save();
}

/* ------------------------------------------- 4. Booking Confirmation PDF */

export async function generateBookingConfirmationPdf(
  reservation: ReservationView,
  apartment: Apartment | null,
  guest: Guest | null,
  settings: Settings,
): Promise<Uint8Array> {
  const ctx = await createStandardA4Document({
    settings,
    documentTitle: 'Booking Confirmation',
    documentNumber: reservation.reference,
    statusLabel: reservation.status.replace(/_/g, ' '),
  });
  const { pdfDoc, page, fontRegular, fontBold, width, margin } = ctx;
  let y = ctx.cursorY;

  const leftEndY = drawKeyValueBlock(
    page,
    margin,
    y,
    'Guest Details',
    [
      ['Guest Name', guest?.fullName ?? 'Registered Guest'],
      ['Phone', guest?.phone ?? ''],
      ['Email', guest?.email ?? ''],
      ['Guests', `${reservation.guestCount} guest(s)`],
      ['Arrival Time', reservation.arrivalTime || settings.booking.checkInTime],
    ],
    fontRegular,
    fontBold,
  );

  const rightEndY = drawKeyValueBlock(
    page,
    width / 2 + 12,
    y,
    'Accommodation & Financial Summary',
    [
      ['Apartment', apartment ? `Apt ${apartment.number} - ${apartment.name}` : 'Assigned Unit'],
      ['Check-in', `${reservation.checkIn} (from ${settings.booking.checkInTime})`],
      ['Check-out', `${reservation.checkOut} (by ${settings.booking.checkOutTime})`],
      ['Duration', `${reservation.nights} night(s) @ ${zmw(reservation.nightlyRate)}/night`],
      ['Total Amount', zmw(reservation.totalAmount)],
      ['Verified Paid', zmw(reservation.verifiedPaid)],
      ['Balance Due', zmw(reservation.balanceDue)],
    ],
    fontRegular,
    fontBold,
  );

  y = Math.min(leftEndY, rightEndY) - 24;
  page.drawRectangle({
    x: margin,
    y: y - 78,
    width: width - margin * 2,
    height: 78,
    color: BRAND_SURFACE,
    borderColor: BRAND_BORDER,
    borderWidth: 0.75,
  });
  page.drawText('ARRIVAL & HOUSE INFORMATION', {
    x: margin + 12,
    y: y - 16,
    size: 8,
    font: fontBold,
    color: BRAND_SLATE_DARK,
  });

  const infoLines = wrapText(
    `Address: ${settings.property.addressLine}, ${settings.property.city}. Check-in opens at ${settings.booking.checkInTime}; check-out is by ${settings.booking.checkOutTime}. Please present a valid ID on arrival. Policy: ${settings.booking.cancellationText}`,
    fontRegular,
    8,
    width - margin * 2 - 24,
  );
  let infoY = y - 30;
  for (const line of infoLines.slice(0, 4)) {
    page.drawText(line, { x: margin + 12, y: infoY, size: 8, font: fontRegular, color: BRAND_MUTED });
    infoY -= 11.5;
  }

  return pdfDoc.save();
}
