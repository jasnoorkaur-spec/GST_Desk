# GST Desk

**A Smart GST Invoicing and Business Management Workspace for Indian Businesses**

GST Desk is a full-stack web application designed to simplify invoicing, GST calculations, customer management, product management, and sales tracking for Indian small businesses, shopkeepers, and accountants.

The application provides a centralized billing workspace where users can manage business information, maintain customer and product records, generate professional GST invoices, track payments, and monitor business performance through an interactive dashboard.

Built with a lightweight vanilla JavaScript frontend and a Node.js + Express backend, the application uses MySQL for persistent data storage and Drizzle ORM for structured database management.

---

## Key Features

### 1. User Authentication & Security
- Secure user registration and login using email and password.
- Password hashing with bcrypt.
- JWT-based authentication using HTTP-only cookies.
- Protected routes and user-specific data access.
- Password reset functionality through email.
- Optional email-based OTP multi-factor authentication (MFA).
- Rate limiting and CSRF protection for enhanced security.

### 2. Business Profile Management
- Configure business name, address, contact information, and GSTIN.
- Manage seller details and state information.
- Configure invoice numbering and default invoice settings.
- Store business details for automatic invoice generation.
- Support for business logo references.

### 3. Customer Management
- Add, update, view, and manage customer records.
- Store customer names, addresses, contact information, and GSTIN.
- Maintain organized customer information.
- Associate invoices with individual customers.
- Securely manage customer records within each user's account.

### 4. Product & Inventory Management
- Add and manage products and services.
- Store product descriptions, HSN codes, prices, and GST rates.
- Maintain product quantities and stock information.
- Automatically retrieve product details while creating invoices.
- Update inventory through applicable invoice transactions.

### 5. Smart GST Invoice Generation
- Create professional GST invoices dynamically.
- Add multiple products or services to a single invoice.
- Automatically calculate taxable amounts and applicable GST.
- Support different GST rates for individual invoice items.
- Apply item-level discounts.
- Automatically determine intra-state and inter-state transactions.
- Generate CGST + SGST for intra-state supplies.
- Generate IGST for inter-state supplies.
- Preview invoice totals before finalization.
- Maintain separate draft, finalized, and cancelled invoice statuses.

### 6. Automated GST Calculations

The application provides real-time GST calculations using a shared calculation module.

**Taxable Amount:**

`Taxable Amount = Quantity × Unit Price − Discount`

**GST Amount:**

`GST Amount = Taxable Amount × GST Rate / 100`

**Intra-State Transactions:**

- CGST = Total GST / 2
- SGST = Total GST / 2

**Inter-State Transactions:**

- IGST = Total GST

**Final Payable Amount:**

`Final Payable = Total Taxable Amount + Total GST`

All monetary calculations are rounded to two decimal places.

The seller's and customer's state codes determine the applicable GST treatment.

### 7. Invoice History & Management
- View all previously generated invoices.
- Search and filter invoices.
- View individual invoice details.
- Track invoice status.
- Manage draft and finalized invoices.
- Cancel invoices with confirmation.
- Maintain invoice audit records.
- Preserve invoice and customer/business snapshots for historical accuracy.

### 8. PDF Invoice Generation & Printing
- Generate downloadable PDF invoices.
- Create professional A4-sized invoice documents.
- Display business, customer, product, and GST details.
- Include item-wise tax breakdowns and final payable amounts.
- Print invoices directly through the browser.
- Use print-specific CSS to remove application navigation and controls.

### 9. Dashboard & Sales Analytics
- View business performance through a centralized dashboard.
- Monitor invoice and sales summaries.
- Track recent invoices.
- View relevant business and tax statistics.
- Access quick actions for common billing operations.

### 10. Reports & Data Export
- Access organized billing and sales information.
- Export supported records in CSV format.
- Search and filter business records.
- Review invoice and payment information.

---

## Technology Stack

| Category | Technologies |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Backend | Node.js, Express.js |
| Database | MySQL |
| ORM | Drizzle ORM |
| Database Driver | mysql2 |
| Authentication | JWT, bcrypt |
| Validation | Zod |
| Email Services | Nodemailer |
| PDF Generation | jsPDF, jsPDF-AutoTable |
| API Architecture | REST API |
| Package Manager | pnpm |

**Architecture:** Client-server architecture with a vanilla JavaScript frontend communicating with an Express REST API.

---

## Application Architecture

The application follows a modular architecture that separates the frontend, backend, shared business logic, and database layer.

