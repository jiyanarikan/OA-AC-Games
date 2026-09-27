const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/util.js');
require('../js/schema.js');
require('../js/master.js');
require('../js/insights.js');
const { master: M, insights: I } = globalThis.SF;

const base = (records, extra) => ({
  settings: { fyStartMonth: 8, currency: '£' },
  records: { memberships: [], ticketSales: [], otherIncome: [], eventCosts: [], externalHires: [], attendance: [], ...records },
  eventAliases: {}, eventMeta: {}, ...extra,
});

test('fundraiser that lost money needs attention with a pricing fix', () => {
  const d = base({
    ticketSales: [
      { id: 't1', date: '2025-11-01', event: 'Quiz', ticketType: 'Member', quantity: 20, amount: 100 },
      { id: 't2', date: '2025-11-02', event: 'Quiz', ticketType: 'Non-member', quantity: 10, amount: 55 },
    ],
    eventCosts: [{ id: 'c', date: '2025-11-05', event: 'Quiz', item: 'Room', amount: 200 }, { id: 'c2', date: '2025-11-05', event: 'Quiz', item: 'Prizes', amount: 40 }],
  }, { eventMeta: { quiz: { goal: 'fundraiser' } } });
  const model = M.build(d);
  const v = I.rateEvent(model.events[0], I.context(model, '£'));
  assert.equal(v.rating, 'review');
  const pricing = v.recs.filter((r) => r.area === 'Pricing').map((r) => r.text).join(' ');
  assert.match(pricing, /£8\.00 instead of £5\.17/); // 240 / 30
  assert.doesNotMatch(pricing, /Non-member price by/); // would need +£8.50 on a £5.50 ticket: too steep to suggest
  assert.match(pricing, /only £0\.50 more/);
  assert.ok(v.recs.some((r) => r.area === 'Costs')); // room is 83% of costs
});

test('declining weekly service event suggests fortnightly with saving', () => {
  const weeks = Array.from({ length: 9 }, (_, i) => new Date(Date.UTC(2025, 9, 1 + i * 7)).toISOString().slice(0, 10));
  const d = base({
    externalHires: weeks.map((w, i) => ({ id: 'h' + i, date: w, event: 'Training', provider: 'Coach', amount: 60 })),
    attendance: weeks.map((w, i) => ({ id: 'a' + i, date: w, event: 'Training', count: 20 - i * 2 })),
  });
  const model = M.build(d);
  const ev = model.events[0];
  assert.equal(ev.goal, 'service');
  const v = I.rateEvent(ev, I.context(model, '£'));
  const freq = v.recs.find((r) => r.area === 'Frequency');
  assert.ok(freq, 'frequency recommendation');
  assert.match(freq.text, /fortnightly/);
  assert.match(freq.text, /£270\.00/); // 9 sessions / 2 * £60
});

test('surplus break-even event suggests cheaper tickets', () => {
  const d = base({
    ticketSales: [{ id: 't', date: '2025-10-01', event: 'Social', quantity: 50, amount: 500 }],
    eventCosts: [{ id: 'c', date: '2025-10-03', event: 'Social', item: 'Room', amount: 200 }],
  });
  const model = M.build(d);
  const v = I.rateEvent(model.events[0], I.context(model, '£'));
  assert.equal(v.rating, 'strong');
  assert.ok(v.recs.some((r) => /cut tickets by up to £6\.00/.test(r.text)));
});

test('membership fee formula and society insights', () => {
  assert.equal(I.membershipFee({ costsToCover: 1100, otherIncome: 100, members: 50, buffer: 0.1 }), 22);
  const d = base({
    memberships: Array.from({ length: 12 }, (_, i) => ({ id: 'm' + i, date: '2025-09-2' + (i % 9), name: 'P' + i, amount: 20 })),
    eventCosts: [{ id: 'k', date: '2025-10-01', item: 'Kit', amount: 400 }],
  });
  const model = M.build(d, '2025/26');
  const list = I.society(model, { sym: '£', data: d, allModel: M.build(d) });
  const titles = list.map((x) => x.title);
  assert.ok(titles.includes('Overall result'));
  assert.ok(titles.includes('Membership price check'));
  assert.match(list.find((x) => x.title === 'Membership price check').text, /£33\.33/);
  const facts = I.factsForAI(model, { sym: '£', data: d, allModel: M.build(d) });
  assert.equal(facts.totals.members, 12);
  assert.ok(!JSON.stringify(facts).includes('P1'), 'no member names sent to AI');
});
