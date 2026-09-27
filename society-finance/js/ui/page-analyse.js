/*
 * Step 3 - Analyse. A hub of analysis options, then one page per topic.
 * Every page: filter bar (financial year + week/month/term/quarter/year),
 * headline numbers, charts with a table view, and plain-English insights.
 */
(function (root) {
  const SF = (root.SF = root.SF || {});
  const U = SF.util, S = SF.store, K = SF.kit, M = SF.master, I = SF.insights, CH = SF.charts;
  const el = U.el;
  SF.pages = SF.pages || {};

  const st = () => SF.app.state;
  const incomeStreams = M.STREAMS.filter((s) => s.kind === 'income');
  const expenseStreams = M.STREAMS.filter((s) => s.kind === 'expense');
  const granLabel = () => M.GRANS.find((g) => g.key === st().gran).label.toLowerCase();

  function noData(body) {
    body.append(K.empty({ title: 'Nothing to analyse yet', text: 'Add your spreadsheets first, or load the demo data from Settings to explore.', action: { href: '#/add', label: 'Go to Add data' } }));
  }

  /** Stream time series for the current filters. */
  function streamSeries(model, streams, extraFilter) {
    const w = M.window(model);
    const keys = new Set(streams.map((s) => s.key));
    const ts = M.timeSeries(model.tx.filter((t) => keys.has(t.stream) && (!extraFilter || extraFilter(t))), {
      gran: st().gran, fyStart: model.fyStart, from: w.from, to: w.to,
      split: (t) => t.stream, value: (t) => t.amount, seriesOrder: streams,
    });
    ts.series.forEach((s) => { s.color = K.colors[s.key]; });
    return ts;
  }

  /** Table of periods × series with total and change vs previous period. */
  function periodTable(ts, o) {
    const fmtKey = o.format === 'count' ? { count: true } : { money: true };
    const rows = ts.periods.map((p, i) => {
      const r = { period: p.label };
      ts.series.forEach((s) => (r[s.key] = s.values[i]));
      r.total = ts.totals[i];
      r.change = i ? (ts.totals[i - 1] ? (ts.totals[i] - ts.totals[i - 1]) / Math.abs(ts.totals[i - 1]) : null) : null;
      return r;
    });
    const foot = { period: 'Total' };
    ts.series.forEach((s) => (foot[s.key] = U.sum(s.values)));
    foot.total = U.sum(ts.totals);
    const cols = [{ key: 'period', label: o.periodLabel || 'Period' }]
      .concat(ts.series.length > 1 || o.showSeries ? ts.series.map((s) => ({ key: s.key, label: s.label, ...fmtKey })) : [])
      .concat([{ key: 'total', label: o.totalLabel || 'Total', ...fmtKey }])
      .concat(o.change === false ? [] : [{ key: 'change', label: 'vs previous', format: (v) => (v == null ? '–' : U.fmtPct(v, true)) }]);
    return K.table({ columns: cols, rows, foot, exportName: o.exportName });
  }

  // ---------------- hub ----------------

  SF.pages.analyse = function (host) {
    const body = K.page(host, {
      step: 3, title: 'Analyse',
      lead: 'Choose what you want to look at. Every analysis uses your master dataset and can be viewed by week, month, term, quarter or year, as a chart or a table.',
    });
    if (!SF.app.hasData()) return noData(body);
    body.append(K.filterBar({ gran: false }));
    const model = SF.app.model();
    const s = M.summary(model);
    const evs = model.events;
    const ctx = I.context(model, K.sym());
    const attention = evs.filter((e) => I.rateEvent(e, ctx).rating === 'review').length;
    const hires = s.byStream.hires;
    const cards = [
      { href: '#/analyse/overview', title: 'Overview', desc: 'The whole picture: income vs spending over time, where money comes from and goes, key findings.', stat: `${K.money(s.net, { signed: true, whole: true })} ${s.net >= 0 ? 'surplus' : 'deficit'}` },
      { href: '#/events', title: 'Events', desc: 'Which events work for the society, one-off vs recurring, timelines, pricing and frequency advice.', stat: `${evs.length} events${attention ? ` · ${attention} need attention` : ''}` },
      { href: '#/analyse/income', title: 'Income', desc: 'Memberships, tickets and sponsorship by period and by event.', stat: K.money(s.income, { whole: true }) },
      { href: '#/analyse/spending', title: 'Spending', desc: 'Event costs, coaching and general running costs; biggest items and suppliers.', stat: K.money(s.spending, { whole: true }) },
      { href: '#/analyse/cash', title: 'Cash flow & balance', desc: 'Money in and out each period, running bank balance and the tightest month.', stat: 'Net ' + K.money(s.net, { signed: true, whole: true }) },
      { href: '#/analyse/memberships', title: 'Memberships', desc: 'Sign-ups over time, membership types, when people join and what members get back.', stat: `${U.fmtNum(s.members)} members` },
      { href: '#/analyse/coaching', title: 'Coaching & hires', desc: 'What coaches and external help cost per session, per hour and per person.', stat: hires ? K.money(hires, { whole: true }) : 'No hires yet' },
      { href: '#/analyse/compare', title: 'Compare years', desc: 'This year against previous years: income, spending, members and events.', stat: `${SF.app.fys().length} year${SF.app.fys().length === 1 ? '' : 's'} of data` },
    ];
    body.append(el('div', { class: 'hub-grid' }, cards.map((c) => el('a', { class: 'hub-card', href: c.href },
      el('h2', null, c.title), el('p', null, c.desc), el('div', { class: 'hub-stat' }, c.stat), el('span', { class: 'hub-go' }, 'Open', K.icon('arrow'))))));
  };

  // ---------------- overview ----------------

  SF.pages.overview = function (host) {
    const body = K.page(host, { step: 3, back: { href: '#/analyse', label: 'All analyses' }, title: 'Overview', lead: 'The year at a glance. Hover over or tap any chart for exact figures.' });
    if (!SF.app.hasData()) return noData(body);
    body.append(K.filterBar({}));
    const model = SF.app.model();
    const s = M.summary(model);
    body.append(K.stats([
      { label: 'Income', value: K.money(s.income, { whole: true }) },
      { label: 'Spending', value: K.money(s.spending, { whole: true }) },
      { label: s.net >= 0 ? 'Surplus' : 'Deficit', value: K.money(Math.abs(s.net), { whole: true }), sub: s.income ? `${U.fmtPct(s.net / s.income)} of income` : null, tone: s.net < 0 ? 'neg' : 'pos' },
      { label: 'Members', value: U.fmtNum(s.members), sub: s.avgFee ? `avg fee ${K.money(s.avgFee)}` : null },
      { label: 'Event attendances', value: U.fmtNum(s.attendees), sub: `${s.events} events & activities` },
      { label: 'Spent per member', value: s.spendPerMember != null ? K.money(s.spendPerMember) : '–', sub: 'all spending ÷ members' },
    ]));

    const w = M.window(model);
    const io = M.timeSeries(model.tx, {
      gran: st().gran, fyStart: model.fyStart, from: w.from, to: w.to, split: (t) => t.kind, value: (t) => t.amount,
      seriesOrder: [{ key: 'income', label: 'Income' }, { key: 'expense', label: 'Spending' }],
    });
    io.series.forEach((x) => (x.color = K.colors[x.key]));
    body.append(K.chartCard({
      id: 'ov-io', title: `Income and spending by ${granLabel()}`, desc: 'Each pair of bars is one period. Where orange is taller than blue, the society spent more than it took in.',
      draw: (c) => CH.bars(c, { labels: io.periods.map((p) => p.label), series: io.series, sym: K.sym(), aria: 'Income and spending by period' }),
      table: () => {
        const rows = io.periods.map((p, i) => ({ period: p.label, income: io.series[0].values[i], spending: io.series[1].values[i], net: io.series[0].values[i] - io.series[1].values[i] }));
        return K.table({ columns: [{ key: 'period', label: 'Period' }, { key: 'income', label: 'Income', money: true }, { key: 'spending', label: 'Spending', money: true }, { key: 'net', label: 'Net', money: true, cls: (v) => (v < 0 ? 'neg-text' : '') }],
          rows, foot: { period: 'Total', income: s.income, spending: s.spending, net: s.net }, exportName: 'Income and spending' });
      },
    }));

    const mix = (streams, title, desc, id) => {
      const total = U.sum(streams, (x) => s.byStream[x.key]);
      const rows = streams.map((x) => ({ label: x.label, value: s.byStream[x.key], color: K.colors[x.key], sub: total ? U.fmtPct(s.byStream[x.key] / total) + ' of total' : '' }));
      return K.chartCard({
        id, title, desc,
        draw: (c) => CH.hbars(c, { rows, sym: K.sym(), aria: title }),
        table: () => K.table({ columns: [{ key: 'label', label: 'Source' }, { key: 'value', label: 'Amount', money: true }, { key: 'share', label: 'Share', pct: true }],
          rows: rows.map((r) => ({ ...r, share: total ? r.value / total : null })), foot: { label: 'Total', value: total, share: 1 }, exportName: title }),
      });
    };
    body.append(el('div', { class: 'grid-2 cards' },
      mix(incomeStreams, 'Where the money came from', 'Income by source.', 'ov-inmix'),
      mix(expenseStreams, 'Where the money went', 'Spending by type. "Expenses" includes event costs and general costs like kit.', 'ov-outmix')));

    // events snapshot
    const ctx = I.context(model, K.sym());
    const ev = K.card({ title: 'Events at a glance', desc: 'Each event is judged against its purpose. Open Events for timelines and advice.', actions: el('a', { class: 'btn small', href: '#/events' }, 'All events', K.icon('arrow')) });
    ev.body.append(eventMiniTable(model, ctx, 6));
    body.append(ev.el);

    const ins = K.card({ title: 'Key findings', desc: 'Worked out automatically from your data, for a society rather than a business: sustainable finances and value for members come first.' });
    ins.body.append(K.insightList(I.society(model, { sym: K.sym(), openingBalance: S.data.settings.openingBalance, allModel: SF.app.model('all'), data: S.data })));
    body.append(ins.el);
    body.append(SF.ai.card({ scope: 'overview', model }));
    body.append(K.next({ prev: { href: '#/analyse', label: 'All analyses' }, href: '#/events', label: 'Next: events' }));
  };

  function eventMiniTable(model, ctx, limit) {
    const rows = model.events.map((e) => ({ e, v: I.rateEvent(e, ctx) }))
      .sort((a, b) => ['review', 'ok', 'strong', 'nodata'].indexOf(a.v.rating) - ['review', 'ok', 'strong', 'nodata'].indexOf(b.v.rating))
      .slice(0, limit || 99)
      .map(({ e, v }) => ({
        name: e.name, type: e.kind === 'recurring' ? `${e.frequency} · ${e.sessionCount}` : 'One-off', purpose: M.GOALS[e.goal].label,
        attendees: e.attendees, net: e.net, rating: v.rating,
        _onClick: () => { location.hash = `#/events/${encodeURIComponent(e.key)}`; }, _cls: 'clickable',
      }));
    if (!rows.length) return el('p', { class: 'muted' }, 'No events found. Add ticket sales, expenses or attendance with event names.');
    return K.table({
      columns: [
        { key: 'name', label: 'Event' }, { key: 'type', label: 'Type' }, { key: 'purpose', label: 'Purpose' },
        { key: 'attendees', label: 'Attendances', count: true }, { key: 'net', label: 'Result', money: true, cls: (v) => (v < 0 ? 'neg-text' : '') },
        { key: 'rating', label: 'Rating', format: (v) => K.badge(v), exportValue: (v) => I.RATINGS[v].label },
      ], rows,
    });
  }
  SF.pages.eventMiniTable = eventMiniTable;

  // ---------------- income ----------------

  SF.pages.income = function (host) {
    const body = K.page(host, { step: 3, back: { href: '#/analyse', label: 'All analyses' }, title: 'Income', lead: 'Where the society’s money comes from and when it arrives.' });
    if (!SF.app.hasData()) return noData(body);
    body.append(K.filterBar({}));
    const model = SF.app.model();
    const s = M.summary(model);
    body.append(K.stats([{ label: 'Total income', value: K.money(s.income, { whole: true }) }]
      .concat(incomeStreams.map((x) => ({ label: x.label, value: K.money(s.byStream[x.key], { whole: true }), sub: s.income ? U.fmtPct(s.byStream[x.key] / s.income) + ' of income' : null })))));

    const ts = streamSeries(model, incomeStreams);
    body.append(K.chartCard({
      id: 'inc-ts', title: `Income by ${granLabel()}`, desc: 'Stacked by source. Hover a bar for the breakdown.',
      draw: (c) => CH.bars(c, { labels: ts.periods.map((p) => p.label), series: ts.series, stacked: true, sym: K.sym(), aria: 'Income by period and source' }),
      table: () => periodTable(ts, { exportName: 'Income by period' }),
    }));

    // by event
    const evRows = model.events.filter((e) => e.income > 0).sort((a, b) => b.income - a.income);
    body.append(K.chartCard({
      id: 'inc-ev', title: 'Income by event', desc: 'Ticket sales plus any sponsorship given for a specific event.',
      draw: (c) => (evRows.length ? CH.hbars(c, { rows: evRows.map((e) => ({ label: e.name, value: e.income, color: '--c-tickets', onClick: () => { location.hash = `#/events/${encodeURIComponent(e.key)}`; } })), sym: K.sym(), aria: 'Income by event' }) : c.append(el('p', { class: 'muted' }, 'No event income.'))),
      table: () => K.table({
        columns: [{ key: 'name', label: 'Event' }, { key: 'sold', label: 'Tickets sold', count: true }, { key: 'avg', label: 'Avg ticket', money: true },
          { key: 'tickets', label: 'Ticket income', money: true }, { key: 'other', label: 'Sponsorship', money: true }, { key: 'total', label: 'Total', money: true }],
        rows: evRows.map((e) => ({ name: e.name, sold: e.ticketsSold, avg: e.avgPrice, tickets: e.ticketIncome, other: e.otherIncome, total: e.income })),
        exportName: 'Income by event',
      }),
    }));

    // ticket pricing across events
    const priced = model.events.filter((e) => e.tiers.length);
    if (priced.length) {
      const c = K.card({ title: 'Ticket prices across events', desc: 'Every ticket type sold, so you can compare pricing between events and see how members and non-members buy.' });
      c.body.append(K.table({
        columns: [{ key: 'event', label: 'Event' }, { key: 'tier', label: 'Ticket type' }, { key: 'price', label: 'Avg price', money: true }, { key: 'qty', label: 'Sold', count: true }, { key: 'revenue', label: 'Income', money: true }, { key: 'share', label: 'Share of event’s tickets', pct: true }],
        rows: priced.flatMap((e) => e.tiers.map((t) => ({ event: e.name, tier: t.name, price: t.avgPrice, qty: t.qty, revenue: t.revenue, share: e.ticketsSold ? t.qty / e.ticketsSold : null }))),
        exportName: 'Ticket prices',
      }));
      body.append(c.el);
    }

    const other = model.tx.filter((t) => t.stream === 'otherIncome');
    const c2 = K.card({ title: 'Sponsorship, grants and fundraising', desc: other.length ? 'Money from outside ticket sales and memberships.' : 'None recorded. Students’ Union grants and local sponsors can take pressure off membership prices; add them in Step 1 if you have any.' });
    if (other.length) {
      const bySrc = new Map();
      for (const t of other) { const k = t.party || t.detail || 'Other'; bySrc.set(k, (bySrc.get(k) || 0) + t.amount); }
      c2.body.append(K.table({ columns: [{ key: 'src', label: 'From' }, { key: 'amount', label: 'Amount', money: true }, { key: 'share', label: 'Share', pct: true }],
        rows: [...bySrc.entries()].sort((a, b) => b[1] - a[1]).map(([src, amount]) => ({ src, amount, share: amount / s.byStream.otherIncome })), exportName: 'Sponsorship and grants' }));
    }
    body.append(c2.el);
    const ins = I.society(model, { sym: K.sym(), data: S.data }).filter((x) => /money comes from|join/i.test(x.title));
    if (ins.length) { const c3 = K.card({ title: 'Findings' }); c3.body.append(K.insightList(ins)); body.append(c3.el); }
    body.append(K.next({ prev: { href: '#/analyse', label: 'All analyses' }, href: '#/analyse/spending', label: 'Next: spending' }));
  };

  // ---------------- spending ----------------

  SF.pages.spending = function (host) {
    const body = K.page(host, { step: 3, back: { href: '#/analyse', label: 'All analyses' }, title: 'Spending', lead: 'Where the money goes: events, coaching and the general running costs of the society.' });
    if (!SF.app.hasData()) return noData(body);
    body.append(K.filterBar({}));
    const model = SF.app.model();
    const s = M.summary(model);
    body.append(K.stats([
      { label: 'Total spending', value: K.money(s.spending, { whole: true }) },
      { label: 'Expenses', value: K.money(s.byStream.expenses, { whole: true }) },
      { label: 'Coaching & hires', value: K.money(s.byStream.hires, { whole: true }) },
      { label: 'General running costs', value: K.money(s.generalSpend, { whole: true }), sub: 'not tied to an event' },
    ]));
    const ts = streamSeries(model, expenseStreams);
    body.append(K.chartCard({
      id: 'sp-ts', title: `Spending by ${granLabel()}`, desc: 'Stacked by type. Spikes usually line up with big events or bulk kit orders.',
      draw: (c) => CH.bars(c, { labels: ts.periods.map((p) => p.label), series: ts.series, stacked: true, sym: K.sym(), aria: 'Spending by period and type' }),
      table: () => periodTable(ts, { exportName: 'Spending by period' }),
    }));

    const evRows = model.events.filter((e) => e.costs > 0).map((e) => ({ label: e.name, value: e.costs, key: e.key }));
    if (s.generalSpend) evRows.push({ label: 'General running costs', value: s.generalSpend });
    evRows.sort((a, b) => b.value - a.value);
    body.append(K.chartCard({
      id: 'sp-ev', title: 'Spending by event', desc: 'What each event or activity cost in total (before any income).',
      draw: (c) => CH.hbars(c, { rows: evRows.map((r) => ({ ...r, color: '--c-expenses', onClick: r.key ? () => { location.hash = `#/events/${encodeURIComponent(r.key)}`; } : null })), sym: K.sym(), aria: 'Spending by event' }),
      table: () => K.table({ columns: [{ key: 'label', label: 'Event' }, { key: 'value', label: 'Spent', money: true }, { key: 'share', label: 'Share', pct: true }],
        rows: evRows.map((r) => ({ ...r, share: s.spending ? r.value / s.spending : null })), foot: { label: 'Total', value: s.spending, share: 1 }, exportName: 'Spending by event' }),
    }));

    const items = new Map();
    for (const t of model.tx.filter((x) => x.kind === 'expense')) {
      const k = (t.detail || 'Other') + '|' + (t.party || '');
      const g = items.get(k) || { item: t.detail || 'Other', party: t.party || '–', count: 0, amount: 0, type: t.costType };
      g.count++; g.amount += t.amount;
      items.set(k, g);
    }
    const c = K.card({ title: 'Biggest cost items', desc: 'Grouped by item and supplier. The top of this list is where a better quote saves the most.' });
    c.body.append(K.table({
      columns: [{ key: 'item', label: 'Item' }, { key: 'party', label: 'Supplier / payee' }, { key: 'type', label: 'Fixed / variable', format: (v) => (v === 'variable' ? 'Variable' : v === 'fixed' ? 'Fixed' : '–') },
        { key: 'count', label: 'Payments', count: true }, { key: 'amount', label: 'Total', money: true }, { key: 'share', label: 'Share', pct: true }],
      rows: [...items.values()].sort((a, b) => b.amount - a.amount).slice(0, 25).map((r) => ({ ...r, share: s.spending ? r.amount / s.spending : null })),
      exportName: 'Biggest cost items',
    }));
    body.append(c.el);
    body.append(K.next({ prev: { href: '#/analyse/income', label: 'Income' }, href: '#/analyse/cash', label: 'Next: cash flow' }));
  };

  // ---------------- cash flow ----------------

  SF.pages.cash = function (host) {
    const body = K.page(host, { step: 3, back: { href: '#/analyse', label: 'All analyses' }, title: 'Cash flow & balance', lead: 'Money in minus money out for each period, and what that does to the bank balance.' });
    if (!SF.app.hasData()) return noData(body);
    const settings = S.data.settings;
    body.append(K.filterBar({
      extra: el('label', { class: 'filter' }, el('span', null, 'Opening bank balance'),
        el('input', { type: 'number', step: 'any', value: settings.openingBalance ?? '', placeholder: '0.00', class: 'narrow-input',
          onchange: (e) => { settings.openingBalance = e.target.value === '' ? null : +e.target.value; S.save(); SF.app.render(); } })),
    }));
    const model = SF.app.model();
    const w = M.window(model);
    const b = M.balanceSeries(model, st().gran, settings.openingBalance, w.from, w.to);
    let lo = 0;
    b.balance.forEach((v, i) => { if (v < b.balance[lo]) lo = i; });
    const net = U.sum(b.net);
    body.append(K.stats([
      { label: 'Balance at start', value: K.money(b.opening, { whole: true }), sub: settings.openingBalance == null ? 'set the opening balance above' : null },
      { label: 'Net for the period', value: K.money(net, { signed: true, whole: true }), tone: net < 0 ? 'neg' : 'pos' },
      { label: 'Balance at end', value: K.money(b.balance[b.balance.length - 1] || b.opening, { whole: true }) },
      b.balance.length ? { label: 'Lowest point', value: K.money(b.balance[lo], { whole: true }), sub: b.periods[lo].label, tone: b.balance[lo] < 0 ? 'neg' : '' } : null,
    ]));
    if (settings.openingBalance == null) body.append(el('p', { class: 'callout' }, 'Tip: enter the bank balance from the start of your records (e.g. the start of your first financial year) above, and the balance line will show real amounts instead of starting at zero.'));

    body.append(K.chartCard({
      id: 'cash-net', title: `Surplus or deficit each ${granLabel()}`, desc: 'Above the line: more came in than went out. Below: the society dipped into its reserves.',
      draw: (c) => CH.bars(c, { labels: b.periods.map((p) => p.label), stacked: true, sym: K.sym(), aria: 'Net cash flow by period',
        series: [{ label: 'Surplus', color: '--pos', values: b.net.map((v) => (v > 0 ? v : 0)) }, { label: 'Deficit', color: '--neg', values: b.net.map((v) => (v < 0 ? v : 0)) }] }),
      table: () => K.table({
        columns: [{ key: 'period', label: 'Period' }, { key: 'income', label: 'In', money: true }, { key: 'spending', label: 'Out', money: true }, { key: 'net', label: 'Net', money: true, cls: (v) => (v < 0 ? 'neg-text' : '') }, { key: 'balance', label: 'Balance after', money: true }],
        rows: b.periods.map((p, i) => ({ period: p.label, income: b.income[i], spending: b.spending[i], net: b.net[i], balance: b.balance[i] })), exportName: 'Cash flow',
      }),
    }));
    body.append(K.chartCard({
      id: 'cash-bal', title: 'Bank balance over time', desc: 'Running balance at the end of each period.',
      draw: (c) => CH.lines(c, { labels: b.periods.map((p) => p.label), series: [{ label: 'Balance', color: '--c-income', values: b.balance }], sym: K.sym(), aria: 'Bank balance over time' }),
      table: () => K.table({ columns: [{ key: 'period', label: 'Period' }, { key: 'balance', label: 'Balance', money: true }], rows: b.periods.map((p, i) => ({ period: p.label, balance: b.balance[i] })), exportName: 'Bank balance' }),
    }));
    const ins = I.society(model, { sym: K.sym(), openingBalance: settings.openingBalance ?? 0 }).filter((x) => /cash|overall/i.test(x.title));
    const c = K.card({ title: 'Findings' });
    c.body.append(K.insightList(ins));
    body.append(c.el);
    body.append(K.next({ prev: { href: '#/analyse/spending', label: 'Spending' }, href: '#/analyse/memberships', label: 'Next: memberships' }));
  };

  // ---------------- memberships ----------------

  SF.pages.memberships = function (host) {
    const body = K.page(host, { step: 3, back: { href: '#/analyse', label: 'All analyses' }, title: 'Memberships', lead: 'How many people joined, when, on which membership, and what they get back for their money.' });
    if (!SF.app.hasData()) return noData(body);
    body.append(K.filterBar({}));
    const model = SF.app.model();
    const s = M.summary(model);
    const mem = model.tx.filter((t) => t.stream === 'memberships');
    if (!mem.length) {
      body.append(K.empty({ title: 'No membership data for this period', text: 'Add a membership sign-up export in Step 1.', action: { href: '#/add', label: 'Add data' } }));
      return;
    }
    const early = mem.filter((t) => t.date && ['08', '09', '10'].includes(t.date.slice(5, 7))).length / mem.length;
    body.append(K.stats([
      { label: 'Members', value: U.fmtNum(s.members) },
      { label: 'Membership income', value: K.money(s.membershipIncome, { whole: true }), sub: s.income ? `${U.fmtPct(s.membershipIncome / s.income)} of all income` : null },
      { label: 'Average fee', value: K.money(s.avgFee) },
      { label: 'Joined Aug–Oct', value: U.fmtPct(early), sub: 'Freshers season' },
      { label: 'Member benefits per member', value: K.money(s.members ? s.memberBenefit / s.members : 0), sub: 'subsidised activities + running costs' },
    ]));

    // types: fixed order by count, fold beyond 5 into Other
    const typeCounts = new Map();
    for (const t of mem) typeCounts.set(t.detail, (typeCounts.get(t.detail) || 0) + 1);
    const types = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const top = types.slice(0, 5);
    const typeOf = (t) => (top.includes(t.detail) ? t.detail : 'Other');
    const order = top.concat(types.length > 5 ? ['Other'] : []).map((k, i) => ({ key: k, label: k, color: `--cat-${i + 1}` }));
    const w = M.window(model);
    const ts = M.timeSeries(mem, { gran: st().gran, fyStart: model.fyStart, from: w.from, to: w.to, split: typeOf, value: () => 1, seriesOrder: order });
    ts.series.forEach((x, i) => (x.color = order[i].color));
    body.append(K.chartCard({
      id: 'mem-ts', title: `Sign-ups by ${granLabel()}`, desc: 'New memberships per period, by membership type.',
      draw: (c) => CH.bars(c, { labels: ts.periods.map((p) => p.label), series: ts.series, stacked: true, format: 'count', aria: 'Membership sign-ups by period', totalLabel: 'sign-ups' }),
      table: () => periodTable(ts, { format: 'count', exportName: 'Membership sign-ups', totalLabel: 'Sign-ups' }),
    }));
    let cum = 0;
    const cumVals = ts.totals.map((v) => (cum += v));
    body.append(K.chartCard({
      id: 'mem-cum', title: 'Total members over the year', desc: 'Running total of memberships sold.',
      draw: (c) => CH.lines(c, { labels: ts.periods.map((p) => p.label), series: [{ label: 'Members', color: '--c-memberships', values: cumVals }], format: 'count', aria: 'Cumulative members' }),
      table: () => K.table({ columns: [{ key: 'p', label: 'Period' }, { key: 'v', label: 'Members so far', count: true }], rows: ts.periods.map((p, i) => ({ p: p.label, v: cumVals[i] })), exportName: 'Members over time' }),
    }));

    const typeRows = types.map((k) => {
      const list = mem.filter((t) => t.detail === k);
      const rev = U.sum(list, (t) => t.amount);
      return { type: k, count: list.length, share: list.length / mem.length, price: rev / list.length, revenue: rev };
    });
    const c = K.card({ title: 'Membership types', desc: 'How many chose each option and what it brought in.' });
    c.body.append(K.table({ columns: [{ key: 'type', label: 'Type' }, { key: 'count', label: 'Members', count: true }, { key: 'share', label: 'Share', pct: true }, { key: 'price', label: 'Avg price', money: true }, { key: 'revenue', label: 'Income', money: true }],
      rows: typeRows, foot: { type: 'Total', count: mem.length, share: 1, price: s.avgFee, revenue: s.membershipIncome }, exportName: 'Membership types' }));
    body.append(c.el);

    const methods = new Map();
    for (const r of S.data.records.memberships) if (r.method && (model.fy === 'all' || r.fy === model.fy)) methods.set(r.method, (methods.get(r.method) || 0) + 1);
    if (methods.size) {
      const c2 = K.card({ title: 'How people paid' });
      c2.body.append(K.table({ columns: [{ key: 'm', label: 'Method' }, { key: 'n', label: 'Members', count: true }], rows: [...methods.entries()].sort((a, b) => b[1] - a[1]).map(([m, n]) => ({ m, n })), exportName: 'Payment methods' }));
      body.append(c2.el);
    }
    const ins = I.society(model, { sym: K.sym(), data: S.data }).filter((x) => /member|join/i.test(x.title));
    const c3 = K.card({ title: 'Findings', desc: 'Want to test a different price?', actions: el('a', { class: 'btn small', href: '#/plan/membership' }, 'Membership price calculator', K.icon('arrow')) });
    c3.body.append(K.insightList(ins));
    body.append(c3.el);
    body.append(K.next({ prev: { href: '#/analyse/cash', label: 'Cash flow' }, href: '#/analyse/coaching', label: 'Next: coaching & hires' }));
  };

  // ---------------- coaching & hires ----------------

  SF.pages.coaching = function (host) {
    const body = K.page(host, { step: 3, back: { href: '#/analyse', label: 'All analyses' }, title: 'Coaching & hires', lead: 'What coaches, instructors and other paid help cost: per session, per hour and per person who benefits.' });
    if (!SF.app.hasData()) return noData(body);
    body.append(K.filterBar({}));
    const model = SF.app.model();
    const hires = model.tx.filter((t) => t.stream === 'hires');
    if (!hires.length) {
      body.append(K.empty({ title: 'No coaching or hires for this period', text: 'Add coach invoices in Step 1 to see cost per session and per person.', action: { href: '#/add', label: 'Add data' } }));
      return;
    }
    const total = U.sum(hires, (t) => t.amount);
    const hours = U.sum(hires, (t) => t.hours || 0);
    const linked = model.events.filter((e) => e.hireCosts > 0);
    const att = U.sum(linked, (e) => e.attendees);
    body.append(K.stats([
      { label: 'Total cost', value: K.money(total, { whole: true }) },
      { label: 'Invoices / sessions', value: U.fmtNum(hires.length) },
      hours ? { label: 'Hours', value: U.fmtNum(hours, 1), sub: `${K.money(total / hours)} per hour on average` } : null,
      att ? { label: 'Cost per attendance', value: K.money(U.sum(linked, (e) => e.hireCosts) / att), sub: `${U.fmtNum(att)} attendances at coached activities` } : { label: 'Cost per attendance', value: '–', sub: 'add attendance sheets to see this' },
    ]));
    const provs = new Map();
    for (const t of hires) provs.set(t.party || 'Unknown', (provs.get(t.party || 'Unknown') || 0) + t.amount);
    const topP = [...provs.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const order = topP.slice(0, 5).concat(topP.length > 5 ? ['Other'] : []).map((k, i) => ({ key: k, label: k, color: `--cat-${i + 1}` }));
    const w = M.window(model);
    const ts = M.timeSeries(hires, { gran: st().gran, fyStart: model.fyStart, from: w.from, to: w.to, split: (t) => (order.some((o) => o.key === (t.party || 'Unknown')) ? t.party || 'Unknown' : 'Other'), value: (t) => t.amount, seriesOrder: order });
    ts.series.forEach((x, i) => (x.color = order[i].color));
    body.append(K.chartCard({
      id: 'hire-ts', title: `Coaching & hire costs by ${granLabel()}`, desc: 'Stacked by who was paid.',
      draw: (c) => CH.bars(c, { labels: ts.periods.map((p) => p.label), series: ts.series, stacked: true, sym: K.sym(), aria: 'Hire costs by period' }),
      table: () => periodTable(ts, { exportName: 'Hire costs by period', showSeries: true }),
    }));
    const byProv = topP.map((p) => {
      const list = hires.filter((t) => (t.party || 'Unknown') === p);
      const h = U.sum(list, (t) => t.hours || 0), amt = U.sum(list, (t) => t.amount);
      return { p, n: list.length, h: h || null, amt, rate: h ? amt / h : null, per: amt / list.length };
    });
    const c = K.card({ title: 'By coach / provider' });
    c.body.append(K.table({ columns: [{ key: 'p', label: 'Paid to' }, { key: 'n', label: 'Invoices', count: true }, { key: 'h', label: 'Hours', count: true, digits: 1 }, { key: 'rate', label: 'Per hour', money: true }, { key: 'per', label: 'Per invoice', money: true }, { key: 'amt', label: 'Total', money: true }],
      rows: byProv, exportName: 'Coaching by provider' }));
    body.append(c.el);
    if (linked.length) {
      const c2 = K.card({ title: 'By activity', desc: 'Coaching cost set against the people who benefit. Attendance sheets make this accurate.' });
      c2.body.append(K.table({ columns: [{ key: 'name', label: 'Activity' }, { key: 'sessions', label: 'Sessions', count: true }, { key: 'cost', label: 'Coaching cost', money: true }, { key: 'perSession', label: 'Per session', money: true }, { key: 'att', label: 'Attendances', count: true }, { key: 'perHead', label: 'Per attendance', money: true }],
        rows: linked.map((e) => ({ name: e.name, sessions: e.sessionCount, cost: e.hireCosts, perSession: e.hireCosts / e.sessionCount, att: e.attendees || null, perHead: e.attendees ? e.hireCosts / e.attendees : null, _onClick: () => { location.hash = `#/events/${encodeURIComponent(e.key)}`; }, _cls: 'clickable' })),
        exportName: 'Coaching by activity' }));
      body.append(c2.el);
    }
    body.append(K.next({ prev: { href: '#/analyse/memberships', label: 'Memberships' }, href: '#/analyse/compare', label: 'Next: compare years' }));
  };

  // ---------------- compare years ----------------

  SF.pages.compare = function (host) {
    const body = K.page(host, { step: 3, back: { href: '#/analyse', label: 'All analyses' }, title: 'Compare years', lead: 'Each financial year side by side, so the committee can see the direction of travel.' });
    if (!SF.app.hasData()) return noData(body);
    const fys = SF.app.fys();
    const sums = fys.map((fy) => ({ fy, s: M.summary(SF.app.model(fy)), model: SF.app.model(fy) }));
    if (fys.length < 2) body.append(el('p', { class: 'callout' }, 'Only one financial year of data so far. Add last year’s spreadsheets in Step 1 to compare.'));
    const metrics = [
      ['Income', (s) => s.income, true, 'money'],
      ...incomeStreams.map((x) => ['  ' + x.label, (s) => s.byStream[x.key], true, 'money']),
      ['Spending', (s) => s.spending, false, 'money'],
      ...expenseStreams.map((x) => ['  ' + x.label, (s) => s.byStream[x.key], false, 'money']),
      ['Surplus / deficit', (s) => s.net, true, 'money'],
      ['Members', (s) => s.members, true, 'count'],
      ['Average membership fee', (s) => s.avgFee, null, 'money'],
      ['Events & activities', (s) => s.events, true, 'count'],
      ['Event attendances', (s) => s.attendees, true, 'count'],
      ['Spent per member', (s) => s.spendPerMember, null, 'money'],
    ];
    const cols = [{ key: 'metric', label: 'Metric' }].concat(fys.map((fy) => ({ key: fy, label: fy, format: (v, row) => (v == null ? '–' : row._fmt === 'count' ? U.fmtNum(v) : K.money(v, { whole: true })) })));
    if (fys.length > 1) cols.push({ key: 'change', label: `Change ${fys[fys.length - 2]} → ${fys[fys.length - 1]}`, format: (v, row) => (row._change) });
    const rows = metrics.map(([label, fn, up, fmt]) => {
      const r = { metric: label, _fmt: fmt, _cls: label.startsWith('  ') ? 'sub-row' : '' };
      sums.forEach(({ fy, s }) => (r[fy] = fn(s)));
      if (fys.length > 1) {
        const a = fn(sums[sums.length - 1].s), b = fn(sums[sums.length - 2].s);
        r.change = a != null && b ? (a - b) / Math.abs(b) : null;
        r._change = K.delta(a, b, up, (d) => (fmt === 'count' ? U.fmtNum(d, 1) : K.money(d, { whole: true })) + (b ? ` (${U.fmtPct((a - b) / Math.abs(b), true)})` : ''));
      }
      return r;
    });
    const c = K.card({ title: 'Year by year', desc: 'Indented rows break the line above into its parts. The latest year may still be in progress.' });
    c.body.append(K.table({ columns: cols.map((col) => col.key === 'change' ? { ...col, exportValue: (v) => v } : col), rows, exportName: 'Year comparison' }));
    body.append(c.el);

    body.append(K.chartCard({
      id: 'cmp-io', title: 'Income and spending by year',
      draw: (el2) => CH.bars(el2, { labels: fys, series: [{ label: 'Income', color: K.colors.income, values: sums.map((x) => x.s.income) }, { label: 'Spending', color: K.colors.expense, values: sums.map((x) => x.s.spending) }], sym: K.sym(), aria: 'Income and spending by year' }),
      table: () => K.table({ columns: [{ key: 'fy', label: 'Year' }, { key: 'i', label: 'Income', money: true }, { key: 'o', label: 'Spending', money: true }, { key: 'n', label: 'Net', money: true }], rows: sums.map((x) => ({ fy: x.fy, i: x.s.income, o: x.s.spending, n: x.s.net })), exportName: 'Income and spending by year' }),
    }));
    body.append(K.chartCard({
      id: 'cmp-mem', title: 'Members by year',
      draw: (el2) => CH.bars(el2, { labels: fys, series: [{ label: 'Members', color: K.colors.memberships, values: sums.map((x) => x.s.members) }], format: 'count', aria: 'Members by year' }),
      table: () => K.table({ columns: [{ key: 'fy', label: 'Year' }, { key: 'm', label: 'Members', count: true }], rows: sums.map((x) => ({ fy: x.fy, m: x.s.members })), exportName: 'Members by year' }),
    }));

    // events across years
    const names = new Map();
    sums.forEach(({ fy, model }) => model.events.forEach((e) => { if (!names.has(e.key)) names.set(e.key, { name: e.name }); names.get(e.key)[fy] = e.net; }));
    const multi = [...names.values()].filter((r) => fys.filter((fy) => r[fy] != null).length > 1);
    if (multi.length) {
      const c2 = K.card({ title: 'Repeat events', desc: 'Result (income minus costs) for events that ran in more than one year.' });
      c2.body.append(K.table({ columns: [{ key: 'name', label: 'Event' }].concat(fys.map((fy) => ({ key: fy, label: fy, money: true, cls: (v) => (v < 0 ? 'neg-text' : '') }))), rows: multi, exportName: 'Repeat events' }));
      body.append(c2.el);
    }
    body.append(K.next({ prev: { href: '#/analyse', label: 'All analyses' }, href: '#/plan', label: 'Next: plan ahead' }));
  };
})(typeof window !== 'undefined' ? window : globalThis);