```text
GST-BILLING-SYSTEM/
│
├── public/
│   ├── index.html
│   ├── css/
│   │   ├── style.css
│   │   ├── dashboard.css
│   │   ├── forms.css
│   │   └── invoice.css
│   │
│   ├── js/
│   │   ├── app.js
│   │   ├── router.js
│   │   ├── api.js
│   │   ├── components/
│   │   ├── views/
│   │   └── invoice/
│   │
│   └── manus-routes.json
│
├── src/
│   ├── server/
│   │   ├── index.js
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── services/
│   │   └── validation/
│   │
│   └── shared/
│       ├── schemas/
│       ├── calculations/
│       └── constants/
│
├── db/
│   ├── schema.js
│   ├── migrations/
│   └── drizzle.config.js
│
├── Dockerfile
├── package.json
├── pnpm-lock.yaml
├── .env.example
├── .gitignore
└── README.md
```

*Note: The structure above represents the planned logical organization. Individual filenames and folders may vary in the implemented project.*

---

## Database Design

The application uses a relational MySQL database with Drizzle ORM.

The primary database tables include:

| Table | Purpose |
|---|---|
| Users | Stores user authentication and account information |
| Business Profiles | Stores business and GST registration details |
| Customers | Maintains customer information |
| Products | Stores product details, prices, GST rates, and inventory |
| Invoices | Stores invoice details, totals, dates, and status |
| Invoice Items | Stores individual invoice product and tax snapshots |
| Payment Records | Maintains payment-related information |
| MFA / Reset Tokens | Stores hashed, expiring authentication tokens |
| Audit Events | Records important application activities |

### Database Highlights
- Foreign key relationships and database constraints.
- Unique invoice numbers within each business.
- Explicit ownership of private records.
- Decimal-based monetary storage for financial accuracy.
- Transaction-based invoice finalization and stock updates.
- Historical snapshots to preserve finalized invoice information.

---

## Security & Data Protection

Security is an important part of the application architecture.

- Passwords are securely hashed using bcrypt.
- JWT authentication is maintained through HTTP-only cookies.
- CSRF protection is applied to authenticated mutations.
- API endpoints validate incoming data using Zod.
- Rate limiting helps protect authentication endpoints.
- User-specific database queries prevent unauthorized access to other accounts.
- Sensitive information and authentication hashes are excluded from API responses.
- Email verification tokens and OTPs are stored as hashes with expiry and attempt limits.

---

## Installation & Setup

Follow these instructions to run the project locally.

### Prerequisites

Make sure the following are installed:

- Node.js
- pnpm
- MySQL
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/gst-billing-system.git
```

### 2. Navigate to the Project Directory

```bash
cd gst-billing-system
```

### 3. Install Dependencies

```bash
pnpm install
```

### 4. Configure Environment Variables

Create a `.env` file in the root directory using `.env.example` as a reference.

Configure the required environment variables:

```env
PORT=3000

DATABASE_URL=mysql://username:password@localhost:3306/gst_billing

JWT_SECRET=your_secure_jwt_secret

SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

**Important:**
- Replace the database credentials with your actual MySQL configuration.
- Use a strong, randomly generated JWT secret.
- SMTP credentials are required for password reset emails and optional email-based MFA.
- Never commit your `.env` file or expose secrets in frontend code.

### 5. Run Database Migrations

```bash
pnpm drizzle-kit migrate
```

### 6. Start the Development Server

```bash
pnpm dev
```

### 7. Open the Application

Visit:

```text
http://localhost:3000
```

The application should now be accessible in your browser.

*Note: Use the actual scripts and migration commands defined in your project's package.json and Drizzle configuration.*

---

## UI/UX Design Philosophy

The application follows a clean, minimal, and professional design approach.

**Design Highlights:**
- Light-themed interface with a clean workspace.
- Responsive sidebar navigation.
- Soft blue primary color (`#3B82F6`).
- Teal secondary color (`#14B8A6`).
- Light workspace background (`#F8FAFC`).
- Clean white cards and readable typography.
- Inter font family with tabular numerals for financial values.
- Responsive forms and tables.
- Accessible navigation and mobile drawer.
- Clear validation messages and helpful empty states.

The interface prioritizes usability, clarity, and accessibility rather than unnecessary visual complexity.

---

## Future Enhancements

Potential improvements to expand the application's capabilities include:

- GST return preparation and reporting assistance.
- Integration with India's official e-invoicing APIs.
- Automated invoice reminders.
- Email and WhatsApp invoice sharing.
- Advanced sales and tax analytics.
- Multi-business account management.
- Barcode-based product management.
- Inventory alerts for low-stock products.
- Advanced financial reports.
- Integration with payment gateways.
- Cloud-based invoice backup.

*These are potential future enhancements and are not represented as currently implemented features.*

---

## Important Notes

- The application is an invoicing and business management tool; it does not directly file GST returns.
- It does not currently submit invoices to government e-invoicing portals.
- Email-based features require valid SMTP configuration.
- Secure authentication requires a configured JWT signing secret.
- No fake business, customer, product, or invoice records are inserted automatically.
- Users must configure their business profile and add their own records.
- GST calculations should be verified against applicable tax rules before using invoices for actual business compliance.

---

## License

This project is developed for educational and practical learning purposes.

---

**GST Desk — Simplifying Billing. Automating GST. Managing Business Better.**