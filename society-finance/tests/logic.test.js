// Run with: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/util.js');
require('../js/schema.js');
require('../js/cleaning.js');
require('../js/finance.js');
const { clean: C, finance: F, util: U } = globalThis.SF;

test('parseMoney handles common spreadsheet formats', () => {
  assert.equal(C.parseMoney('£1,234.50'), 1234.5);
  assert.equal(C.parseMoney('(20.00)'), -20);
  assert.equal(C.parseMoney('-£5'), -5);
  assert.equal(C.parseMoney(' 12 '), 12);
  assert.equal(C.parseMoney('Free'), 0);
  assert.equal(C.parseMoney('–'), 0);
  assert.equal(C.parseMoney(''), null);
  assert.equal(C.parseMoney('abc'), undefined);
  assert.equal(C.parseMoney(7.5), 7.5);
});

test('parseDate reads UK dates, ISO, text months and Excel serials', () => {
  assert.equal(C.parseDate('03/10/2025'), '2025-10-03');
  assert.equal(C.parseDate('3-10-25'), '2025-10-03');
  assert.equal(C.parseDate('2025-10-03'), '2025-10-03');
  assert.equal(C.parseDate('3rd October 2025'), '2025-10-03');
  assert.equal(C.parseDate('Oct 3, 2025'), '2025-10-03');
  assert.equal(C.parseDate('Fri 3 Oct 2025'), '2025-10-03');
  assert.equal(C.parseDate(45933), '2025-10-03');
  assert.equal(C.parseDate(new Date(Date.UTC(2025, 9, 3))), '2025-10-03');
  assert.equal(C.parseDate('31/02/2025'), null);
  assert.equal(C.parseDate('10/25/2025'), '2025-10-25'); // obviously month-first
});

test('financial year labels follow the start month', () => {
  assert.equal(U.fyLabel('2025-09-01', 8), '2025/26');
  assert.equal(U.fyLabel('2026-07-31', 8), '2025/26');
  assert.equal(U.fyLabel('2026-08-01', 8), '2026/27');
  assert.equal(U.fyLabel('2026-03-01', 1), '2026');
});

test('detects header row under a title and auto-maps columns', () => {
  const m = [
    ['Hockey Society memberships 2025/26'],
    [],
    ['Timestamp', 'Full Name', 'Student ID', 'Membership Type', 'Amount (£)', 'Payment type'],
    ['01/09/2025', 'Ann Lee', '123', 'standard', '£25.00', 'Card'],
  ];
  const hr = C.detectHeaderRow(m, 'memberships');
  assert.equal(hr, 2);
  const map = C.autoMap(m[hr], 'memberships');
  assert.deepEqual(map, { date: 0, name: 1, memberId: 2, type: 3, amount: 4, method: 5 });
  assert.equal(C.guessCategory(m, 'Sheet1', 'members.xlsx'), 'memberships');
});

test('guessCategory distinguishes hires and ticket sales', () => {
  const hires = [['Date', 'Coach', 'Session', 'Hours', 'Rate', 'Total']];
  const tix = [['Date', 'Event', 'Ticket type', 'Price', 'Qty', 'Total']];
  assert.equal(C.guessCategory(hires, 'Sheet1', 'x.xlsx'), 'externalHires');
  assert.equal(C.guessCategory(tix, 'Sheet1', 'x.xlsx'), 'ticketSales');
});

