/*
 * Events analysis: the portfolio (timeline of the year, value map, league
 * table) and one page per event with session/sales timelines, ticket tiers,
 * costs, break-even and recommendations on pricing, frequency and costs.
 */
(function (root) {
  const SF = (root.SF = root.SF || {});
  const U = SF.util, S = SF.store, K = SF.kit, M = SF.master, I = SF.insights, CH = SF.charts, F = SF.finance;
  const el = U.el;
  SF.pages = SF.pages || {};

  const go = (key) => { location.hash = `#/events/${encodeURIComponent(key)}`; };
  const perLabel = (e) => (e.kind === 'recurring' ? 'attendance' : 'attendee');

  SF.app.setEventMeta = function (key, patch) {
    S.data.eventMeta[key] = { ...(S.data.eventMeta[key] || {}), ...patch };
    for (const k of Object.keys(S.data.eventMeta[key])) if (S.data.eventMeta[key][k] === '' || S.data.eventMeta[key][k] == null) delete S.data.eventMeta[key][k];
    S.save();
    SF.app.render();
  };

  // ---------------- portfolio ----------------

  SF.pages.events = function (host) {
    const body = K.page(host, {
      step: 3, back: { href: '#/analyse', label: 'All analyses' }, title: 'Events',
      lead: 'How each event and activity is doing for the society. Each one is judged against its purpose: a fundraiser should make money, a social should roughly pay for itself, and training can be a member benefit the society chooses to fund.',
    });
    if (!SF.app.hasData()) return body.append(K.empty({ title: 'No data yet', text: 'Add ticket sales, expenses, coaching or attendance sheets with event names.', action: { href: '#/add', label: 'Add data' } }));
    body.append(K.filterBar({ gran: false }));
    const model = SF.app.model();
    const evs = model.events;
    if (!evs.length) return body.append(K.empty({ title: 'No events found for this year', text: 'Events are found from the event name column in ticket sales, expenses, hires and attendance.', action: { href: '#/data', label: 'Check data' } }));
    const ctx = I.context(model, K.sym());
    const rated = evs.map((e) => ({ e, v: I.rateEvent(e, ctx) }));
    const net = U.sum(evs, (e) => e.net);
    body.append(K.stats([
      { label: 'Events & activities', value: U.fmtNum(evs.length), sub: `${evs.filter((e) => e.kind === 'recurring').length} recurring · ${evs.filter((e) => e.kind === 'oneoff').length} one-off` },
      { label: 'Attendances', value: U.fmtNum(U.sum(evs, (e) => e.attendees)) },
      { label: 'Combined result', value: K.money(net, { signed: true, whole: true }), tone: net < 0 ? 'neg' : 'pos', sub: 'income minus costs of all events' },
      { label: 'Need attention', value: U.fmtNum(rated.filter((r) => r.v.rating === 'review').length), sub: `${rated.filter((r) => r.v.rating === 'strong').length} working well` },
    ]));

    // timeline
    const w = M.window(model);
    const tlRows = evs.filter((e) => e.firstDate).map((e) => ({
      label: e.name, kind: e.kind, onClick: () => go(e.key),
      marks: e.kind === 'recurring'
        ? e.sessions.map((s) => ({ date: s.date, net: s.net, tip: [U.fmtDate(s.date), `${U.fmtNum(s.attendees)} people`, `${K.money(s.net, { signed: true })} result`] }))
        : [{ date: e.eventDate || e.lastDate, net: e.net, tip: [U.fmtDate(e.eventDate || e.lastDate), `${U.fmtNum(e.attendees)} people`, `${K.money(e.net, { signed: true })} result`] }],
    }));
    body.append(K.chartCard({
      id: 'ev-tl', title: 'How the year is structured',
      desc: 'Each row is an event. Dots joined by a line are the sessions of a recurring activity; a diamond is a one-off event. Blue means that session or event made money, red means it cost money.',
      draw: (c) => CH.timeline(c, { rows: tlRows, from: w.from, to: w.to, aria: 'Timeline of events and sessions' }),
      table: () => K.table({ columns: [{ key: 'name', label: 'Event' }, { key: 'type', label: 'Type' }, { key: 'first', label: 'First', format: (v) => U.fmtDate(v) }, { key: 'last', label: 'Last', format: (v) => U.fmtDate(v) }, { key: 'sessions', label: 'Sessions', count: true }],
        rows: evs.map((e) => ({ name: e.name, type: e.kind === 'recurring' ? e.frequency : 'One-off', first: e.firstDate, last: e.lastDate, sessions: e.sessionCount })), exportName: 'Event timeline' }),
    }));

    // value map
    const withPeople = evs.filter((e) => e.attendees > 0);
    if (withPeople.length >= 2) {
      const mid = M.median(withPeople.map((e) => e.attendees));
      body.append(K.chartCard({
        id: 'ev-map', title: 'Reach vs value',
        desc: 'Right = more people reached. Up = the event made money per person; down = the society paid per person. Bottom-right is fine for member benefits, but should be a choice rather than an accident.',
        draw: (c) => CH.scatter(c, {
          points: withPeople.map((e) => ({ label: e.name, x: e.attendees, y: e.netPerAttendee, color: e.kind === 'recurring' ? '--c-memberships' : '--c-tickets', onClick: () => go(e.key), sub: M.GOALS[e.goal].label })),
          xLabel: 'Attendances', yLabel: 'Result per person', fmtX: (v) => U.fmtNum(v), fmtY: (v, axis) => (axis ? '' : '') + U.fmtMoney(v, K.sym(), { signed: !axis }),
          xMid: mid, quadrants: ['Small, makes money', 'Popular, makes money', 'Small, subsidised', 'Popular, subsidised'], aria: 'Events by attendance and result per person',
        }),
        note: 'Blue dots are recurring activities, aqua dots one-off events.',
      }));
    }

    // league table
    const c = K.card({ title: 'All events', desc: 'Click an event for its timeline, ticket and cost breakdown, break-even and advice.' });
    const order = ['review', 'ok', 'strong', 'nodata'];
    c.body.append(K.table({
      columns: [
        { key: 'name', label: 'Event' }, { key: 'type', label: 'Type' }, { key: 'purpose', label: 'Purpose' },
        { key: 'att', label: 'Attendances', count: true }, { key: 'income', label: 'Income', money: true }, { key: 'costs', label: 'Costs', money: true },
        { key: 'net', label: 'Result', money: true, cls: (v) => (v < 0 ? 'neg-text' : '') },
        { key: 'per', label: 'Per person', money: true, cls: (v) => (v < 0 ? 'neg-text' : '') },
        { key: 'rating', label: 'Rating', format: (v) => (v ? K.badge(v) : ''), exportValue: (v) => (v ? I.RATINGS[v].label : '') },
      ],
      rows: rated.sort((a, b) => order.indexOf(a.v.rating) - order.indexOf(b.v.rating) || a.e.net - b.e.net).map(({ e, v }) => ({
        name: e.name, type: e.kind === 'recurring' ? `${e.frequency} (${e.sessionCount})` : 'One-off', purpose: M.GOALS[e.goal].label,
        att: e.attendees, income: e.income, costs: e.costs, net: e.net, per: e.netPerAttendee, rating: v.rating,
        _onClick: () => go(e.key), _cls: 'clickable',
      })),
      foot: { name: 'All events', att: U.sum(evs, (e) => e.attendees), income: U.sum(evs, (e) => e.income), costs: U.sum(evs, (e) => e.costs), net },
      exportName: 'Events',
    }));
    body.append(c.el);
    body.append(el('p', { class: 'hint' }, 'Ratings use each event’s purpose, which you can change on the event’s page or in Check data. How ratings work: fundraisers should make at least a 20% margin; break-even events should be within about 5% of costs; member benefits are judged on cost per attendance (under £5 is good, over £10 needs a look) and on whether attendance is holding up.'));
    body.append(K.next({ prev: { href: '#/analyse/overview', label: 'Overview' }, href: '#/analyse/income', label: 'Next: income' }));
  };

  // ---------------- one event ----------------

  function breakEvenSummary(e) {
    // For recurring activities, work per session.
    const div = e.kind === 'recurring' ? e.sessionCount : 1;
    const variable = U.sum(e.tx.filter((t) => t.kind === 'expense' && t.costType === 'variable'), (t) => t.amount) / div;
    const fixed = (e.costs / div) - variable - e.otherIncome / div;
    const attendees = e.attendees / div;
    return {
      scenario: 'actual', attendees, fixed: Math.max(0, fixed), variable,
      revenue: e.ticketIncome / div, avgPrice: e.avgPrice || 0, varPerHead: attendees ? variable / attendees : 0,
    };
  }

  SF.pages.event = function (host, key) {
    const model = SF.app.model();
    const e = model.eventMap.get(key) || SF.app.model('all').eventMap.get(key);
    if (!e) {
      const body = K.page(host, { back: { href: '#/events', label: 'All events' }, title: 'Event not found' });
      body.append(el('p', null, 'This event has no data in the selected year. Try “All years”.'), K.filterBar({ gran: false }));
      return;
    }
    const ctx = I.context(model, K.sym());
    const v = I.rateEvent(e, ctx);
    const meta = S.data.eventMeta[key] || {};
    const body = K.page(host, {
      step: 3, back: { href: '#/events', label: 'All events' }, title: e.name, badge: K.badge(v.rating),
      lead: v.headline,
    });
    body.append(K.filterBar({ gran: false, extra: [
      el('label', { class: 'filter' }, el('span', null, 'Purpose'),
        el('select', { onchange: (ev) => SF.app.setEventMeta(key, { goal: ev.target.value }) },
          el('option', { value: '', selected: !meta.goal }, `Auto (${M.GOALS[e.goal].label})`),
          Object.entries(M.GOALS).map(([k, g]) => el('option', { value: k, selected: meta.goal === k }, `${g.label}: ${g.hint}`)))),
      el('label', { class: 'filter' }, el('span', null, 'Type'),
        el('select', { onchange: (ev) => SF.app.setEventMeta(key, { kind: ev.target.value }) },
          el('option', { value: '', selected: !meta.kind }, `Auto (${e.detectedFrequency || 'one-off'})`),
          el('option', { value: 'oneoff', selected: meta.kind === 'oneoff' }, 'One-off'),
          el('option', { value: 'recurring', selected: meta.kind === 'recurring' }, 'Recurring'))),
      el('label', { class: 'filter' }, el('span', null, e.kind === 'recurring' ? 'Capacity per session' : 'Capacity'),
        el('input', { type: 'number', min: 0, value: meta.capacity || '', placeholder: 'optional', class: 'narrow-input', onchange: (ev) => SF.app.setEventMeta(key, { capacity: ev.target.value ? +ev.target.value : '' }) })),
    ] }));

    const rec = e.kind === 'recurring';
    body.append(K.stats([
      { label: rec ? 'Sessions' : 'Date', value: rec ? U.fmtNum(e.sessionCount) : (e.eventDate ? U.fmtDate(e.eventDate) : '–'), sub: rec ? `${e.frequency}, ${U.fmtDate(e.firstDate)} – ${U.fmtDate(e.lastDate)}` : null },
      { label: rec ? 'Attendances' : 'Attendees', value: U.fmtNum(e.attendees), sub: rec ? `${U.fmtNum(e.perSession.attendees, 1)} per session` : e.capacity ? `${U.fmtPct(e.attendees / e.capacity)} of capacity` : null },
      { label: 'Income', value: K.money(e.income, { whole: true }), sub: e.avgPrice ? `avg ticket ${K.money(e.avgPrice)}` : null },
      { label: 'Costs', value: K.money(e.costs, { whole: true }), sub: rec ? `${K.money(e.perSession.costs)} per session` : null },
      { label: 'Result', value: K.money(e.net, { signed: true, whole: true }), tone: e.net < 0 ? 'neg' : 'pos', sub: e.netPerAttendee != null ? `${K.money(e.netPerAttendee, { signed: true })} per ${perLabel(e)}` : null },
    ]));

    // advice first: it is what the committee came for
    const adv = K.card({ title: 'What this means and what to try', desc: `Judged as: ${M.GOALS[e.goal].label.toLowerCase()} (${M.GOALS[e.goal].hint.toLowerCase()}).` });
    if (v.recs.length) adv.body.append(el('h3', null, 'Suggestions'), K.recList(v.recs));
    if (v.points.length) adv.body.append(el('h3', null, 'What the numbers show'), K.insightList(v.points));
    if (!v.recs.length && !v.points.length) adv.body.append(el('p', { class: 'muted' }, 'Nothing stands out. Add attendance or capacity for more detail.'));
    body.append(adv.el);

    // timeline
    if (rec) {
      const labels = e.sessions.map((s) => U.fmtDate(s.date).replace(/ \d{4}$/, ''));
      const tr = I.trend(e);
      const sessTable = () => K.table({
        columns: [{ key: 'date', label: 'Session', format: (x) => U.fmtDate(x) }, { key: 'attendees', label: 'People', count: true }, { key: 'income', label: 'Income', money: true }, { key: 'costs', label: 'Costs', money: true }, { key: 'net', label: 'Result', money: true, cls: (x) => (x < 0 ? 'neg-text' : '') }],
        rows: e.sessions, foot: { date: null, attendees: e.attendees, income: e.income, costs: e.costs, net: e.net }, exportName: `${e.name} sessions`,
      });
      body.append(K.chartCard({
        id: 'evd-att', title: 'Attendance per session',
        desc: tr && tr.change != null ? `First third of sessions averaged ${U.fmtNum(tr.first, 1)} people, the last third ${U.fmtNum(tr.last, 1)} (${U.fmtPct(tr.change, true)}).` : 'People at each session.',
        draw: (c) => CH.bars(c, { labels, series: [{ label: 'People', color: '--c-memberships', values: e.sessions.map((s) => s.attendees) }], format: 'count', aria: 'Attendance per session' }),
        table: sessTable,
      }));
      body.append(K.chartCard({
        id: 'evd-net', title: 'Result per session', desc: 'Income from that session minus its costs. Ticket sales are counted at the next session on or after the purchase date.',
        draw: (c) => CH.bars(c, { labels, stacked: true, sym: K.sym(), aria: 'Result per session', series: [{ label: 'Made money', color: '--pos', values: e.sessions.map((s) => (s.net > 0 ? s.net : 0)) }, { label: 'Cost money', color: '--neg', values: e.sessions.map((s) => (s.net < 0 ? s.net : 0)) }] }),
        table: sessTable,
      }));
    } else if (e.salesCurve && e.salesCurve.length > 1) {
      body.append(K.chartCard({
        id: 'evd-sales', title: 'Ticket sales build-up', desc: e.eventDate ? `Tickets sold so far on each date, up to the event on ${U.fmtDate(e.eventDate)}.` : 'Tickets sold so far on each date.',
        draw: (c) => CH.lines(c, { labels: e.salesCurve.map((p) => U.fmtDate(p.date).replace(/ \d{4}$/, '')), series: [{ label: 'Tickets sold', color: '--c-tickets', values: e.salesCurve.map((p) => p.cumulative) }], format: 'count', aria: 'Cumulative ticket sales' }),
        table: () => K.table({ columns: [{ key: 'date', label: 'Date', format: (x) => U.fmtDate(x) }, { key: 'daysBefore', label: 'Days before event', count: true }, { key: 'cumulative', label: 'Sold so far', count: true }], rows: e.salesCurve, exportName: `${e.name} ticket sales` }),
      }));
    }

    // money breakdown
    const grid = el('div', { class: 'grid-2 cards' });
    const tiers = K.card({ title: 'Tickets', desc: e.tiers.length ? 'By ticket type.' : 'No ticket sales linked to this event.' });
    if (e.tiers.length) {
      tiers.body.append(K.table({ columns: [{ key: 'name', label: 'Type' }, { key: 'avgPrice', label: 'Avg price', money: true }, { key: 'qty', label: 'Sold', count: true }, { key: 'revenue', label: 'Income', money: true }, { key: 'share', label: 'Share', pct: true }],
        rows: e.tiers.map((t) => ({ ...t, share: e.ticketsSold ? t.qty / e.ticketsSold : null })), foot: { name: 'Total', avgPrice: e.avgPrice, qty: e.ticketsSold, revenue: e.ticketIncome, share: 1 }, exportName: `${e.name} tickets` }));
    }
    if (!e.tiers.length && e.att.length) {
      tiers.el.querySelector('h2').textContent = 'Who came';
      tiers.el.querySelector('.card-desc').textContent = 'From the attendance sheets.';
      const by = new Map();
      for (const a of e.att) { const k = a.member || 'Not recorded'; by.set(k, (by.get(k) || 0) + (a.count || 1)); }
      tiers.body.append(K.table({ columns: [{ key: 'k', label: 'Status' }, { key: 'n', label: 'Attendances', count: true }, { key: 'share', label: 'Share', pct: true }],
        rows: [...by.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n, share: e.attendees ? n / e.attendees : null })), exportName: `${e.name} attendance` }));
      const people = new Set(e.att.filter((a) => a.name).map((a) => U.norm(a.name))).size;
      if (people) tiers.body.append(el('p', { class: 'hint' }, `${U.fmtNum(people)} different people signed in at least once; on average each came ${U.fmtNum(e.attendees / people, 1)} times.`));
    }
    if (e.otherIncome) tiers.body.append(el('p', { class: 'hint' }, `Plus ${K.money(e.otherIncome)} sponsorship / grants for this event.`));
    const costs = K.card({ title: 'Costs', desc: e.costLines.length ? 'Grouped by item, biggest first.' : 'No costs linked to this event.' });
    if (e.costLines.length) {
      costs.body.append(K.table({ columns: [{ key: 'name', label: 'Item' }, { key: 'stream', label: 'Type', format: (x) => M.streamLabel(x) }, { key: 'count', label: 'Payments', count: true }, { key: 'amount', label: 'Total', money: true }, { key: 'share', label: 'Share', pct: true }],
        rows: e.costLines.map((l) => ({ ...l, share: e.costs ? l.amount / e.costs : null })), foot: { name: 'Total', amount: e.costs, share: 1 }, exportName: `${e.name} costs` }));
    }
    grid.append(tiers.el, costs.el);
    body.append(grid);

    // break-even
    if (e.ticketsSold > 0) {
      const s = breakEvenSummary(e);
      const be = F.breakEven(s);
      const beCard = K.card({
        title: rec ? 'Break-even per session' : 'Break-even',
        desc: 'Costs marked “variable” in your expenses count per person; everything else is treated as fixed. Sponsorship for this event reduces the fixed costs.',
      });
      const facts = el('dl', { class: 'facts' },
        el('div', null, el('dt', null, 'Fixed costs' + (rec ? ' per session' : '')), el('dd', null, K.money(s.fixed))),
        el('div', null, el('dt', null, 'Average ticket'), el('dd', null, K.money(s.avgPrice))),
        el('div', null, el('dt', null, 'Variable cost per person'), el('dd', null, K.money(s.varPerHead))),
        el('div', { class: 'key-fact' }, el('dt', null, 'Break-even' + (rec ? ' per session' : '')), el('dd', null, be.possible ? `${U.fmtNum(be.units)} people` : 'Not reachable')),
        el('div', null, el('dt', null, rec ? 'Average turnout' : 'Actual turnout'), el('dd', null, `${U.fmtNum(s.attendees, 1)} people`)),
        be.priceAtAttendance != null ? el('div', null, el('dt', null, 'Break-even ticket at that turnout'), el('dd', null, K.money(be.priceAtAttendance))) : null);
      const chart = el('div', { class: 'chart-host' });
      beCard.body.append(el('div', { class: 'be-grid' }, facts, chart));
      body.append(beCard.el);
      K.defer(() => CH.breakEven(chart, s, be, K.sym()));
    }

    body.append(SF.ai.card({ scope: 'event', model, event: e }));
    const plan = K.card({ title: 'Planning the next one?', desc: 'Start a budget for the next run of this event, pre-filled with these actual figures.' });
    plan.body.append(el('button', { class: 'btn primary', onclick: () => SF.uiEvents.createFromActuals(e) }, 'Plan the next one', K.icon('arrow')));
    body.append(plan.el);
  };
})(typeof window !== 'undefined' ? window : globalThis);
