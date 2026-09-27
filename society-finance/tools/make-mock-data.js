// Builds the mock dataset in /mock-data for a fictional society's 2025/26 year,
// plus tests/mock-expected.json: the answer key, computed from the clean
// "truth" here, NOT from the app's cleaning code.
// Run with: npm install exceljs && node tools/make-mock-data.js
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const OUT = path.join(__dirname, '..', 'mock-data');
fs.mkdirSync(OUT, { recursive: true });

let seed = 20252026;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const r2 = (n) => Math.round(n * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');

const FIRST = ['Amy', 'Ben', 'Chloe', 'Daniel', 'Ella', 'Farah', 'George', 'Hannah', 'Isaac', 'Jas', 'Kiran', 'Leah', 'Mohammed', 'Nadia', 'Oliver', 'Phoebe', 'Rahul', 'Sofia', 'Theo', 'Uma', 'Victor', 'Wei', 'Yasmin', 'Zain', 'Alfie', 'Bea', 'Callum', 'Divya', 'Erin', 'Felix'];
const LAST = ['Chen', 'Patel', 'Okafor', 'Smith', 'Nguyen', 'Khan', 'Jones', 'Garcia', 'Murphy', 'Ali', 'Wright', 'Kowalski', 'Evans', 'Singh', 'Brown', 'Hughes', 'Lee', 'Ahmed'];
const person = () => `${pick(FIRST)} ${pick(LAST)}`;

const expected = {};

// ---------------------------------------------------------------------------
// Events: the planned budgets (loaded via backup) and what actually happened.
// ---------------------------------------------------------------------------
const EVENTS = [
  {
    key: 'Freshers Social', name: 'Freshers Social', date: '2025-09-26',
    tiers: [['Member', 3, 90, 118], ['Non-member', 5, 60, 74]],
    plan: [['Room hire deposit', 'fixed', 150], ['Wristbands', 'variable', 0.35], ['Snacks', 'variable', 0.6]],
    actual: [ // [item text in spreadsheet, cost-type label, supplier, amount, plan line it belongs to]
      ['Room hire deposit', 'Fixed', 'Union Bar', 150, 'Room hire deposit'],
      ['Wristbands (200)', 'V', 'Print Hub', 70, 'Wristbands'],
      ['Snacks', 'variable', 'Supermarket', 96, 'Snacks'],
    ],
    hires: [],
  },
  {
    key: 'Autumn Tournament', name: 'Autumn Tournament', date: '2025-11-15',
    tiers: [['Member entry', 10, 40, 36], ['Non-member entry', 15, 16, 12]],
    plan: [['Sports hall hire', 'fixed', 320], ['Trophies', 'fixed', 75], ['Umpire', 'fixed', 90], ['Shuttlecocks', 'variable', 2.5]],
    actual: [
      ['Sports hall hire (full day)', 'F', 'Sports Centre', 320, 'Sports hall hire'],
      ['Shuttlecocks (tournament tubes)', 'per head', 'Racket Sports Ltd', 156, 'Shuttlecocks'],
      ['Trophies and medals', 'fixed', 'Engrave It', 84.5, 'Trophies'],
    ],
    hires: [['2025-11-15', 'Priya Shah', 'Umpire', 6, 15, 'Umpire']],
  },
  {
    key: 'Winter Ball', name: 'Winter Ball', date: '2025-12-12',
    tiers: [['Early bird', 38, 40, 40], ['Member', 45, 60, 47], ['Non-member', 55, 30, 21]],
    refunds: { Member: 2 },
    plan: [['Venue hire', 'fixed', 1500], ['DJ', 'fixed', 350], ['Decorations', 'fixed', 180], ['Three-course dinner', 'variable', 24], ['Welcome drink', 'variable', 3.5]],
    actual: [
      ['Venue hire', 'Fixed', 'Riverside Hotel', 1500, 'Venue hire'],
      ['Three-course dinner', 'per head', 'Riverside Hotel', 108 * 24, 'Three-course dinner'],
      ['DJ', 'F', 'Beats Entertainment', 380, 'DJ'],
      ['Photographer', 'Fixed', 'Snapshot Studio', 250, null],
      ['Decorations', 'f', 'Party Supplies Co', 212.6, 'Decorations'],
      ['Welcome drink', 'Per person', 'Riverside Hotel', 108 * 3.5, 'Welcome drink'],
    ],
    hires: [],
  },
  {
    key: 'Varsity Trip', name: 'Varsity Trip to Leeds', linkName: 'Varsity Trip', date: '2026-03-07',
    tiers: [['Member', 55, 40, 34]],
    refunds: { Member: 1 },
    plan: [['Minibus hire', 'fixed', 780], ['Match entry fee', 'fixed', 120], ['Hostel', 'variable', 38]],
    actual: [
      ['Match entry fee', 'Fixed', 'Host club', 120, 'Match entry fee'],
      ['Hostel (1 night)', 'V', 'City Hostel', 34 * 38, 'Hostel'],
    ],
    hires: [['2026-02-20', 'Campus Travel', 'Minibus hire', 2, 390, 'Minibus hire']],
  },
  {
    key: 'End of Year Dinner', name: 'End of Year Dinner', date: '2026-05-22',
    tiers: [['Member', 32, 70, 76], ['Non-member', 38, 15, 18], ['Committee', 0, 8, 8]],
    plan: [['Restaurant set menu', 'variable', 27], ['Awards', 'fixed', 140]],
    actual: [
      ['Restaurant set menu', 'Variable', 'The Riverside Kitchen', 102 * 27, 'Restaurant set menu'],
      ['Awards and engraving', 'Fixed', 'Engrave It', 145, 'Awards'],
    ],
    hires: [],
  },
];

// ---------------------------------------------------------------------------
// 00 - event plans backup (restore this first)
// ---------------------------------------------------------------------------
let idn = 0;
const id = () => 'mock' + (++idn);
const plans = {
  app: 'society-finance',
  version: 1,
  settings: { currency: '£', fyStartMonth: 8, societyName: 'Riverside Badminton Society (mock data)' },
  records: { memberships: [], eventCosts: [], externalHires: [], ticketSales: [] },
  imports: [],
  events: EVENTS.map((e) => ({
    id: id(), name: e.name, date: e.date, linkName: e.linkName || '',
    notes: 'Mock event: planned budget only. Import the mock spreadsheets, then use "Fill actual sales" and "Add costs from imported data".',
    tickets: e.tiers.map(([name, price, exp]) => ({ id: id(), name, price, expectedQty: exp, actualQty: '' })),
    plannedCosts: e.plan.map(([description, type, unitCost]) => ({ id: id(), description, type, unitCost, qty: '', notes: '' })),
    actualCosts: [],
  })),
};
fs.writeFileSync(path.join(OUT, '00-event-plans-backup.json'), JSON.stringify(plans, null, 1));

// Expected per-event results (hand maths on the truth)
expected.events = {};
for (const e of EVENTS) {
  const nP = e.tiers.reduce((t, x) => t + x[2], 0);
  const nA = e.tiers.reduce((t, x) => t + x[3], 0);
  const revP = e.tiers.reduce((t, x) => t + x[1] * x[2], 0);
  const revA = e.tiers.reduce((t, x) => t + x[1] * x[3], 0);
  const fixedP = e.plan.filter((p) => p.type !== 'variable' && p[1] === 'fixed').reduce((t, p) => t + p[2], 0);
  const varP = e.plan.filter((p) => p[1] === 'variable').reduce((t, p) => t + p[2] * nP, 0);
  const costA = e.actual.reduce((t, a) => t + a[3], 0) + e.hires.reduce((t, h) => t + h[3] * h[4], 0);
  const contribution = revP / nP - varP / nP;
  expected.events[e.name] = {
    plannedAttendees: nP, actualAttendees: nA,
    plannedIncome: r2(revP), actualIncome: r2(revA),
    plannedCost: r2(fixedP + varP), actualCost: r2(costA),
    plannedNet: r2(revP - fixedP - varP), actualNet: r2(revA - costA),
    plannedBreakEven: Math.ceil(fixedP / contribution - 1e-9),
    unplannedLines: e.actual.filter((a) => !a[4]).map((a) => a[0]),
  };
}

// ---------------------------------------------------------------------------
// 01 - membership sign-ups (Google Forms style), two sheets
// ---------------------------------------------------------------------------
const TYPES = [['Full', 30, 60], ['Social', 15, 25], ['Competitive', 45, 15]];
const typeFor = () => {
  const x = rnd() * 100;
  let acc = 0;
  for (const t of TYPES) { acc += t[2]; if (x < acc) return t; }
  return TYPES[0];
};
const variant = (s) => { const x = rnd(); return x < 0.08 ? s.toLowerCase() : x < 0.12 ? s.toUpperCase() : x < 0.15 ? ` ${s} ` : s; };
const studentNo = () => (rnd() < 0.2 ? '0' : '2') + String(int(100000, 999999));
const METHODS = ['Card', 'Card', 'Card', 'SU website', 'SU website', 'Cash', 'Bank transfer'];

function signupDate(i, n) {
  // spread Aug–Dec, with a burst in late September; a few summer open-day sign-ups in July.
  if (i < 3) return new Date(Date.UTC(2025, 6, 26 + i, 11, int(0, 59), int(0, 59)));
  const month = i < n * 0.08 ? 7 : i < n * 0.75 ? 8 : i < n * 0.88 ? 9 : i < n * 0.95 ? 10 : 11;
  return new Date(Date.UTC(2025, month, int(1, 28), int(9, 22), int(0, 59), int(0, 59)));
}
function dateCell(d) {
  const x = rnd();
  if (x < 0.6) return d; // real Excel date
  if (x < 0.85) return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
const amountCell = (a) => { const x = rnd(); return x < 0.7 ? a : x < 0.9 ? `£${a.toFixed(2)}` : String(a); };
const fy = (d) => (d.getUTCMonth() >= 7 ? '2025/26' : '2024/25');

const memTruth = [];
const s1 = [
  ['Riverside Badminton Society – membership sign-ups (Semester 1)'],
  ['Exported from Google Forms on 05/01/2026'],
  [],
  ['Timestamp', 'Full name', 'Student number', 'Membership type', 'Amount paid', 'Payment method', 'Notes'],
];
const N1 = 150;
for (let i = 0; i < N1; i++) {
  const d = signupDate(i, N1);
  const [type, price] = typeFor();
  const name = person();
  s1.push([dateCell(d), rnd() < 0.1 ? name.replace(' ', '  ') + ' ' : name, studentNo(), variant(type), amountCell(price), pick(METHODS), rnd() < 0.05 ? 'Paid at stall' : null]);
  memTruth.push({ amount: price, fy: fy(d) });
}
for (let i = 0; i < 6; i++) { // committee get free membership
  const d = new Date(Date.UTC(2025, 7, 20, 12, i, 0));
  s1.push([d, person(), studentNo(), 'Full', 'Free', 'N/A', 'Committee']);
  memTruth.push({ amount: 0, fy: '2025/26' });
}
for (let i = 0; i < 2; i++) { // refunds
  const d = new Date(Date.UTC(2025, 9, 10 + i, 15, 0, 0));
  s1.push([d, person(), studentNo(), 'Full', '(30.00)', 'Card', 'Refund - left university']);
  memTruth.push({ amount: -30, fy: '2025/26' });
}
// mess: duplicates (double form submissions), unreadable and missing amounts, blank rows
for (const at of [20, 45, 77, 110]) s1.splice(at, 0, s1[at - 1].slice());
s1.splice(60, 0, [new Date(Date.UTC(2025, 8, 30, 13, 0, 0)), 'Sam Walker', '2345678', 'Full', 'TBC', 'Cash', 'Will pay next week']);
s1.splice(90, 0, [new Date(Date.UTC(2025, 9, 2, 13, 0, 0)), 'Nia Roberts', '2456789', 'Social', null, null, 'Payment failed']);
s1.splice(100, 0, []);
s1.splice(130, 0, []);
s1.push([], [null, 'TOTAL', null, null, '=SUM(E5:E170)', null, null]);

const s2 = [['Date', 'Name', 'ID', 'Type', 'Price (£)', 'Paid via']];
const N2 = 28;
for (let i = 0; i < N2; i++) {
  const d = new Date(Date.UTC(2026, i < 18 ? 0 : i < 25 ? 1 : 2, int(5, 28), 12, 0, 0));
  const [type, price] = rnd() < 0.6 ? TYPES[1] : TYPES[0];
  s2.push([`${d.getUTCDate()} ${['Jan', 'Feb', 'Mar'][d.getUTCMonth()]} ${d.getUTCFullYear()}`, person(), studentNo(), variant(type), `£${price}`, pick(['Card', 'card', 'SU website'])]);
  memTruth.push({ amount: price, fy: '2025/26' });
}
s2.push(['Grand total', null, null, null, null, null]);

expected.memberships = {
  count: memTruth.length,
  total: r2(memTruth.reduce((t, m) => t + m.amount, 0)),
  byYear: memTruth.reduce((o, m) => ((o[m.fy] = (o[m.fy] || 0) + 1), o), {}),
  sheets: {
    'Semester 1': { kept: N1 + 8, droppedReasons: { duplicate: 4, unreadable: 1, missing: 1, total: 1 } },
    'Semester 2': { kept: N2, droppedReasons: { total: 1 } },
  },
};

// ---------------------------------------------------------------------------
// 02 - ticket sales CSV (ticketing platform export)
// ---------------------------------------------------------------------------
const tix = [['Order ID', 'Order date', 'Event', 'Ticket type', 'Buyer name', 'Unit price', 'Quantity', 'Order total', 'Status']];
let order = 10230, ticketTotal = 0, ticketRows = 0;
for (const e of EVENTS) {
  const [y, m, d] = e.date.split('-').map(Number);
  const eventDay = Date.UTC(y, m - 1, d);
  for (const [tier, price, , actual] of e.tiers) {
    const refunds = (e.refunds && e.refunds[tier]) || 0;
    let left = actual + refunds; // gross sold; refunds netted off below
    while (left > 0) {
      const q = tier === 'Committee' ? 1 : Math.min(left, pick([1, 1, 1, 2, 2, 3]));
      left -= q;
      const when = new Date(eventDay - int(1, 30) * 86400000 - int(0, 43200) * 1000);
      const buyer = rnd() < 0.3 ? `${pick(LAST)}, ${pick(FIRST)}` : person();
      const evName = rnd() < 0.1 ? e.key.toLowerCase() : e.key;
      const tierName = rnd() < 0.08 ? (tier === 'Member' ? 'member' : tier.toUpperCase()) : tier;
      tix.push([`RBS-${order++}`, `${when.getUTCFullYear()}-${pad(when.getUTCMonth() + 1)}-${pad(when.getUTCDate())} ${pad(when.getUTCHours())}:${pad(when.getUTCMinutes())}`,
        evName, tierName, buyer, `£${price.toFixed(2)}`, q, rnd() < 0.3 ? '' : `£${(price * q).toFixed(2)}`, 'Completed']);
      ticketTotal += price * q; ticketRows++;
    }
    for (let i = 0; i < refunds; i++) {
      const when = new Date(eventDay - 2 * 86400000);
      tix.push([`RBS-${order++}`, `${when.getUTCFullYear()}-${pad(when.getUTCMonth() + 1)}-${pad(when.getUTCDate())} 10:15`,
        e.key, tier, person(), `£${price.toFixed(2)}`, -1, `-£${price.toFixed(2)}`, 'Refunded']);
      ticketTotal -= price; ticketRows++;
    }
  }
}
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
fs.writeFileSync(path.join(OUT, '02-ticket-sales.csv'), '﻿' + tix.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n');
expected.ticketSales = { count: ticketRows, total: r2(ticketTotal) };

// ---------------------------------------------------------------------------
// 03 - treasurer's expense log
// ---------------------------------------------------------------------------
const exp = [['Treasurer expense log 2025/26'], [], ['Date', 'Event', 'Description', 'Fixed / Variable', 'Paid to', 'Amount (£)', 'Receipt no.']];
let receipt = 1, costTotal = 0, costRows = 0;
const textDate = (iso, style) => {
  const [y, m, d] = iso.split('-').map(Number);
  const suffix = d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th';
  if (style === 0) return new Date(Date.UTC(y, m - 1, d));
  if (style === 1) return `${d}${suffix} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`;
  return `${pad(d)}/${pad(m)}/${String(y).slice(2)}`;
};
// weekly training court hire + shuttles
const trainingDates = [];
for (let w = 0, t = Date.UTC(2025, 8, 30); trainingDates.length < 22; w++, t += 7 * 86400000) {
  const dt = new Date(t);
  if (dt.getUTCMonth() === 11 && dt.getUTCDate() > 14) continue; // Christmas break
  if (dt.getUTCMonth() === 0 && dt.getUTCDate() < 12) continue;
  trainingDates.push(dt.toISOString().slice(0, 10));
}
for (const [i, dt] of trainingDates.entries()) {
  exp.push([textDate(dt, i % 3), 'Weekly training', 'Court hire (4 courts)', 'Fixed', 'Sports Centre', i % 4 === 0 ? '£48.00' : 48, `R${pad(receipt++)}`]);
  costTotal += 48; costRows++;
}
for (const dt of ['2025-10-01', '2025-11-12', '2026-01-14', '2026-02-25']) {
  exp.push([textDate(dt, 0), 'Weekly training', 'Shuttlecocks (training)', null, 'Racket Sports Ltd', 94.5, `R${pad(receipt++)}`]);
  costTotal += 94.5; costRows++;
}
exp.push(['Subtotal', null, null, null, null, 22 * 48 + 4 * 94.5, null], []);
for (const e of EVENTS) {
  for (const [i, [item, label, supplier, amount]] of e.actual.entries()) {
    exp.push([textDate(e.date, i % 3), rnd() < 0.15 ? e.key.toUpperCase() : e.key, item, label, supplier, rnd() < 0.5 ? `£${amount.toLocaleString('en-GB', { minimumFractionDigits: 2 })}` : amount, `R${pad(receipt++)}`]);
    costTotal += amount; costRows++;
  }
  exp.push(['Subtotal', null, null, null, null, e.actual.reduce((t, a) => t + a[3], 0), null], []);
}
// general items, including one with an unreadable date and one unreadable amount
exp.push([textDate('2025-09-10', 0), 'General', 'Club banner', 'Fixed', 'Print Hub', 65, `R${pad(receipt++)}`]);
exp.push(['TBC', 'General', 'Kit bag replacements', 'Fixed', 'Racket Sports Ltd', 39.99, `R${pad(receipt++)}`]);
exp.push([textDate('2026-04-02', 1), 'General', 'Printer ink', null, 'Office shop', 'see receipt', `R${pad(receipt++)}`]);
costTotal += 65 + 39.99; costRows += 2;
exp.push([], ['GRAND TOTAL', null, null, null, null, r2(costTotal), null]);
expected.eventCosts = { count: costRows, total: r2(costTotal), droppedReasons: { total: 7, unreadable: 1 }, warnings: 1 };

// ---------------------------------------------------------------------------
// 04 - coach and external hire invoices
// ---------------------------------------------------------------------------
const hires = [['Invoice date', 'Coach / provider', 'Service', 'Activity', 'Hours', 'Rate (£ per hour)', 'Invoice total']];
let hireTotal = 0, hireRows = 0, hireWarnings = 0;
trainingDates.forEach((dt, i) => {
  const odd = i % 6 === 5; // a few invoices typed the rate as "£40/hr"
  if (odd) hireWarnings++;
  hires.push([textDate(dt, 0), i % 7 === 3 ? 'dan hughes' : 'Dan Hughes', 'Weekly coaching', 'Weekly training', 2, odd ? '£40/hr' : 40, odd ? '£80.00' : null]);
  hireTotal += 80; hireRows++;
});
hires.push([textDate('2026-02-11', 0), 'Mei Lin', 'Guest coaching workshop', 'Weekly training', 3, 60, 180]);
hireTotal += 180; hireRows++;
for (const e of EVENTS) for (const [dt, provider, service, hours, rate] of e.hires) {
  hires.push([textDate(dt, 0), provider, service, e.key, hours, `£${rate}`, null]);
  hireTotal += hours * rate; hireRows++;
}
expected.externalHires = { count: hireRows, total: r2(hireTotal), warnings: hireWarnings };

// ---------------------------------------------------------------------------
// write workbooks
// ---------------------------------------------------------------------------
async function writeBook(file, sheets) {
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of sheets) {
    const ws = wb.addWorksheet(name);
    rows.forEach((row, i) => row.forEach((v, c) => {
      if (v === null || v === undefined) return;
      const cell = ws.getCell(i + 1, c + 1);
      if (typeof v === 'string' && v.startsWith('=')) cell.value = { formula: v.slice(1) };
      else cell.value = v;
      if (v instanceof Date) cell.numFmt = 'dd/mm/yyyy hh:mm';
    }));
    ws.columns.forEach((col) => (col.width = 20));
  }
  await wb.xlsx.writeFile(path.join(OUT, file));
}

(async () => {
  await writeBook('01-membership-signups.xlsx', [['Semester 1', s1], ['Semester 2', s2]]);
  await writeBook('03-treasurer-expenses.xlsx', [['Expenses 2025-26', exp]]);
  await writeBook('04-coach-and-hires.xlsx', [['Invoices', hires]]);
  fs.writeFileSync(path.join(__dirname, '..', 'tests', 'mock-expected.json'), JSON.stringify(expected, null, 2));
  console.log(JSON.stringify(expected, null, 2));
})();
