import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, inArray, like, lte, or, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { auditEvents, businessProfiles, customers, invoiceItems, invoices, payments, products, users } from '../db/schema.js';
import { asyncRoute, validateBody } from '../middleware.js';
import { requireAuth, requireCsrf } from '../security/auth.js';
import { customerInput, invoiceInput, paymentInput, productInput, profileInput } from '../validation.js';
import { calculateInvoice, calculateLine } from '../services/gst.js';
import { toCsv } from '../services/csv.js';

const router = Router();
router.use(requireAuth);
router.use((req, res, next) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? requireCsrf(req, res, next) : next());
const uid = (req) => req.authUserId;
const numeric = (value) => Number(value || 0);
const moneyString = (value) => Number(value || 0).toFixed(2);
const dateToday = () => new Date().toISOString().slice(0, 10);
const matchesGstin = (value) => !value || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i.test(value);

async function audit(tx, userId, type, entityId, action, details = {}) {
  await tx.insert(auditEvents).values({ id: randomUUID(), userId, entityType: type, entityId, action, details });
}
async function getProfile(userId, executor = db) {
  const [profile] = await executor.select().from(businessProfiles).where(eq(businessProfiles.userId, userId)).limit(1);
  return profile || null;
}
async function getOwnedInvoice(userId, invoiceId, executor = db) {
  const [invoice] = await executor.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.userId, userId))).limit(1);
  return invoice || null;
}
function makeInvoiceNumber(profile, number, year) {
  return `${profile.invoicePrefix || 'INV'}-${year}-${String(number).padStart(4, '0')}`;
}
function totalsToRecord(totals) {
  return Object.fromEntries(['subtotal','totalDiscount','taxableValue','totalGst','cgst','sgst','igst','otherCharges','additionalDiscount','roundOff','grandTotal'].map((key) => [key, moneyString(totals[key])]));
}
function parseFilters(query, userId) {
  const filters = [eq(invoices.userId, userId)];
  const search = String(query.search || '').trim();
  if (search) filters.push(or(like(invoices.invoiceNumber, `%${search}%`), like(sql`JSON_UNQUOTE(JSON_EXTRACT(${invoices.customerSnapshot}, '$.name'))`, `%${search}%`)));
  if (query.status && ['draft','finalized','cancelled'].includes(query.status)) filters.push(eq(invoices.status, query.status));
  if (query.paymentStatus && ['paid','unpaid','partially_paid'].includes(query.paymentStatus)) filters.push(eq(invoices.paymentStatus, query.paymentStatus));
  if (query.from) filters.push(gte(invoices.invoiceDate, String(query.from)));
  if (query.to) filters.push(lte(invoices.invoiceDate, String(query.to)));
  if (query.minAmount !== undefined && query.minAmount !== '') filters.push(gte(invoices.grandTotal, String(Math.max(0, Number(query.minAmount) || 0))));
  if (query.maxAmount !== undefined && query.maxAmount !== '') filters.push(lte(invoices.grandTotal, String(Math.max(0, Number(query.maxAmount) || 0))));
  return filters;
}
function invoiceListRecord(invoice) {
  return { id: invoice.id, invoiceNumber: invoice.invoiceNumber, invoiceDate: invoice.invoiceDate, dueDate: invoice.dueDate, customerName: invoice.customerSnapshot?.name || 'Walk-in customer', customerId: invoice.customerId, status: invoice.status, paymentStatus: invoice.paymentStatus, grandTotal: numeric(invoice.grandTotal), totalGst: numeric(invoice.totalGst), amountPaid: numeric(invoice.amountPaid) };
}

