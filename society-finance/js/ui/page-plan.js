/*
 * Step 4 - Plan: event budget planner, membership price calculator, and a
 * next-year budget built from last year's actual figures.
 */
(function (root) {
  const SF = (root.SF = root.SF || {});
  const U = SF.util, S = SF.store, K = SF.kit, M = SF.master, I = SF.insights, CH = SF.charts;
  const el = U.el;
  SF.pages = SF.pages || {};

  const num = (v, d) => (v === '' || v == null || !isFinite(+v) ? d : +v);

  SF.pages.plan = function (host) {
    const body = K.page(host, { step: 4, title: 'Plan ahead', lead: 'Use what happened to decide what to do next: budget an event, test membership prices, or build next year’s budget.' });
    const cards = [
      { href: '#/plan/event', title: 'Event budget planner', desc: 'Plan an event’s tickets and fixed/variable costs before it happens, then compare with what actually happened. Includes break-even and net profit.' },
      { href: '#/plan/membership', title: 'Membership price calculator', desc: 'What should membership cost next year? Test member numbers and prices against what the society needs to cover.' },
      { href: '#/plan/budget', title: 'Next year’s budget', desc: 'Start from this year’s real figures, change sessions, prices and costs event by event, and see the projected result.' },
    ];
    body.append(el('div', { class: 'hub-grid' }, cards.map((c) => el('a', { class: 'hub-card', href: c.href }, el('h2', null, c.title), el('p', null, c.desc), el('span', { class: 'hub-go' }, 'Open', K.icon('arrow'))))));
    body.append(K.next({ prev: { href: '#/analyse', label: 'Analyse' }, href: '#/report', label: 'Next: annual report' }));
  };

  // ---------------- event planner (wraps ui-events) ----------------

  SF.pages.planEvent = function (host) {
    const body = K.page(host, {
      step: 4, back: { href: '#/plan', label: 'Plan ahead' }, title: 'Event budget planner',
      lead: 'Before the event: enter ticket prices, expected sales and planned costs. Afterwards: fill in the actuals (or pull them from your uploaded data) to compare.',
    });
    body.append(el('div', { id: 'events-body', class: 'planner' }));
    SF.uiEvents.render();
  };

  // ---------------- membership price ----------------

  SF.pages.planMembership = function (host) {
    const body = K.page(host, {
      step: 4, back: { href: '#/plan', label: 'Plan ahead' }, title: 'Membership price calculator',
      lead: 'Memberships usually fund whatever tickets and sponsorship don’t cover: training, subsidised socials, kit, insurance. This works out the fee that covers it, and shows what happens if more or fewer people join.',
    });
    if (!SF.app.hasData()) return body.append(K.empty({ title: 'No data yet', text: 'The calculator starts from your actual figures. Add data first.', action: { href: '#/add', label: 'Add data' } }));
    body.append(K.filterBar({ gran: false, allowAll: false }));
    const model = SF.app.model();
    const s = M.summary(model);
    const p = (S.data.planMembership = S.data.planMembership || {});
    const key = model.fy;
    const cur = p[key] || {};
    const inputs = {
      members: num(cur.members, s.members),
      spending: num(cur.spending, Math.round(s.spending)),
      tickets: num(cur.tickets, Math.round(s.byStream.tickets)),
      other: num(cur.other, Math.round(s.byStream.otherIncome)),
      buffer: num(cur.buffer, 5),
    };
    const setInput = (k, v) => { p[key] = { ...inputs, [k]: v === '' ? '' : +v }; S.save(); SF.app.render(); };
    const field = (k, label, hint, attrs) => el('label', { class: 'field' }, label,
      el('input', { type: 'number', step: 'any', min: 0, value: inputs[k], onchange: (e) => setInput(k, e.target.value), ...attrs }),
      hint ? el('span', { class: 'hint' }, hint) : null);

    const needed = I.membershipFee({ costsToCover: inputs.spending - inputs.tickets, otherIncome: inputs.other, members: inputs.members, buffer: inputs.buffer / 100 });
    const c = K.card({ title: 'Your assumptions', desc: `Pre-filled from ${model.fy}. Change any number to test a scenario.`,
      actions: el('button', { class: 'btn ghost small', onclick: () => { delete p[key]; S.save(); SF.app.render(); } }, 'Reset to actual figures') });
    c.body.append(el('div', { class: 'grid-3' },
      field('members', 'Members expected', `${model.fy}: ${U.fmtNum(s.members)}`),
      field('spending', 'Total spending planned', `${model.fy}: ${K.money(s.spending, { whole: true })}`),
      field('tickets', 'Ticket income expected', `${model.fy}: ${K.money(s.byStream.tickets, { whole: true })}`),
      field('other', 'Sponsorship & grants expected', `${model.fy}: ${K.money(s.byStream.otherIncome, { whole: true })}`),
      field('buffer', 'Safety buffer (%)', 'Extra on top to build a small reserve; 5–10% is common.')));
    body.append(c.el);

    const gap = inputs.spending - inputs.tickets - inputs.other;
    body.append(K.stats([
      { label: 'Memberships need to cover', value: K.money(gap * (1 + inputs.buffer / 100), { whole: true }), sub: `spending − tickets − sponsorship${inputs.buffer ? ` + ${inputs.buffer}% buffer` : ''}` },
      { label: 'Break-even average fee', value: needed != null ? K.money(needed) : '–', tone: 'key' },
      { label: 'Current average fee', value: s.avgFee ? K.money(s.avgFee) : '–', sub: needed != null && s.avgFee ? `${K.money(needed - s.avgFee, { signed: true })} difference` : null },
      { label: 'Members needed at current fee', value: s.avgFee ? U.fmtNum(Math.ceil((gap * (1 + inputs.buffer / 100)) / s.avgFee)) : '–' },
    ]));

    // tiers
    const mem = model.tx.filter((t) => t.stream === 'memberships');
    const types = new Map();
    for (const t of mem) { const g = types.get(t.detail) || { n: 0, rev: 0 }; g.n++; g.rev += t.amount; types.set(t.detail, g); }
    if (types.size > 1 && needed != null && s.avgFee) {
      const scale = needed / s.avgFee;
      const tc = K.card({ title: 'Suggested price for each membership type', desc: 'Keeps the same gap between types as now, and assumes the same mix of types. Round to a friendly number before publishing.' });
      tc.body.append(K.table({
        columns: [{ key: 'type', label: 'Type' }, { key: 'share', label: 'Share of members', pct: true }, { key: 'price', label: 'Current price', money: true }, { key: 'suggested', label: 'Break-even price', money: true }, { key: 'rounded', label: 'Rounded', money: true }],
        rows: [...types.entries()].sort((a, b) => b[1].n - a[1].n).map(([type, g]) => {
          const price = g.rev / g.n;
          return { type, share: g.n / mem.length, price, suggested: price * scale, rounded: Math.ceil((price * scale) / 0.5) * 0.5 };
        }), exportName: 'Membership price by type',
      }));
      body.append(tc.el);
    }

    // sensitivity
    const base = inputs.members || 1;
    const memberSteps = [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3].map((f) => Math.max(1, Math.round(base * (1 + f))));
    const feeSet = new Set([s.avgFee, needed].filter((x) => x != null).map((x) => Math.round(x * 2) / 2));
    const around = needed || s.avgFee || 20;
    [-10, -5, 5, 10].forEach((d) => feeSet.add(Math.max(1, Math.round(around + d))));
    const fees = [...feeSet].sort((a, b) => a - b);
    const target = gap * (1 + inputs.buffer / 100);
    const sc = K.card({ title: 'What if more or fewer people join?', desc: 'Surplus (+) or shortfall (−) against what memberships need to cover, for each combination of members and average fee.' });
    sc.body.append(el('div', { class: 'table-scroll' }, el('table', { class: 'data sensitivity' },
      el('thead', null, el('tr', null, el('th', null, 'Members ↓ / Fee →'), fees.map((f) => el('th', { class: 'num' }, K.money(f))))),
      el('tbody', null, memberSteps.map((n) => el('tr', { class: n === base ? 'current-row' : null },
        el('th', { scope: 'row' }, U.fmtNum(n), n === base ? el('span', { class: 'muted' }, ' (expected)') : null),
        fees.map((f) => {
          const v = n * f - target;
          return el('td', { class: 'num ' + (v >= 0 ? 'pos-cell' : 'neg-cell') }, K.money(v, { signed: true, whole: true }));
        })))))));
    sc.body.append(el('p', { class: 'hint' }, 'A lower fee can attract more members. If a £5 cut would bring in enough extra people to stay in a positive cell, it may be the better choice for the society.'));
    body.append(sc.el);
    body.append(K.next({ prev: { href: '#/plan', label: 'Plan ahead' }, href: '#/plan/budget', label: 'Next: next year’s budget' }));
  };

  // ---------------- next year's budget ----------------

  function defaultsFor(model) {
    const s = M.summary(model);
    const rows = {};
    for (const e of model.events) {
      const variable = U.sum(e.tx.filter((t) => t.kind === 'expense' && t.costType === 'variable'), (t) => t.amount);
      const n = e.sessionCount || 1;
      rows[e.key] = {
        name: e.name, kind: e.kind, sessions: n,
        people: Math.round(e.perSession.attendees * 10) / 10,
        price: e.avgPrice ? Math.round(e.avgPrice * 100) / 100 : 0,
        other: Math.round(e.otherIncome),
        fixed: Math.round(((e.costs - variable) / n) * 100) / 100,
        perHead: e.attendees ? Math.round((variable / e.attendees) * 100) / 100 : 0,
        include: true,
      };
    }
    return { baseFy: model.fy, rows, members: s.members, fee: s.avgFee ? Math.round(s.avgFee * 100) / 100 : 0, sponsorship: Math.round(s.byStream.otherIncome - U.sum(model.events, (e) => e.otherIncome)), general: Math.round(s.generalSpend), extra: [] };
  }

  function project(b) {
    const rows = Object.entries(b.rows).map(([key, r]) => {
      const people = num(r.people, 0) * num(r.sessions, 0);
      const income = people * num(r.price, 0) + num(r.other, 0);
      const costs = num(r.fixed, 0) * num(r.sessions, 0) + num(r.perHead, 0) * people;
      return { key, ...r, totalPeople: people, income, costs, net: income - costs };
    });
    const inc = rows.filter((r) => r.include);
    const membership = num(b.members, 0) * num(b.fee, 0);
    const income = U.sum(inc, (r) => r.income) + membership + num(b.sponsorship, 0);
    const spending = U.sum(inc, (r) => r.costs) + num(b.general, 0);
    return { rows, membership, income, spending, net: income - spending };
  }

  SF.pages.planBudget = function (host) {
    const body = K.page(host, {
      step: 4, back: { href: '#/plan', label: 'Plan ahead' }, title: 'Next year’s budget',
      lead: 'Starts from a year’s actual figures. Change the number of sessions, expected people, prices and costs, and the projected result updates as you type.',
    });
    if (!SF.app.hasData()) return body.append(K.empty({ title: 'No data yet', text: 'The budget starts from your actual figures. Add data first.', action: { href: '#/add', label: 'Add data' } }));
    body.append(K.filterBar({ gran: false, allowAll: false, extra: el('span', { class: 'hint' }, 'The year selected here is the starting point.') }));
    const model = SF.app.model();
    let b = S.data.budget;
    if (!b || b.baseFy !== model.fy) { b = S.data.budget = defaultsFor(model); S.save(); }

    const summaryHost = el('div');
    const chartHost = el('div', { class: 'chart-host' });
    const cells = new Map();
    const refresh = () => {
      const p = project(b);
      U.clear(summaryHost).append(K.stats([
        { label: 'Projected income', value: K.money(p.income, { whole: true }) },
        { label: 'Projected spending', value: K.money(p.spending, { whole: true }) },
        { label: p.net >= 0 ? 'Projected surplus' : 'Projected deficit', value: K.money(Math.abs(p.net), { whole: true }), tone: p.net < 0 ? 'neg' : 'pos', sub: p.income ? `${U.fmtPct(p.net / p.income)} of income` : null },
        { label: 'From memberships', value: K.money(p.membership, { whole: true }), sub: `${U.fmtNum(num(b.members, 0))} × ${K.money(num(b.fee, 0))}` },
      ]));
      for (const r of p.rows) {
        const c = cells.get(r.key);
        if (!c) continue;
        c.income.textContent = K.money(r.income, { whole: true });
        c.costs.textContent = K.money(r.costs, { whole: true });
        c.net.textContent = K.money(r.net, { signed: true, whole: true });
        c.net.className = 'num ' + (r.net < 0 ? 'neg-text' : '');
      }
      const inc = p.rows.filter((r) => r.include).sort((x, y) => y.net - x.net);
      if (chartHost.isConnected) CH.hbars(chartHost, { rows: inc.map((r) => ({ label: r.name, value: r.net })), sym: K.sym(), aria: 'Projected result by event' });
    };
    const save = () => { S.save(); refresh(); };
    const inp = (obj, k, attrs) => el('input', { type: 'number', step: 'any', value: obj[k], class: 'cell-input', ...attrs, oninput: (e) => { obj[k] = e.target.value === '' ? '' : +e.target.value; save(); } });

    body.append(summaryHost);
    const tc = K.card({
      title: 'Events and activities', desc: `Starting figures are ${b.baseFy} actuals. “Fixed per session” is costs that don’t depend on turnout (venue, coach); “per person” scales with attendance (food, travel).`,
      actions: [
        el('button', { class: 'btn ghost small', onclick: () => { S.data.budget = defaultsFor(model); S.save(); SF.app.render(); } }, 'Reset to actual figures'),
        el('button', { class: 'btn small', onclick: () => exportBudget(b) }, 'Download as Excel'),
      ],
    });
    const rows = Object.entries(b.rows).map(([key, r]) => {
      const c = { income: el('td', { class: 'num' }), costs: el('td', { class: 'num' }), net: el('td', { class: 'num' }) };
      cells.set(key, c);
      return el('tr', { class: r.include ? null : 'excluded' },
        el('td', null, el('input', { type: 'checkbox', checked: r.include, 'aria-label': `Include ${r.name}`, onchange: (e) => { r.include = e.target.checked; save(); e.target.closest('tr').classList.toggle('excluded', !r.include); } })),
        el('th', { scope: 'row' }, r.name, el('div', { class: 'muted small' }, r.kind === 'recurring' ? 'recurring' : 'one-off')),
        el('td', null, inp(r, 'sessions', { min: 0, step: 1, 'aria-label': 'Sessions' })),
        el('td', null, inp(r, 'people', { min: 0, 'aria-label': 'People per session' })),
        el('td', null, inp(r, 'price', { min: 0, 'aria-label': 'Average ticket price' })),
        el('td', null, inp(r, 'fixed', { min: 0, 'aria-label': 'Fixed costs per session' })),
        el('td', null, inp(r, 'perHead', { min: 0, 'aria-label': 'Cost per person' })),
        el('td', null, inp(r, 'other', { min: 0, 'aria-label': 'Sponsorship for this event' })),
        c.income, c.costs, c.net);
    });
    tc.body.append(el('div', { class: 'table-scroll' }, el('table', { class: 'data budget' },
      el('thead', null, el('tr', null, el('th', null, el('span', { class: 'visually-hidden' }, 'Include')), el('th', null, 'Event'), el('th', null, 'Sessions'), el('th', null, 'People / session'),
        el('th', null, 'Avg ticket'), el('th', null, 'Fixed / session'), el('th', null, 'Cost / person'), el('th', null, 'Sponsorship'), el('th', { class: 'num' }, 'Income'), el('th', { class: 'num' }, 'Costs'), el('th', { class: 'num' }, 'Result'))),
      el('tbody', null, rows))));
    body.append(tc.el);

    const oc = K.card({ title: 'Memberships and society-wide items' });
    oc.body.append(el('div', { class: 'grid-3' },
      el('label', { class: 'field' }, 'Members expected', inp(b, 'members', { min: 0, step: 1 })),
      el('label', { class: 'field' }, 'Average membership fee', inp(b, 'fee', { min: 0 }), el('a', { class: 'hint', href: '#/plan/membership' }, 'Work out a fee →')),
      el('label', { class: 'field' }, 'General sponsorship & grants', inp(b, 'sponsorship', { min: 0 })),
      el('label', { class: 'field' }, 'General running costs (kit, insurance, fees)', inp(b, 'general', { min: 0 }))));
    body.append(oc.el);

    const cc = K.card({ title: 'Projected result by event', desc: 'Which activities the budget expects to make or cost money.' });
    cc.body.append(chartHost);
    body.append(cc.el);
    K.defer(refresh);
    body.append(K.next({ prev: { href: '#/plan/membership', label: 'Membership price' }, href: '#/report', label: 'Next: annual report' }));
  };

  async function exportBudget(b) {
    const X = SF.excel;
    const p = project(b);
    const wb = X.newWorkbook();
    const ws = wb.addWorksheet('Budget');
    const rows = p.rows.filter((r) => r.include).map((r, i) => {
      const n = i + 2;
      return { name: r.name, sessions: num(r.sessions, 0), people: num(r.people, 0), price: num(r.price, 0), fixed: num(r.fixed, 0), perHead: num(r.perHead, 0), other: num(r.other, 0),
        income: { formula: `B${n}*C${n}*D${n}+G${n}`, result: r.income }, costs: { formula: `E${n}*B${n}+F${n}*C${n}*B${n}`, result: r.costs }, net: { formula: `H${n}-I${n}`, result: r.net } };
    });
    const last = rows.length + 1;
    rows.push({ name: 'Memberships', people: num(b.members, 0), price: num(b.fee, 0), income: { formula: `C${last + 1}*D${last + 1}`, result: p.membership }, net: { formula: `H${last + 1}`, result: p.membership } });
    rows.push({ name: 'General sponsorship & grants', income: num(b.sponsorship, 0), net: num(b.sponsorship, 0) });
    rows.push({ name: 'General running costs', costs: num(b.general, 0), net: -num(b.general, 0) });
    const end = rows.length + 1;
    rows.push({ name: 'Total', income: { formula: `SUM(H2:H${end})`, result: p.income }, costs: { formula: `SUM(I2:I${end})`, result: p.spending }, net: { formula: `SUM(J2:J${end})`, result: p.net }, _bold: true });
    X.addTable(ws, 1, [
      { header: 'Item', key: 'name', width: 30 }, { header: 'Sessions', key: 'sessions', width: 10 }, { header: 'People per session / members', key: 'people', width: 14 },
      { header: 'Avg ticket / fee', key: 'price', width: 14, money: true }, { header: 'Fixed per session', key: 'fixed', width: 14, money: true }, { header: 'Cost per person', key: 'perHead', width: 14, money: true },
      { header: 'Sponsorship', key: 'other', width: 12, money: true }, { header: 'Income', key: 'income', width: 14, money: true }, { header: 'Costs', key: 'costs', width: 14, money: true }, { header: 'Result', key: 'net', width: 14, money: true },
    ], rows, K.sym());
    await X.saveWorkbook(wb, `budget-from-${String(b.baseFy).replace('/', '-')}.xlsx`);
  }
})(typeof window !== 'undefined' ? window : globalThis);
