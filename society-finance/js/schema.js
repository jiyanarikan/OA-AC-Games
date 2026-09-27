/*
 * Data categories the tool stores. Each field lists header synonyms used to
 * auto-map spreadsheet columns. Types: text | date | money | number | costType.
 * `canonical` text fields get their spellings merged ("standard", "STANDARD " -> "Standard").
 */
(function (root) {
  const SF = (root.SF = root.SF || {});

  const DATE = { key: 'date', label: 'Date', type: 'date', syn: ['date', 'purchase date', 'transaction date', 'order date', 'paid on', 'payment date', 'timestamp', 'created', 'when'] };
  const EVENT = { key: 'event', label: 'Event', type: 'text', canonical: true, syn: ['event', 'event name', 'activity', 'session', 'trip', 'social'] };

  SF.categories = {
    memberships: {
      label: 'Membership purchases',
      short: 'Memberships',
      hint: 'One row per membership bought, e.g. an export from the Students’ Union shop or a sign-up form.',
      keywords: ['member', 'membership', 'subs', 'join'],
      dedupeDefault: true,
      fields: [
        DATE,
        { key: 'name', label: 'Member name', type: 'text', syn: ['name', 'member name', 'full name', 'member', 'customer', 'purchaser', 'student name'] },
        { key: 'memberId', label: 'Student / member ID', type: 'text', syn: ['student id', 'student number', 'member id', 'membership number', 'id', 'urn', 'reference'] },
        { key: 'type', label: 'Membership type', type: 'text', canonical: true, syn: ['membership type', 'membership', 'type', 'tier', 'product', 'category', 'plan'] },
        { key: 'amount', label: 'Amount paid', type: 'money', required: true, syn: ['amount paid', 'amount', 'paid', 'price', 'fee', 'total', 'cost', 'value', 'gross'] },
        { key: 'method', label: 'Payment method', type: 'text', canonical: true, syn: ['payment method', 'payment type', 'method', 'paid via', 'payment'] },
      ],
    },
    eventCosts: {
      label: 'Expenses (event costs, kit, venue, admin)',
      short: 'Expenses',
      hint: 'Receipts or a spending log. Include the event name where a cost belongs to an event; leave it blank for general costs like kit or insurance.',
      keywords: ['cost', 'expense', 'spend', 'budget', 'receipt', 'purchase'],
      dedupeDefault: false,
      fields: [
        DATE,
        EVENT,
        { key: 'item', label: 'Item / description', type: 'text', syn: ['item', 'description', 'details', 'expense', 'what', 'purpose', 'line'] },
        { key: 'costType', label: 'Fixed / variable', type: 'costType', syn: ['cost type', 'fixed variable', 'fixed or variable', 'type', 'behaviour'] },
        { key: 'supplier', label: 'Supplier / payee', type: 'text', canonical: true, syn: ['supplier', 'vendor', 'payee', 'paid to', 'company', 'venue'] },
        { key: 'amount', label: 'Amount', type: 'money', required: true, syn: ['amount', 'cost', 'total', 'spent', 'price', 'value', 'gross'] },
      ],
    },
    externalHires: {
      label: 'Coaching & external hires',
      short: 'Coaching & hires',
      hint: 'Invoices for coaches, instructors, referees or other people/services you pay. Hours and rate are optional.',
      keywords: ['coach', 'hire', 'instructor', 'trainer', 'external', 'freelance'],
      dedupeDefault: false,
      fields: [
        DATE,
        { key: 'provider', label: 'Hired person / company', type: 'text', canonical: true, syn: ['coach', 'provider', 'instructor', 'trainer', 'name', 'hired', 'supplier', 'payee', 'company'] },
        { key: 'service', label: 'Service / role', type: 'text', canonical: true, syn: ['service', 'role', 'description', 'purpose', 'details'] },
        { ...EVENT, syn: ['event', 'activity', 'session', 'training', 'event name', 'class'] },
        { key: 'hours', label: 'Hours / sessions', type: 'number', syn: ['hours', 'sessions', 'qty', 'quantity', 'units', 'no of sessions'] },
        { key: 'rate', label: 'Rate per hour / session', type: 'money', syn: ['rate', 'hourly rate', 'rate per hour', 'rate per session', 'cost per session', 'unit cost'] },
        { key: 'amount', label: 'Amount paid', type: 'money', required: true, syn: ['amount', 'total', 'cost', 'fee', 'paid', 'amount paid', 'invoice total'] },
      ],
      derive(r, fix) {
        if (r.amount == null && r.hours != null && r.rate != null) {
          r.amount = Math.round(r.hours * r.rate * 100) / 100;
          fix('Amount calculated from hours × rate');
        }
      },
    },
    ticketSales: {
      label: 'Event ticket sales',
      short: 'Ticket sales',
      hint: 'One row per order or per ticket type, with the event name. Works for one-off events and pay-per-session activities.',
      keywords: ['ticket', 'sales', 'sold', 'booking', 'entry'],
      dedupeDefault: false,
      fields: [
        DATE,
        EVENT,
        { key: 'ticketType', label: 'Ticket type', type: 'text', canonical: true, syn: ['ticket type', 'ticket', 'type', 'tier', 'product', 'category', 'release'] },
        { key: 'buyer', label: 'Buyer', type: 'text', syn: ['buyer', 'name', 'customer', 'purchaser', 'attendee'] },
        { key: 'price', label: 'Ticket price', type: 'money', syn: ['price', 'ticket price', 'unit price', 'each', 'price each'] },
        { key: 'quantity', label: 'Quantity', type: 'number', syn: ['quantity', 'qty', 'tickets', 'no of tickets', 'number sold', 'sold', 'count'] },
        { key: 'amount', label: 'Amount received', type: 'money', required: true, syn: ['amount', 'total', 'revenue', 'paid', 'gross', 'income', 'amount paid'] },
      ],
      derive(r, fix) {
        if (r.amount == null && r.price != null) {
          r.amount = Math.round(r.price * (r.quantity == null ? 1 : r.quantity) * 100) / 100;
          fix('Amount calculated from price × quantity');
        }
        if (r.quantity == null && r.amount != null) {
          r.quantity = r.price ? Math.max(1, Math.round(r.amount / r.price)) : 1;
          fix('Quantity filled in (assumed from amount)');
        }
        if (r.price == null && r.amount != null && r.quantity) {
          r.price = Math.round((r.amount / r.quantity) * 100) / 100;
          fix('Price calculated from amount ÷ quantity');
        }
      },
    },
  };

  SF.categories.otherIncome = {
    label: 'Other income (sponsorship, grants, fundraising)',
    short: 'Other income',
    hint: 'Sponsorship deals, Students’ Union grants, donations and fundraising. Add an event name if the money was for one event.',
    keywords: ['sponsor', 'grant', 'donation', 'fundrais', 'income', 'funding'],
    dedupeDefault: false,
    fields: [
      DATE,
      { key: 'source', label: 'From (sponsor / funder)', type: 'text', canonical: true, syn: ['source', 'sponsor', 'funder', 'from', 'payer', 'organisation', 'company', 'donor'] },
      { key: 'description', label: 'Description', type: 'text', syn: ['description', 'details', 'purpose', 'item', 'type', 'reason'] },
      { ...EVENT, label: 'Event (optional)' },
      { key: 'amount', label: 'Amount received', type: 'money', required: true, syn: ['amount', 'received', 'total', 'value', 'income', 'paid', 'gross'] },
    ],
  };

  SF.categories.attendance = {
    label: 'Attendance / sign-in sheets',
    short: 'Attendance',
    hint: 'Registers for training, socials or events: either one row per person per session, or one row per session with a head count. No money needed.',
    keywords: ['attendance', 'register', 'sign in', 'signin', 'check in', 'checkin', 'headcount'],
    dedupeDefault: true,
    noMoney: true,
    fields: [
      { ...DATE, required: true },
      { ...EVENT, syn: ['event', 'session', 'activity', 'training', 'event name', 'class'] },
      { key: 'name', label: 'Name (optional)', type: 'text', syn: ['name', 'full name', 'attendee', 'member', 'student'] },
      { key: 'memberStatus', label: 'Member or guest (optional)', type: 'text', canonical: true, syn: ['member status', 'member?', 'status', 'membership', 'guest'] },
      { key: 'count', label: 'Head count (optional)', type: 'number', syn: ['count', 'headcount', 'head count', 'attendees', 'attendance', 'number', 'no attended', 'people'] },
    ],
    derive(r, fix) {
      if (r.count == null) { r.count = 1; fix('Each row counted as one attendee'); }
    },
  };

  SF.categoryKeys = Object.keys(SF.categories);
})(typeof window !== 'undefined' ? window : globalThis);