router.get('/dashboard', asyncRoute(async (req, res) => {
  const userId = uid(req);
  const [profile] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, userId)).limit(1);
  const [customerRows, productRows, invoiceRows] = await Promise.all([
    db.select({ id: customers.id }).from(customers).where(eq(customers.userId, userId)),
    db.select({ id: products.id }).from(products).where(eq(products.userId, userId)),
    db.select().from(invoices).where(and(eq(invoices.userId, userId), eq(invoices.status, 'finalized'))).orderBy(desc(invoices.invoiceDate)),
  ]);
  const year = new Date().getFullYear();
  const monthly = Array.from({ length: 12 }, (_, i) => ({ label: new Date(year, i, 1).toLocaleString('en-IN', { month: 'short' }), total: 0 }));
  let totalSales = 0, totalGst = 0;
  for (const invoice of invoiceRows) {
    totalSales += numeric(invoice.grandTotal);
    totalGst += numeric(invoice.totalGst);
    const month = Number(String(invoice.invoiceDate).slice(5, 7)) - 1;
    if (String(invoice.invoiceDate).startsWith(String(year)) && month >= 0 && month < 12) monthly[month].total += numeric(invoice.grandTotal);
  }
  res.json({ profile, stats: { totalSales: Number(totalSales.toFixed(2)), totalGst: Number(totalGst.toFixed(2)), invoiceCount: invoiceRows.length, customerCount: customerRows.length, productCount: productRows.length }, monthlySales: monthly, recentInvoices: invoiceRows.slice(0, 6).map(invoiceListRecord) });
}));

router.get('/settings/profile', asyncRoute(async (req, res) => {
  const profile = await getProfile(uid(req));
  const [user] = await db.select({ mfaEnabled: users.mfaEnabled }).from(users).where(eq(users.id, uid(req))).limit(1);
  const { emailConfigured } = await import('../services/email.js');
  res.json({ profile, security: { mfaEnabled: Boolean(user?.mfaEnabled), emailConfigured: emailConfigured() } });
}));

router.put('/settings/profile', validateBody(profileInput), asyncRoute(async (req, res) => {
  const profile = await getProfile(uid(req));
  if (!profile) return res.status(404).json({ message: 'Business profile not found.' });
  const values = req.validatedBody;
  if (!matchesGstin(values.gstin)) return res.status(400).json({ message: 'Enter a valid GSTIN.' });
  const bankDetails = { bankName: values.bankName || '', bankAccount: values.bankAccount || '', bankIfsc: (values.bankIfsc || '').toUpperCase() };
  await db.update(businessProfiles).set({ businessName: values.businessName, address: values.address || '', gstin: values.gstin?.toUpperCase() || '', state: values.state || '', stateCode: values.stateCode || '', contactNumber: values.contactNumber || '', email: values.email || '', bankDetails, invoicePrefix: values.invoicePrefix, defaultPaymentTerms: values.defaultPaymentTerms, defaultNotes: values.defaultNotes || '', updatedAt: new Date() }).where(and(eq(businessProfiles.id, profile.id), eq(businessProfiles.userId, uid(req))));
  const updated = await getProfile(uid(req));
  res.json({ profile: updated, message: 'Business profile saved.' });
}));

router.patch('/settings/security', asyncRoute(async (req, res) => {
  const enabled = Boolean(req.body?.mfaEnabled);
  if (enabled) {
    const { emailConfigured } = await import('../services/email.js');
    if (!emailConfigured()) return res.status(400).json({ message: 'Add SMTP email settings before enabling email verification.' });
  }
  await db.update(users).set({ mfaEnabled: enabled, updatedAt: new Date() }).where(eq(users.id, uid(req)));
  res.json({ mfaEnabled: enabled, message: enabled ? 'Email verification is enabled.' : 'Email verification is disabled.' });
}));