test('cleanSheet drops totals/blank/bad rows, merges spellings, dedupes', () => {
  const m = [
    ['Date', 'Name', 'Type', 'Amount'],
    ['01/09/2025', '  Ann   Lee ', 'standard', '£25'],
    ['02/09/2025', 'Bob', 'Standard', '25'],
    ['02/09/2025', 'Cat', 'STANDARD', 25],
    [],
    ['02/09/2025', 'Bob', 'Standard', '25'],
    ['03/09/2025', 'Dan', 'Social', 'twenty'],
    ['Total', null, null, 75],
  ];
  const map = C.autoMap(m[0], 'memberships');
  const { records, report } = C.cleanSheet(m, 0, map, 'memberships', { dedupe: true, fyStartMonth: 8 });
  assert.equal(records.length, 3);
  assert.equal(records[0].name, 'Ann Lee');
  assert.ok(records.every((r) => r.type === 'Standard'));
  assert.equal(records[0].fy, '2025/26');
  assert.equal(report.blankRows, 1);
  const reasons = report.dropped.map((d) => d.reason);
  assert.ok(reasons.some((r) => /duplicate/i.test(r)));
  assert.ok(reasons.some((r) => /couldn't read amount/i.test(r)));
  assert.ok(reasons.some((r) => /total/i.test(r)));
});

test('derived amounts for hires and ticket sales', () => {
  const h = [['Coach', 'Hours', 'Rate', 'Total'], ['Sam', 2, '£30', null]];
  const r1 = C.cleanSheet(h, 0, C.autoMap(h[0], 'externalHires'), 'externalHires', {});
  assert.equal(r1.records[0].amount, 60);
  const t = [['Event', 'Ticket', 'Price', 'Qty', 'Total'], ['Ball', 'Early', 10, 3, null], ['Ball', 'Std', null, 2, 30]];
  const r2 = C.cleanSheet(t, 0, C.autoMap(t[0], 'ticketSales'), 'ticketSales', {});
  assert.equal(r2.records[0].amount, 30);
  assert.equal(r2.records[1].price, 15);
});

test('subtractExisting only skips as many copies as are already stored', () => {
  const a = { date: '2025-01-01', amount: 5 };
  const { fresh, skipped } = C.subtractExisting([a, { ...a }, { ...a }], [{ ...a }], 'ticketSales');
  assert.equal(skipped, 1);
  assert.equal(fresh.length, 2);
});

const event = () => ({
  tickets: [
    { name: 'Member', price: 10, expectedQty: 60, actualQty: 50 },
    { name: 'Non-member', price: 15, expectedQty: 40, actualQty: 30 },
  ],
  plannedCosts: [
    { description: 'Venue', type: 'fixed', unitCost: 400, qty: '' },
    { description: 'DJ', type: 'fixed', unitCost: 150, qty: '' },
    { description: 'Food', type: 'variable', unitCost: 4, qty: '' },
  ],
  actualCosts: [
    { description: 'Venue', type: 'fixed', unitCost: 400, qty: '' },
    { description: 'Food', type: 'variable', unitCost: 4.5, qty: '' },
    { description: 'Decorations', type: 'fixed', unitCost: 60, qty: 1 },
  ],
});

test('summarise computes revenue, costs and net profit per scenario', () => {
  const p = F.summarise(event(), 'plan');
  assert.equal(p.attendees, 100);
  assert.equal(p.revenue, 1200);
  assert.equal(p.fixed, 550);
  assert.equal(p.variable, 400);
  assert.equal(p.net, 250);
  const a = F.summarise(event(), 'actual');
  assert.equal(a.attendees, 80);
  assert.equal(a.revenue, 950);
  assert.equal(a.totalCost, 460 + 360);
  assert.equal(a.net, 130);
});

test('break-even uses weighted average price minus variable cost per head', () => {
  const be = F.breakEven(F.summarise(event(), 'plan'));
  // avg price 12, var 4 -> contribution 8; 550 / 8 = 68.75 -> 69
  assert.equal(be.contribution, 8);
  assert.equal(be.units, 69);
  assert.equal(be.safety, 31);
  assert.equal(be.priceAtAttendance, 4 + 5.5);
});

test('break-even impossible when variable cost exceeds price', () => {
  const e = event();
  e.plannedCosts[2].unitCost = 20;
  assert.equal(F.breakEven(F.summarise(e, 'plan')).possible, false);
});

test('line variance matches planned and actual lines', () => {
  const lv = F.lineVariance(event());
  const food = lv.find((r) => r.description === 'Food');
  assert.equal(food.planned, 400);
  assert.equal(food.actual, 360);
  const dj = lv.find((r) => r.description === 'DJ');
  assert.equal(dj.inActual, false);
  const deco = lv.find((r) => r.description === 'Decorations');
  assert.equal(deco.inPlan, false);
  const f = F.findings(event(), '£');
  assert.ok(f.length >= 5);
});

test('spelling merge prefers normal casing over ALL CAPS', () => {
  const m = [['Type', 'Amount'], ['STANDARD', 1], ['STANDARD', 1], ['Standard', 1], ['social', 1], ['SU', 1]];
  const { records } = C.cleanSheet(m, 0, C.autoMap(m[0], 'memberships'), 'memberships', {});
  assert.deepEqual(records.map((r) => r.type), ['Standard', 'Standard', 'Standard', 'Social', 'SU']);
});

test('imported costs match planned lines by phrase and type', () => {
  const plan = [
    { description: 'Umpire', type: 'fixed' },
    { description: 'Minibus hire', type: 'fixed' },
    { description: 'Hire', type: 'fixed' },
    { description: 'Three-course dinner', type: 'variable' },
  ];
  assert.equal(F.matchPlannedLine(plan, 'Priya Shah – Umpire', null).description, 'Umpire');
  assert.equal(F.matchPlannedLine(plan, 'Campus Travel – Minibus hire', null).description, 'Minibus hire');
  assert.equal(F.matchPlannedLine(plan, 'Three-course dinner Grand Hotel', 'variable').description, 'Three-course dinner');
  assert.equal(F.matchPlannedLine(plan, 'Three-course dinner Grand Hotel', 'fixed'), null);
  assert.equal(F.matchPlannedLine(plan, 'Umpiring fee', null), null);
});

test('spelling merge also ignores punctuation ("J. Morgan" = "J Morgan")', () => {
  const m = [['Coach', 'Total'], ['J. Morgan', 70], ['J. Morgan', 70], ['J Morgan', 70]];
  const { records } = C.cleanSheet(m, 0, C.autoMap(m[0], 'externalHires'), 'externalHires', {});
  assert.deepEqual(records.map((r) => r.provider), ['J. Morgan', 'J. Morgan', 'J. Morgan']);
});
