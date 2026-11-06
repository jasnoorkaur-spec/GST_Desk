import { mysqlTable, varchar, text, timestamp, boolean, decimal, int, date, json, mysqlEnum, index, uniqueIndex } from 'drizzle-orm/mysql-core';

const created = () => timestamp('created_at', { mode: 'date' }).defaultNow().notNull();
const updated = () => timestamp('updated_at', { mode: 'date' }).defaultNow().onUpdateNow().notNull();

export const users = mysqlTable('users', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  email: varchar('email', { length: 254 }).notNull(),
  mobile: varchar('mobile', { length: 24 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  mfaEnabled: boolean('mfa_enabled').default(false).notNull(),
  createdAt: created(), updatedAt: updated(),
}, (table) => [uniqueIndex('users_email_uq').on(table.email)]);

export const businessProfiles = mysqlTable('business_profiles', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  businessName: varchar('business_name', { length: 180 }).default('').notNull(),
  address: text('address'), gstin: varchar('gstin', { length: 15 }), state: varchar('state', { length: 80 }),
  stateCode: varchar('state_code', { length: 2 }), contactNumber: varchar('contact_number', { length: 24 }),
  email: varchar('email', { length: 254 }), bankDetails: json('bank_details'), logoUrl: varchar('logo_url', { length: 500 }),
  invoicePrefix: varchar('invoice_prefix', { length: 20 }).default('INV').notNull(), nextInvoiceNumber: int('next_invoice_number').default(1).notNull(),
  defaultPaymentTerms: int('default_payment_terms').default(0).notNull(), defaultNotes: text('default_notes'),
  createdAt: created(), updatedAt: updated(),
}, (table) => [uniqueIndex('business_profiles_user_uq').on(table.userId)]);

export const customers = mysqlTable('customers', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 180 }).notNull(), mobile: varchar('mobile', { length: 24 }).notNull(),
  email: varchar('email', { length: 254 }), address: text('address'), state: varchar('state', { length: 80 }),
  stateCode: varchar('state_code', { length: 2 }), gstin: varchar('gstin', { length: 15 }),
  customerType: mysqlEnum('customer_type', ['registered', 'unregistered']).default('unregistered').notNull(),
  createdAt: created(), updatedAt: updated(),
}, (table) => [index('customers_user_idx').on(table.userId), index('customers_name_idx').on(table.userId, table.name)]);

export const products = mysqlTable('products', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 180 }).notNull(), description: text('description'), hsn: varchar('hsn', { length: 20 }),
  price: decimal('price', { precision: 14, scale: 2 }).notNull(), gstRate: decimal('gst_rate', { precision: 5, scale: 2 }).default('0').notNull(),
  unit: varchar('unit', { length: 32 }).default('pcs').notNull(), stock: decimal('stock', { precision: 12, scale: 3 }).default('0').notNull(),
  createdAt: created(), updatedAt: updated(),
}, (table) => [index('products_user_idx').on(table.userId), index('products_name_idx').on(table.userId, table.name)]);