router.get('/customers', asyncRoute(async (req, res) => {
  const userId = uid(req); const search = String(req.query.search || '').trim();
  const conditions = [eq(customers.userId, userId)];
  if (search) conditions.push(or(like(customers.name, `%${search}%`), like(customers.mobile, `%${search}%`), like(customers.gstin, `%${search}%`)));
  const rows = await db.select().from(customers).where(and(...conditions)).orderBy(customers.name).limit(500);
  const counts = rows.length ? await db.select({ customerId: invoices.customerId, count: sql`count(*)` }).from(invoices).where(and(eq(invoices.userId, userId), inArray(invoices.customerId, rows.map((r) => r.id)))).groupBy(invoices.customerId) : [];
  const countById = new Map(counts.map((row) => [row.customerId, Number(row.count)]));
  res.json({ customers: rows.map((row) => ({ ...row, invoiceCount: countById.get(row.id) || 0 })) });
}));
router.post('/customers', validateBody(customerInput), asyncRoute(async (req, res) => {
  const values = req.validatedBody; if (!matchesGstin(values.gstin)) return res.status(400).json({ message: 'Enter a valid GSTIN.' });
  const record = { ...values, id: randomUUID(), userId: uid(req), gstin: values.gstin?.toUpperCase() || '', email: values.email || '', address: values.address || '' };
  await db.insert(customers).values(record); res.status(201).json({ customer: record, message: 'Customer added.' });
}));
router.put('/customers/:id', validateBody(customerInput), asyncRoute(async (req, res) => {
  const values = req.validatedBody; const userId = uid(req);
  const [existing] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.id, req.params.id), eq(customers.userId, userId))).limit(1);
  if (!existing) return res.status(404).json({ message: 'Customer not found.' });
  if (!matchesGstin(values.gstin)) return res.status(400).json({ message: 'Enter a valid GSTIN.' });
  await db.update(customers).set({ ...values, gstin: values.gstin?.toUpperCase() || '', email: values.email || '', address: values.address || '', updatedAt: new Date() }).where(and(eq(customers.id, req.params.id), eq(customers.userId, userId)));
  res.json({ message: 'Customer updated.' });
}));
router.delete('/customers/:id', asyncRoute(async (req, res) => {
  const userId = uid(req); const [record] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.id, req.params.id), eq(customers.userId, userId))).limit(1);
  if (!record) return res.status(404).json({ message: 'Customer not found.' });
  await db.transaction(async (tx) => { await audit(tx, userId, 'customer', record.id, 'deleted'); await tx.delete(customers).where(and(eq(customers.id, record.id), eq(customers.userId, userId))); });
  res.json({ message: 'Customer deleted. Saved invoices keep their original billing details.' });
}));

router.get('/products', asyncRoute(async (req, res) => {
  const userId = uid(req); const search = String(req.query.search || '').trim();
  const conditions = [eq(products.userId, userId)];
  if (search) conditions.push(or(like(products.name, `%${search}%`), like(products.hsn, `%${search}%`)));
  const rows = await db.select().from(products).where(and(...conditions)).orderBy(products.name).limit(500);
  res.json({ products: rows.map((row) => ({ ...row, price: numeric(row.price), gstRate: numeric(row.gstRate), stock: numeric(row.stock) })) });
}));
router.post('/products', validateBody(productInput), asyncRoute(async (req, res) => {
  const values = req.validatedBody; const record = { ...values, id: randomUUID(), userId: uid(req), price: moneyString(values.price), gstRate: Number(values.gstRate).toFixed(2), stock: Number(values.stock).toFixed(3), hsn: values.hsn || '' };
  await db.insert(products).values(record); res.status(201).json({ product: record, message: 'Product added.' });
}));
router.put('/products/:id', validateBody(productInput), asyncRoute(async (req, res) => {
  const userId = uid(req); const values = req.validatedBody;
  const [existing] = await db.select({ id: products.id }).from(products).where(and(eq(products.id, req.params.id), eq(products.userId, userId))).limit(1);
  if (!existing) return res.status(404).json({ message: 'Product not found.' });
  await db.update(products).set({ ...values, price: moneyString(values.price), gstRate: Number(values.gstRate).toFixed(2), stock: Number(values.stock).toFixed(3), hsn: values.hsn || '', updatedAt: new Date() }).where(and(eq(products.id, req.params.id), eq(products.userId, userId)));
  res.json({ message: 'Product updated.' });
}));
router.delete('/products/:id', asyncRoute(async (req, res) => {
  const userId = uid(req); const [existing] = await db.select({ id: products.id }).from(products).where(and(eq(products.id, req.params.id), eq(products.userId, userId))).limit(1);
  if (!existing) return res.status(404).json({ message: 'Product not found.' });
  await db.transaction(async (tx) => { await audit(tx, userId, 'product', existing.id, 'deleted'); await tx.delete(products).where(and(eq(products.id, existing.id), eq(products.userId, userId))); });
  res.json({ message: 'Product deleted. Saved invoices keep their item snapshots.' });
}));

