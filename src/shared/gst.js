export const GST_RATES = [0, 5, 12, 18, 28];

export function toCents(value) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round((numeric + Number.EPSILON) * 100);
}

export function fromCents(cents) {
  return Number((Number(cents || 0) / 100).toFixed(2));
}

function quantityToMilli(value) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round((numeric + Number.EPSILON) * 1000);
}

function taxFor(taxableCents, rate) {
  const basisPoints = Math.round(Number(rate || 0) * 100);
  return Math.round((taxableCents * basisPoints) / 10000);
}

export function calculateLine(item, intraState) {
  const quantityMilli = quantityToMilli(item.quantity);
  const unitPriceCents = toCents(item.unitPrice ?? item.price);
  const grossCents = Math.round((quantityMilli * unitPriceCents) / 1000);
  const discountCents = Math.min(grossCents, Math.max(0, toCents(item.discount)));
  const taxableCents = Math.max(0, grossCents - discountCents);
  const gstCents = taxFor(taxableCents, item.gstRate);
  const cgstCents = intraState ? Math.floor(gstCents / 2) : 0;
  const sgstCents = intraState ? gstCents - cgstCents : 0;
  const igstCents = intraState ? 0 : gstCents;
  const totalCents = taxableCents + gstCents;
  return {
    quantity: Number((quantityMilli / 1000).toFixed(3)),
    unitPrice: fromCents(unitPriceCents),
    discount: fromCents(discountCents),
    taxable: fromCents(taxableCents),
    gstAmount: fromCents(gstCents),
    cgst: fromCents(cgstCents),
    sgst: fromCents(sgstCents),
    igst: fromCents(igstCents),
    total: fromCents(totalCents),
    _cents: { gross: grossCents, discount: discountCents, taxable: taxableCents, gst: gstCents, cgst: cgstCents, sgst: sgstCents, igst: igstCents, total: totalCents },
  };
}

export function calculateInvoice(items = [], options = {}) {
  const intraState = Boolean(options.intraState);
  const lines = items.map((item) => ({ ...item, ...calculateLine(item, intraState) }));
  const sums = lines.reduce((acc, line) => {
    acc.gross += line._cents.gross;
    acc.discount += line._cents.discount;
    acc.taxable += line._cents.taxable;
    acc.gst += line._cents.gst;
    acc.cgst += line._cents.cgst;
    acc.sgst += line._cents.sgst;
    acc.igst += line._cents.igst;
    return acc;
  }, { gross: 0, discount: 0, taxable: 0, gst: 0, cgst: 0, sgst: 0, igst: 0 });
  const charges = toCents(options.otherCharges);
  const roundOff = toCents(options.roundOff);
  const additionalDiscount = Math.min(Math.max(0, toCents(options.additionalDiscount)), Math.max(0, sums.taxable + sums.gst + charges + roundOff));
  const beforeRound = sums.taxable + sums.gst + charges - additionalDiscount;
  const grand = beforeRound + roundOff;
  return {
    lines,
    intraState,
    subtotal: fromCents(sums.gross),
    totalDiscount: fromCents(sums.discount + additionalDiscount),
    taxableValue: fromCents(sums.taxable),
    totalGst: fromCents(sums.gst),
    cgst: fromCents(sums.cgst),
    sgst: fromCents(sums.sgst),
    igst: fromCents(sums.igst),
    otherCharges: fromCents(charges),
    additionalDiscount: fromCents(additionalDiscount),
    roundOff: fromCents(roundOff),
    grandTotal: fromCents(grand),
  };
}

export function formatINR(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value || 0));
}