export const invoices = mysqlTable('invoices', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  businessProfileId: varchar('business_profile_id', { length: 36 }).notNull().references(() => businessProfiles.id),
  customerId: varchar('customer_id', { length: 36 }).references(() => customers.id, { onDelete: 'set null' }),
  invoiceNumber: varchar('invoice_number', { length: 40 }).notNull(),
  status: mysqlEnum('status', ['draft', 'finalized', 'cancelled']).default('draft').notNull(),
  invoiceDate: date('invoice_date', { mode: 'string' }).notNull(), dueDate: date('due_date', { mode: 'string' }),
  placeOfSupply: varchar('place_of_supply', { length: 80 }), supplyStateCode: varchar('supply_state_code', { length: 2 }),
  intraState: boolean('intra_state').default(false).notNull(), docType: mysqlEnum('doc_type', ['tax_invoice', 'bill_of_supply']).default('tax_invoice').notNull(),
  customerSnapshot: json('customer_snapshot').notNull(), businessSnapshot: json('business_snapshot').notNull(),
  subtotal: decimal('subtotal', { precision: 14, scale: 2 }).default('0').notNull(), totalDiscount: decimal('total_discount', { precision: 14, scale: 2 }).default('0').notNull(),
  taxableValue: decimal('taxable_value', { precision: 14, scale: 2 }).default('0').notNull(), totalGst: decimal('total_gst', { precision: 14, scale: 2 }).default('0').notNull(),
  cgst: decimal('cgst', { precision: 14, scale: 2 }).default('0').notNull(), sgst: decimal('sgst', { precision: 14, scale: 2 }).default('0').notNull(), igst: decimal('igst', { precision: 14, scale: 2 }).default('0').notNull(),
  otherCharges: decimal('other_charges', { precision: 14, scale: 2 }).default('0').notNull(), additionalDiscount: decimal('additional_discount', { precision: 14, scale: 2 }).default('0').notNull(),
  roundOff: decimal('round_off', { precision: 14, scale: 2 }).default('0').notNull(), grandTotal: decimal('grand_total', { precision: 14, scale: 2 }).default('0').notNull(),
  paymentStatus: mysqlEnum('payment_status', ['unpaid', 'partially_paid', 'paid']).default('unpaid').notNull(), notes: text('notes'), terms: text('terms'),
  amountPaid: decimal('amount_paid', { precision: 14, scale: 2 }).default('0').notNull(), finalizedAt: timestamp('finalized_at', { mode: 'date' }),
  createdAt: created(), updatedAt: updated(),
}, (table) => [uniqueIndex('invoices_business_number_uq').on(table.businessProfileId, table.invoiceNumber), index('invoices_user_date_idx').on(table.userId, table.invoiceDate), index('invoices_customer_idx').on(table.userId, table.customerId)]);

export const invoiceItems = mysqlTable('invoice_items', {
  id: varchar('id', { length: 36 }).primaryKey(), invoiceId: varchar('invoice_id', { length: 36 }).notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  productId: varchar('product_id', { length: 36 }).references(() => products.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 180 }).notNull(), hsn: varchar('hsn', { length: 20 }), description: text('description'),
  quantity: decimal('quantity', { precision: 12, scale: 3 }).notNull(), unit: varchar('unit', { length: 32 }).notNull(),
  unitPrice: decimal('unit_price', { precision: 14, scale: 2 }).notNull(), discount: decimal('discount', { precision: 14, scale: 2 }).default('0').notNull(),
  gstRate: decimal('gst_rate', { precision: 5, scale: 2 }).notNull(), taxable: decimal('taxable', { precision: 14, scale: 2 }).notNull(),
  gstAmount: decimal('gst_amount', { precision: 14, scale: 2 }).notNull(), cgst: decimal('cgst', { precision: 14, scale: 2 }).notNull(),
  sgst: decimal('sgst', { precision: 14, scale: 2 }).notNull(), igst: decimal('igst', { precision: 14, scale: 2 }).notNull(),
  total: decimal('total', { precision: 14, scale: 2 }).notNull(),
}, (table) => [index('invoice_items_invoice_idx').on(table.invoiceId)]);

export const payments = mysqlTable('payments', {
  id: varchar('id', { length: 36 }).primaryKey(), userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  invoiceId: varchar('invoice_id', { length: 36 }).notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  amount: decimal('amount', { precision: 14, scale: 2 }).notNull(), method: varchar('method', { length: 40 }).default('other').notNull(),
  paidAt: timestamp('paid_at', { mode: 'date' }).defaultNow().notNull(), note: varchar('note', { length: 500 }), createdAt: created(),
}, (table) => [index('payments_user_invoice_idx').on(table.userId, table.invoiceId)]);

export const authTokens = mysqlTable('auth_tokens', {
  id: varchar('id', { length: 36 }).primaryKey(), userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  purpose: mysqlEnum('purpose', ['login_otp', 'password_reset']).notNull(), tokenHash: varchar('token_hash', { length: 128 }).notNull(),
  attempts: int('attempts').default(0).notNull(), expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(), resendAt: timestamp('resend_at', { mode: 'date' }),
  consumedAt: timestamp('consumed_at', { mode: 'date' }), createdAt: created(),
}, (table) => [index('auth_tokens_user_purpose_idx').on(table.userId, table.purpose)]);

export const auditEvents = mysqlTable('audit_events', {
  id: varchar('id', { length: 36 }).primaryKey(), userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  entityType: varchar('entity_type', { length: 40 }).notNull(), entityId: varchar('entity_id', { length: 36 }).notNull(), action: varchar('action', { length: 60 }).notNull(),
  details: json('details'), createdAt: created(),
}, (table) => [index('audit_user_entity_idx').on(table.userId, table.entityType, table.entityId)]);