router.get('/invoices', asyncRoute(async (req, res) => {
  const rows = await db.select().from(invoices).where(and(...parseFilters(req.query, uid(req)))).orderBy(desc(invoices.invoiceDate), desc(invoices.createdAt)).limit(1000);
  res.json({ invoices: rows.map(invoiceListRecord) });
}));
router.get('/invoices/:id', asyncRoute(async (req, res) => {
  const invoice = await getOwnedInvoice(uid(req), req.params.id);
  if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });
  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id));
  res.json({ invoice: { ...invoiceListRecord(invoice), ...invoice, grandTotal: numeric(invoice.grandTotal), subtotal: numeric(invoice.subtotal), totalDiscount: numeric(invoice.totalDiscount), taxableValue: numeric(invoice.taxableValue), totalGst: numeric(invoice.totalGst), cgst: numeric(invoice.cgst), sgst: numeric(invoice.sgst), igst: numeric(invoice.igst), otherCharges: numeric(invoice.otherCharges), additionalDiscount: numeric(invoice.additionalDiscount), roundOff: numeric(invoice.roundOff), amountPaid: numeric(invoice.amountPaid), business: invoice.businessSnapshot, customer: invoice.customerSnapshot }, items: items.map((item) => ({ ...item, quantity: numeric(item.quantity), unitPrice: numeric(item.unitPrice), discount: numeric(item.discount), gstRate: numeric(item.gstRate), taxable: numeric(item.taxable), gstAmount: numeric(item.gstAmount), cgst: numeric(item.cgst), sgst: numeric(item.sgst), igst: numeric(item.igst), total: numeric(item.total) })) });
}));

