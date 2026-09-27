const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/util.js');
require('../js/schema.js');
require('../js/cleaning.js');
require('../js/master.js');
const { master: M } = globalThis.SF;

const data = (records, extra) => ({
  settings: { fyStartMonth: 8, currency: '£' },
  records: { memberships: [], ticketSales: [], otherIncome: [], eventCosts: [], externalHires: [], attendance: [], ...records },
  eventAliases: {}, eventMeta: {}, ...extra,
});

test('periods: week, month, term, quarter, year', () => {
  assert.equal(M.period('2025-09-03', 'week', 8).key, 'W2025-09-01');
  assert.equal(M.period('2025-09-03', 'month', 8).label, 'Sep 25');
  assert.equal(M.period('2025-11-03', 'term', 8).label, 'Autumn 25/26');
  assert.equal(M.period('2026-02-03', 'term', 8).label, 'Spring 25/26');
  assert.equal(M.period('2026-05-03', 'term', 8).label, 'Summer 25/26');
  assert.equal(M.period('2025-08-15', 'quarter', 8).label, 'Q1 25/26 (Aug–Oct)');
  assert.equal(M.period('2026-07-15', 'quarter', 8).label, 'Q4 25/26 (May–Jul)');
  assert.equal(M.period('2026-07-15', 'year', 8).key, '2025/26');
});

test('periodRange fills gaps', () => {
  const r = M.periodRange('2025-09-15', '2025-12-02', 'month', 8);
  assert.deepEqual(r.map((p) => p.key), ['2025-09', '2025-10', '2025-11', '2025-12']);
  assert.equal(M.periodRange('2025-09-01', '2025-09-29', 'week', 8).length, 5);
});

test('fyBounds', () => {
  assert.deepEqual(M.fyBounds('2025/26', 8), { start: '2025-08-01', end: '2026-07-31' });
});

test('regularity spots weekly schedules with a holiday gap, rejects scattered dates', () => {
  const weekly = ['2025-10-01', '2025-10-08', '2025-10-15', '2025-10-22', '2025-11-05', '2025-11-12'];
  assert.equal(M.regularity(weekly).frequency, 'Weekly');
  assert.equal(M.regularity(['2025-10-01', '2025-11-20', '2025-12-01', '2025-12-12']), null);
  assert.equal(M.regularity(['2025-12-01', '2025-12-05', '2025-12-12']), null);
});

test('builds recurring and one-off events from mixed sources', () => {
  const weeks = ['2025-10-01', '2025-10-08', '2025-10-15', '2025-10-22', '2025-10-29'];
  const d = data({
    externalHires: weeks.map((w, i) => ({ id: 'h' + i, date: w, event: 'Training', provider: 'Coach', amount: 70 })),
    attendance: weeks.flatMap((w, i) => Array.from({ length: 20 - i * 2 }, (_, j) => ({ id: `a${i}-${j}`, date: w, event: 'training', count: 1 }))),
    ticketSales: [
      { id: 't1', date: '2025-11-10', event: 'Winter Ball', ticketType: 'Member', quantity: 2, amount: 60 },
      { id: 't2', date: '2025-12-01', event: 'winter ball', ticketType: 'Non-member', quantity: 1, amount: 40 },
    ],
    eventCosts: [
      { id: 'c1', date: '2025-11-01', event: 'Winter Ball', item: 'Deposit', amount: 50 },
      { id: 'c2', date: '2025-12-12', event: 'Winter Ball', item: 'Venue', amount: 100, costType: 'fixed' },
      { id: 'c3', date: '2025-09-10', item: 'Kit', amount: 200 },
    ],
    memberships: [{ id: 'm1', date: '2025-09-20', name: 'A', amount: 30 }, { id: 'm2', date: '2025-09-21', name: 'B', amount: 30 }],
  });
  const model = M.build(d, '2025/26');
  const tr = model.eventMap.get('training');
  assert.equal(tr.kind, 'recurring');
  assert.equal(tr.frequency, 'Weekly');
  assert.equal(tr.sessionCount, 5);
  assert.equal(tr.attendees, 20 + 18 + 16 + 14 + 12);
  assert.equal(tr.sessions[4].attendees, 12);
  assert.equal(tr.goal, 'service');
  const ball = model.eventMap.get('winter ball');
  assert.equal(ball.kind, 'oneoff');
  assert.equal(ball.name, 'Winter Ball');
  assert.equal(ball.eventDate, '2025-12-12');
  assert.equal(ball.ticketsSold, 3);
  assert.equal(ball.net, 100 - 150);
  assert.equal(ball.salesCurve[1].daysBefore, 11);
  const s = M.summary(model);
  assert.equal(s.members, 2);
  assert.equal(s.generalSpend, 200);
  assert.equal(s.income, 160);
  assert.equal(s.spending, 350 + 150 + 200);
});

test('event aliases merge names and meta overrides kind/goal', () => {
  const d = data({
    ticketSales: [
      { id: 't1', date: '2025-11-10', event: 'Xmas Ball', amount: 10 },
      { id: 't2', date: '2025-11-11', event: 'Winter Ball', amount: 10 },
    ],
  }, { eventAliases: { 'xmas ball': 'winter ball' }, eventMeta: { 'winter ball': { goal: 'fundraiser', kind: 'recurring' } } });
  const model = M.build(d);
  assert.equal(model.events.length, 1);
  assert.equal(model.events[0].goal, 'fundraiser');
  assert.equal(model.events[0].kind, 'recurring');
});

test('timeSeries and balance', () => {
  const d = data({
    memberships: [{ id: 'm1', date: '2025-09-20', amount: 30 }, { id: 'm2', date: '2025-11-21', amount: 30 }],
    eventCosts: [{ id: 'c1', date: '2025-10-01', amount: 20 }],
  });
  const model = M.build(d);
  const ts = M.timeSeries(model.tx, { gran: 'month', fyStart: 8, split: (t) => t.stream, value: (t) => t.amount });
  assert.equal(ts.periods.length, 3);
  assert.deepEqual(ts.series.find((s) => s.key === 'memberships').values, [30, 0, 30]);
  const b = M.balanceSeries(model, 'month', 100);
  assert.deepEqual(b.balance, [130, 110, 140]);
});
