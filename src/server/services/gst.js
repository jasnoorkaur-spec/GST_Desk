export { GST_RATES, calculateInvoice, calculateLine, fromCents, toCents } from '../../shared/gst.js';

export function amountToWords(amount) {
  const n = Math.round(Number(amount || 0) * 100) / 100;
  const rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);
  const oneToNineteen = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (x) => x < 20 ? oneToNineteen[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? ` ${oneToNineteen[x % 10]}` : ''}`;
  const three = (x) => `${x >= 100 ? `${oneToNineteen[Math.floor(x / 100)]} Hundred${x % 100 ? ' ' : ''}` : ''}${x % 100 ? two(x % 100) : ''}`.trim();
  let rest = rupees; const parts = [];
  for (const [divisor, label] of [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand']]) { const group = Math.floor(rest / divisor); if (group) parts.push(`${two(group)} ${label}`); rest %= divisor; }
  if (rest) parts.push(three(rest));
  return `${parts.join(' ') || 'Zero'} Rupees${paise ? ` and ${two(paise)} Paise` : ''} Only`;
}