router.post('/invoices', validateBody(invoiceInput), asyncRoute(async (req, res) => {
  const userId = uid(req); const body = req.validatedBody;
  const profile = await getProfile(userId);
  if (!profile?.businessName || !profile.stateCode) return res.status(400).json({ message: 'Complete your business name and state in Business settings before creating an invoice.' });
  let customer = body.customer;
  let customerId = null;
  if (body.customerId) {
    const [savedCustomer] = await db.select().from(customers).where(and(eq(customers.id, body.customerId), eq(customers.userId, userId))).limit(1);
    if (!savedCustomer) return res.status(400).json({ message: 'The selected customer could not be found.' });
    customer = savedCustomer; customerId = savedCustomer.id;
  }
  if (!customer?.name || !customer.stateCode) return res.status(400).json({ message: 'Add the customer name and state code to calculate GST correctly.' });
  if (customer.customerType === 'registered' && !customer.gstin) return res.status(400).json({ message: 'GSTIN is required for a registered customer.' });
  if (!matchesGstin(customer.gstin)) return res.status(400).json({ message: 'Enter a valid customer GSTIN.' });
  const intraState = String(profile.stateCode) === String(customer.stateCode);
  const productIds = [...new Set(body.items.map((item) => item.productId).filter(Boolean))];
  const productRows = productIds.length ? await db.select().from(products).where(and(eq(products.userId, userId), inArray(products.id, productIds))) : [];
  if (productRows.length !== productIds.length) return res.status(400).json({ message: 'One of the selected products is no longer available.' });
  const productsById = new Map(productRows.map((product) => [product.id, product]));
  const lines = body.items.map((item) => {
    const product = item.productId ? productsById.get(item.productId) : null;
    const source = product ? { ...item, name: product.name, hsn: product.hsn || '', description: product.description || '', unit: product.unit, gstRate: body.docType === 'bill_of_supply' ? 0 : numeric(product.gstRate), unitPrice: item.unitPrice ?? numeric(product.price) } : item;
    return { ...source, ...calculateLine(source, intraState) };
  });
  const totals = calculateInvoice(lines, { intraState, otherCharges: body.otherCharges, additionalDiscount: body.additionalDiscount, roundOff: body.roundOff });
  const id = randomUUID();
  const customerSnapshot = { name: customer.name, mobile: customer.mobile || '', email: customer.email || '', address: customer.address || '', state: customer.state || '', stateCode: customer.stateCode || '', gstin: customer.gstin || '', customerType: customer.customerType || 'unregistered' };
  const businessSnapshot = { businessName: profile.businessName, address: profile.address || '', gstin: profile.gstin || '', state: profile.state || '', stateCode: profile.stateCode || '', contactNumber: profile.contactNumber || '', email: profile.email || '', bankDetails: profile.bankDetails || {}, logoUrl: profile.logoUrl || '' };
  const prefix = profile.invoicePrefix || 'INV';
  let invoiceNumber;
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM business_profiles WHERE id = ${profile.id} FOR UPDATE`);
    const [lockedProfile] = await tx.select().from(businessProfiles).where(eq(businessProfiles.id, profile.id)).limit(1);
    const next = Number(lockedProfile.nextInvoiceNumber || 1);
    invoiceNumber = makeInvoiceNumber(lockedProfile, next, String(body.invoiceDate).slice(0, 4));
    await tx.update(businessProfiles).set({ nextInvoiceNumber: next + 1 }).where(eq(businessProfiles.id, profile.id));
    const docType = body.docType === 'bill_of_supply' ? 'bill_of_supply' : 'tax_invoice';
    await tx.insert(invoices).values({ id, userId, businessProfileId: profile.id, customerId, invoiceNumber, status: 'draft', invoiceDate: body.invoiceDate, dueDate: body.dueDate || null, placeOfSupply: body.placeOfSupply || customer.state || '', supplyStateCode: customer.stateCode, intraState, docType, customerSnapshot, businessSnapshot, ...totalsToRecord(totals), paymentStatus: 'unpaid', notes: body.notes || '', terms: body.terms || '', amountPaid: '0.00' });
    for (const line of totals.lines) {
      await tx.insert(invoiceItems).values({ id: randomUUID(), invoiceId: id, productId: line.productId || null, name: line.name, hsn: line.hsn || '', description: line.description || '', quantity: Number(line.quantity).toFixed(3), unit: line.unit || 'pcs', unitPrice: moneyString(line.unitPrice), discount: moneyString(line.discount), gstRate: Number(line.gstRate).toFixed(2), taxable: moneyString(line.taxable), gstAmount: moneyString(line.gstAmount), cgst: moneyString(line.cgst), sgst: moneyString(line.sgst), igst: moneyString(line.igst), total: moneyString(line.total) });
    }
    await audit(tx, userId, 'invoice', id, 'created', { invoiceNumber, status: 'draft' });
  });
  res.status(201).json({ id, invoiceNumber, totals, status: 'draft', message: 'Invoice draft saved.' });
}));

router.post('/invoices/:id/finalize', asyncRoute(async (req, res) => {
  const userId = uid(req);
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM invoices WHERE id = ${req.params.id} AND user_id = ${userId} FOR UPDATE`);
    const invoice = await getOwnedInvoice(userId, req.params.id, tx);
    if (!invoice) { const error = new Error('Invoice not found.'); error.status = 404; throw error; }
    if (invoice.status !== 'draft') { const error = new Error('Only a draft invoice can be finalized.'); error.status = 409; throw error; }
    const items = await tx.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id));
    for (const item of items) {
      if (!item.productId) continue;
      await tx.execute(sql`SELECT id FROM products WHERE id = ${item.productId} AND user_id = ${userId} FOR UPDATE`);
      const [product] = await tx.select().from(products).where(and(eq(products.id, item.productId), eq(products.userId, userId))).limit(1);
      if (!product) continue;
      const available = numeric(product.stock); const requested = numeric(item.quantity);
      if (available < requested) { const error = new Error(`Not enough stock for ${product.name}. Available: ${available} ${product.unit}.`); error.status = 409; throw error; }
      await tx.update(products).set({ stock: (available - requested).toFixed(3), updatedAt: new Date() }).where(and(eq(products.id, product.id), eq(products.userId, userId)));
    }
    await tx.update(invoices).set({ status: 'finalized', finalizedAt: new Date(), updatedAt: new Date() }).where(and(eq(invoices.id, invoice.id), eq(invoices.userId, userId)));
    await audit(tx, userId, 'invoice', invoice.id, 'finalized', { invoiceNumber: invoice.invoiceNumber });
  });
  res.json({ message: 'Invoice finalized.' });
}));

