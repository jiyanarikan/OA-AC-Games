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
      label: 'Event costs',
      short: 'Event costs',
      keywords: ['cost', 'expense', 'spend', 'budget', 'receipt'],
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
      label: 'External hires (coaches, instructors, services)',
      short: 'External hires',
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

  SF.categoryKeys = Object.keys(SF.categories);
})(typeof window !== 'undefined' ? window : globalThis);