router.post('/invoices/:id/cancel', asyncRoute(async (req, res) => {
  const userId = uid(req);
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM invoices WHERE id = ${req.params.id} AND user_id = ${userId} FOR UPDATE`);
    const invoice = await getOwnedInvoice(userId, req.params.id, tx);
    if (!invoice) { const error = new Error('Invoice not found.'); error.status = 404; throw error; }
    if (invoice.status === 'cancelled') { const error = new Error('This invoice is already cancelled.'); error.status = 409; throw error; }
    if (invoice.status === 'finalized') {
      const items = await tx.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id));
      for (const item of items) if (item.productId) {
        await tx.execute(sql`SELECT id FROM products WHERE id = ${item.productId} AND user_id = ${userId} FOR UPDATE`);
        const [product] = await tx.select().from(products).where(and(eq(products.id, item.productId), eq(products.userId, userId))).limit(1);
        if (product) await tx.update(products).set({ stock: (numeric(product.stock) + numeric(item.quantity)).toFixed(3), updatedAt: new Date() }).where(eq(products.id, product.id));
      }
    }
    await tx.update(invoices).set({ status: 'cancelled', updatedAt: new Date() }).where(and(eq(invoices.id, invoice.id), eq(invoices.userId, userId)));
    await audit(tx, userId, 'invoice', invoice.id, 'cancelled', { invoiceNumber: invoice.invoiceNumber, previousStatus: invoice.status });
  });
  res.json({ message: 'Invoice cancelled. The cancellation has been recorded.' });
}));

router.post('/invoices/:id/payments', validateBody(paymentInput), asyncRoute(async (req, res) => {
  const userId = uid(req); const data = req.validatedBody;
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM invoices WHERE id = ${req.params.id} AND user_id = ${userId} FOR UPDATE`);
    const invoice = await getOwnedInvoice(userId, req.params.id, tx);
    if (!invoice || invoice.status !== 'finalized') { const error = new Error('Finalized invoice not found.'); error.status = 404; throw error; }
    const outstanding = Math.max(0, numeric(invoice.grandTotal) - numeric(invoice.amountPaid));
    if (data.amount - outstanding > 0.01) { const error = new Error('Payment amount cannot exceed the outstanding balance.'); error.status = 400; throw error; }
    const amountPaid = numeric(invoice.amountPaid) + data.amount;
    const paymentStatus = amountPaid >= numeric(invoice.grandTotal) - 0.01 ? 'paid' : 'partially_paid';
    await tx.insert(payments).values({ id: randomUUID(), userId, invoiceId: invoice.id, amount: moneyString(data.amount), method: data.method, note: data.note || '' });
    await tx.update(invoices).set({ amountPaid: moneyString(amountPaid), paymentStatus, updatedAt: new Date() }).where(and(eq(invoices.id, invoice.id), eq(invoices.userId, userId)));
    await audit(tx, userId, 'invoice', invoice.id, 'payment_recorded', { amount: moneyString(data.amount), method: data.method, paymentStatus });
  });
  res.json({ message: 'Payment recorded.' });
}));

router.get('/reports/summary', asyncRoute(async (req, res) => {
  const userId = uid(req); const rows = await db.select().from(invoices).where(and(eq(invoices.userId, userId), eq(invoices.status, 'finalized'))).orderBy(desc(invoices.invoiceDate));
  const byMonth = new Map(); const byTax = new Map();
  for (const invoice of rows) {
    const month = String(invoice.invoiceDate).slice(0, 7); const current = byMonth.get(month) || { month, sales: 0, gst: 0, invoices: 0 };
    current.sales += numeric(invoice.grandTotal); current.gst += numeric(invoice.totalGst); current.invoices += 1; byMonth.set(month, current);
    const taxKey = `${invoice.intraState ? 'CGST + SGST' : 'IGST'}`; const tax = byTax.get(taxKey) || { type: taxKey, amount: 0 }; tax.amount += numeric(invoice.totalGst); byTax.set(taxKey, tax);
  }
  res.json({ months: [...byMonth.values()].sort((a,b) => b.month.localeCompare(a.month)), taxBreakdown: [...byTax.values()], invoiceCount: rows.length });
}));
router.get('/exports/invoices.csv', asyncRoute(async (req, res) => {
  const rows = await db.select().from(invoices).where(and(...parseFilters(req.query, uid(req)))).orderBy(desc(invoices.invoiceDate));
  const csv = toCsv([['Invoice number','Date','Customer','Status','Payment status','Subtotal','Taxable value','GST','Grand total'], ...rows.map((row) => [row.invoiceNumber,row.invoiceDate,row.customerSnapshot?.name,row.status,row.paymentStatus,row.subtotal,row.taxableValue,row.totalGst,row.grandTotal])]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="gst-invoices.csv"'); res.send(`\uFEFF${csv}`);
}));

router.patch('/invoices/:id/payment-status', asyncRoute(async (req, res) => {
  const userId = uid(req); const status = req.body?.status;
  if (!['paid','unpaid','partially_paid'].includes(status)) return res.status(400).json({ message: 'Choose Paid, Unpaid or Partially Paid.' });
  if (status === 'partially_paid') return res.status(400).json({ message: 'Record a partial payment with its amount to update this status.' });
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM invoices WHERE id = ${req.params.id} AND user_id = ${userId} FOR UPDATE`);
    const invoice = await getOwnedInvoice(userId, req.params.id, tx);
    if (!invoice || invoice.status !== 'finalized') { const error = new Error('Finalized invoice not found.'); error.status = 404; throw error; }
    if (status === 'unpaid' && numeric(invoice.amountPaid) > 0) { const error = new Error('This invoice has recorded payments. Record a refund separately rather than erasing the payment history.'); error.status = 409; throw error; }
    if (status === 'paid') {
      const outstanding = Math.max(0, numeric(invoice.grandTotal) - numeric(invoice.amountPaid));
      if (outstanding > 0) await tx.insert(payments).values({ id: randomUUID(), userId, invoiceId: invoice.id, amount: moneyString(outstanding), method: 'manual_status_update', note: 'Marked paid from invoice status control.' });
      await tx.update(invoices).set({ amountPaid: moneyString(invoice.grandTotal), paymentStatus: 'paid', updatedAt: new Date() }).where(and(eq(invoices.id, invoice.id), eq(invoices.userId, userId)));
    } else {
      await tx.update(invoices).set({ paymentStatus: 'unpaid', updatedAt: new Date() }).where(and(eq(invoices.id, invoice.id), eq(invoices.userId, userId)));
    }
    await audit(tx, userId, 'invoice', invoice.id, 'payment_status_updated', { status });
  });
  res.json({ message: `Payment status set to ${status.replaceAll('_',' ')}.` });
}));

export default router;
