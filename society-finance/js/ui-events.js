/*
 * "Events" view: per-event planning and tracking sheet.
 *   Ticket sales (expected vs actual, optional price tiers)
 *   Planned costs (pre-event)   - fixed + variable
 *   Actual costs (post-event)   - fixed + variable
 *   Analysis: net profit, planned vs actual, break-even, findings
 */
(function (root) {
  const SF = (root.SF = root.SF || {});
  const U = SF.util, S = SF.store, F = SF.finance;
  const el = U.el;
  const E = (SF.uiEvents = {});

  let currentId = null;
  let beScenario = 'plan';
  let calcs = []; // functions that refresh computed cells without re-rendering inputs

  const sym = () => S.data.settings.currency;
  const money = (n, o) => U.fmtMoney(n, sym(), o);
  const cur = () => S.event(currentId);

  function persist() {
    S.save();
    refresh();
  }

  function refresh() {
    calcs.forEach((fn) => fn());
    renderAnalysis();
  }

  const numVal = (v) => (v === '' ? '' : Number(v));

  // ---------- event list / toolbar ----------

  function blankEvent(name) {
    return { id: U.uid(), name, date: '', linkName: '', notes: '', tickets: [{ id: U.uid(), name: 'Standard', price: '', expectedQty: '', actualQty: '' }], plannedCosts: [], actualCosts: [] };
  }

  function newEvent() {
    const ev = blankEvent('New event');
    S.data.events.push(ev);
    currentId = ev.id;
    S.save();
    E.render();
    const name = document.getElementById('ev-name');
    if (name) { name.focus(); name.select(); }
  }

  function duplicateAsPlan() {
    const src = cur();
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = U.uid();
    copy.name = src.name + ' (next)';
    copy.date = '';
    copy.actualCosts = [];
    copy.tickets.forEach((t) => { t.id = U.uid(); t.actualQty = ''; });
    copy.plannedCosts.forEach((l) => { l.id = U.uid(); delete l.sourceId; });
    S.data.events.push(copy);
    currentId = copy.id;
    S.save();
    E.render();
    SF.app.toast('Copied the plan into a new event. Actuals are left blank.');
  }

  function deleteEvent() {
    const ev = cur();
    if (!confirm(`Delete "${ev.name}"? This can't be undone (unless you have a backup).`)) return;
    S.data.events = S.data.events.filter((e) => e.id !== ev.id);
    currentId = S.data.events[0] ? S.data.events[0].id : null;
    S.save();
    E.render();
  }

  function renderToolbar(host) {
    const evs = S.data.events;
    host.append(el('div', { class: 'toolbar' },
      evs.length ? el('label', { class: 'field' }, 'Event',
        el('select', { id: 'event-picker', onchange: (e) => { currentId = e.target.value; E.render(); } },
          evs.map((e) => el('option', { value: e.id, selected: e.id === currentId }, (e.name || 'Untitled') + (e.date ? ` · ${U.fmtDate(e.date)}` : ''))))) : null,
      el('div', { class: 'toolbar-actions' },
        el('button', { class: 'btn primary', onclick: newEvent }, '+ New event'),
        evs.length ? el('button', { class: 'btn', onclick: duplicateAsPlan, title: 'Start a new event using this one’s plan' }, 'Duplicate as new plan') : null,
        evs.length ? el('button', { class: 'btn', onclick: exportEvent }, 'Export to Excel') : null,
        evs.length ? el('button', { class: 'btn ghost danger', onclick: deleteEvent }, 'Delete') : null)));
  }

  // ---------- details ----------

  function importedEventNames() {
    const names = new Set();
    for (const k of ['ticketSales', 'eventCosts', 'externalHires']) for (const r of S.data.records[k]) if (r.event) names.add(r.event);
    return [...names].sort();
  }

  function renderDetails(ev) {
    const names = importedEventNames();
    return el('section', { class: 'card' },
      el('h2', null, 'Event details'),
      el('div', { class: 'grid-2' },
        el('label', { class: 'field' }, 'Event name',
          el('input', { id: 'ev-name', value: ev.name, oninput: (e) => { ev.name = e.target.value; S.save(); syncPickerLabel(ev); } })),
        el('label', { class: 'field' }, 'Date',
          el('input', { type: 'date', value: ev.date, onchange: (e) => { ev.date = e.target.value; S.save(); syncPickerLabel(ev); } })),
        el('label', { class: 'field' }, 'Name used in imported spreadsheets',
          el('input', { list: 'imported-events', value: ev.linkName, placeholder: ev.name || 'Same as event name',
            oninput: (e) => { ev.linkName = e.target.value; S.save(); } }),
          el('datalist', { id: 'imported-events' }, names.map((n) => el('option', { value: n }))),
          el('span', { class: 'hint' }, names.length ? 'Used to pull ticket sales and costs from the Data tab.' : 'Once you import ticket sales or costs, pick the matching event name here.')),
        el('label', { class: 'field' }, 'Notes',
          el('textarea', { rows: 2, oninput: (e) => { ev.notes = e.target.value; S.save(); } }, ev.notes || ''))));
  }

  function syncPickerLabel(ev) {
    const opt = document.querySelector(`#event-picker option[value="${ev.id}"]`);
    if (opt) opt.textContent = (ev.name || 'Untitled') + (ev.date ? ` · ${U.fmtDate(ev.date)}` : '');
  }

  // ---------- tickets ----------

  function numInput(obj, key, attrs) {
    return el('input', {
      type: 'number', inputmode: 'decimal', step: 'any', min: 0, value: obj[key] === '' || obj[key] == null ? '' : obj[key],
      ...attrs,
      oninput: (e) => { obj[key] = numVal(e.target.value); persist(); },
    });
  }

  function calcCell(fn, cls) {
    const td = el('td', { class: 'num calc ' + (cls || '') });
    const update = () => { td.textContent = fn(); };
    update();
    calcs.push(update);
    return td;
  }

  function renderTickets(ev) {
    const rows = ev.tickets.map((t) => el('tr', null,
      el('td', null, el('input', { value: t.name, 'aria-label': 'Ticket type', oninput: (e) => { t.name = e.target.value; persist(); } })),
      el('td', null, numInput(t, 'price', { 'aria-label': 'Price', placeholder: '0.00' })),
      el('td', null, numInput(t, 'expectedQty', { 'aria-label': 'Expected sales', step: 1 })),
      el('td', null, numInput(t, 'actualQty', { 'aria-label': 'Actual sales', step: 1 })),
      calcCell(() => money((Number(t.price) || 0) * (Number(t.expectedQty) || 0))),
      calcCell(() => (t.actualQty === '' ? '–' : money((Number(t.price) || 0) * (Number(t.actualQty) || 0)))),
      el('td', null, el('button', { class: 'icon-btn', 'aria-label': 'Remove ticket type', title: 'Remove',
        onclick: () => { ev.tickets = ev.tickets.filter((x) => x !== t); S.save(); E.render(); } }, '×'))));

    const totals = el('tr', { class: 'total' },
      el('th', { scope: 'row' }, 'Total'),
      el('td'),
      calcCell(() => U.fmtNum(F.attendees(ev, 'plan'))),
      calcCell(() => U.fmtNum(F.attendees(ev, 'actual'))),
      calcCell(() => money(F.summarise(ev, 'plan').revenue)),
      calcCell(() => money(F.summarise(ev, 'actual').revenue)),
      el('td'));

    return el('section', { class: 'card' },
      el('div', { class: 'card-head' },
        el('h2', null, 'Ticket sales'),
        el('button', { class: 'btn small', onclick: () => pullTickets(ev) }, 'Fill actual sales from imported data')),
      el('p', { class: 'hint' }, 'One row per ticket price (e.g. member / non-member / early bird). Free tickets count as attendees for per-head costs.'),
      el('div', { class: 'table-scroll' }, el('table', { class: 'sheet' },
        el('thead', null, el('tr', null,
          el('th', null, 'Ticket type'), el('th', { class: 'num' }, `Price (${sym()})`), el('th', { class: 'num' }, 'Expected sales'),
          el('th', { class: 'num' }, 'Actual sales'), el('th', { class: 'num' }, 'Expected income'), el('th', { class: 'num' }, 'Actual income'),
          el('th', null, el('span', { class: 'visually-hidden' }, 'Remove')))),
        el('tbody', null, rows),
        el('tfoot', null, totals))),
      el('button', { class: 'btn ghost small add', onclick: () => { ev.tickets.push({ id: U.uid(), name: '', price: '', expectedQty: '', actualQty: '' }); S.save(); E.render(); } }, '+ Add ticket type'));
  }

  // ---------- costs ----------

  function renderCostTable(ev, scenario) {
    const listKey = scenario === 'plan' ? 'plannedCosts' : 'actualCosts';
    const n = () => F.attendees(ev, scenario);

    const section = (type) => {
      const lines = ev[listKey].filter((l) => l.type === type);
      const isVar = type === 'variable';
      const body = lines.map((l) => el('tr', null,
        el('td', null, el('input', { value: l.description, 'aria-label': 'Description', placeholder: isVar ? 'e.g. Food per person' : 'e.g. Venue hire',
          oninput: (e) => { l.description = e.target.value; persist(); } })),
        el('td', null, numInput(l, 'unitCost', { 'aria-label': isVar ? 'Cost per unit' : 'Cost', placeholder: '0.00' })),
        el('td', null, (() => {
          const inp = numInput(l, 'qty', { 'aria-label': 'Quantity', step: 1 });
          const setPh = () => { inp.placeholder = isVar ? `${U.fmtNum(n())} auto` : '1'; inp.title = isVar ? 'Blank = number of attendees' : ''; };
          setPh();
          calcs.push(setPh);
          return inp;
        })()),
        calcCell(() => money(F.lineTotal(l, n()))),
        el('td', null, el('input', { value: l.notes || '', 'aria-label': 'Notes', class: 'notes',
          oninput: (e) => { l.notes = e.target.value; S.save(); } })),
        el('td', null, el('button', { class: 'icon-btn', 'aria-label': 'Remove cost', title: 'Remove',
          onclick: () => { ev[listKey] = ev[listKey].filter((x) => x !== l); S.save(); E.render(); } }, '×'))));
      const sub = el('tr', { class: 'subtotal' },
        el('th', { scope: 'row', colspan: 3 }, isVar ? 'Variable costs subtotal' : 'Fixed costs subtotal'),
        calcCell(() => money(isVar ? F.summarise(ev, scenario).variable : F.summarise(ev, scenario).fixed)),
        el('td', { colspan: 2 }));
      return [
        el('tr', { class: 'group' }, el('th', { colspan: 6, scope: 'colgroup' },
          isVar ? 'Variable costs ' : 'Fixed costs ',
          el('span', { class: 'hint' }, isVar ? '— change with the number of attendees (food, wristbands, transport per head). Leave Qty blank to use attendees.' : '— the same however many come (venue, DJ, insurance, coach fee).'))),
        body,
        el('tr', { class: 'add-row' }, el('td', { colspan: 6 },
          el('button', { class: 'btn ghost small add', onclick: () => { ev[listKey].push({ id: U.uid(), description: '', type, unitCost: '', qty: '', notes: '' }); S.save(); E.render(); } },
            isVar ? '+ Add variable cost' : '+ Add fixed cost'))),
        sub,
      ];
    };

    const plan = scenario === 'plan';
    const head = el('div', { class: 'card-head' },
      el('h2', null, plan ? 'Planned costs ' : 'Actual costs ', el('span', { class: 'muted small' }, plan ? '(pre-event budget)' : '(post-event)')),
      plan ? null : el('div', { class: 'row' },
        el('button', { class: 'btn small', onclick: () => copyPlanToActual(ev) }, 'Copy planned lines'),
        el('button', { class: 'btn small', onclick: () => pullCosts(ev) }, 'Add costs from imported data')));

    return el('section', { class: 'card' }, head,
      el('div', { class: 'table-scroll' }, el('table', { class: 'sheet costs' },
        el('thead', null, el('tr', null, el('th', null, 'Description'), el('th', { class: 'num' }, `Unit cost (${sym()})`), el('th', { class: 'num' }, 'Qty'),
          el('th', { class: 'num' }, 'Total'), el('th', null, 'Notes'), el('th', null, el('span', { class: 'visually-hidden' }, 'Remove')))),
        el('tbody', null, section('fixed'), section('variable')),
        el('tfoot', null, el('tr', { class: 'total' },
          el('th', { scope: 'row', colspan: 3 }, plan ? 'Total planned cost' : 'Total actual cost'),
          calcCell(() => money(F.summarise(ev, scenario).totalCost)),
          el('td', { colspan: 2 }))))));
  }

  function copyPlanToActual(ev) {
    if (ev.actualCosts.length && !confirm('Replace the actual cost lines with a copy of the planned ones?')) return;
    ev.actualCosts = ev.plannedCosts.map((l) => ({ ...l, id: U.uid() }));
    S.save();
    E.render();
    SF.app.toast('Planned lines copied. Now update each one with what was actually spent.');
  }

  // ---------- pulling from imported data ----------

  const matchName = (ev) => SF.master.resolveKey(S.data, ev.linkName || ev.name);
  const keyOf = (name) => SF.master.resolveKey(S.data, name);

  function pullTickets(ev) {
    const target = matchName(ev);
    const recs = S.data.records.ticketSales.filter((r) => keyOf(r.event) === target);
    if (!recs.length) {
      SF.app.toast(`No imported ticket sales found for "${ev.linkName || ev.name}". Check the event name matches the spreadsheet.`, true);
      return;
    }
    const groups = new Map();
    for (const r of recs) {
      const name = r.ticketType || 'General';
      const g = groups.get(U.norm(name)) || { name, qty: 0, amount: 0 };
      g.qty += r.quantity || 1;
      g.amount += r.amount || 0;
      groups.set(U.norm(name), g);
    }
    let added = 0;
    for (const g of groups.values()) {
      let t = ev.tickets.find((x) => U.norm(x.name) === U.norm(g.name));
      if (!t && ev.tickets.length === 1 && groups.size === 1 && ev.tickets[0].actualQty === '') t = ev.tickets[0];
      if (!t) {
        t = { id: U.uid(), name: g.name, price: '', expectedQty: '', actualQty: '' };
        ev.tickets.push(t);
        added++;
      }
      t.actualQty = g.qty;
      if (t.price === '' || t.price == null) t.price = U.round2(g.amount / g.qty);
    }
    S.save();
    E.render();
    const received = U.sum(recs, (r) => r.amount || 0);
    const table = F.summarise(ev, 'actual').revenue;
    const gap = Math.abs(received - table) >= 1
      ? ` Note: the records total ${money(received)} but price × sales gives ${money(table)} (discounts or refunds?).` : '';
    SF.app.toast(`Filled actual sales for ${groups.size} ticket type${groups.size > 1 ? 's' : ''} from ${recs.length} records${added ? ` (${added} new)` : ''}.${gap}`);
  }

  function pullCosts(ev) {
    const target = matchName(ev);
    const have = new Set(ev.actualCosts.map((l) => l.sourceId).filter(Boolean));
    const found = [];
    let matched = 0;
    // Line the record up with its planned line when one fits, so the
    // planned-vs-actual comparison pairs them.
    const add = (text, fallback, type, rec) => {
      const plan = F.matchPlannedLine(ev.plannedCosts, text, type);
      if (plan) matched++;
      found.push({ description: plan ? plan.description : fallback, type: type || (plan && plan.type) || 'fixed', amount: rec.amount, sourceId: rec.id, notes: rec.notes });
    };
    for (const r of S.data.records.eventCosts) {
      if (keyOf(r.event) !== target || have.has(r.id)) continue;
      add([r.item, r.supplier].join(' '), r.item || r.supplier || 'Cost', r.costType,
        { amount: r.amount, id: r.id, notes: [r.item, r.supplier, r.date && U.fmtDate(r.date)].filter(Boolean).join(' · ') });
    }
    for (const r of S.data.records.externalHires) {
      if (keyOf(r.event) !== target || have.has(r.id)) continue;
      const desc = [r.provider, r.service].filter(Boolean).join(' – ') || 'External hire';
      add(desc, desc, null,
        { amount: r.amount, id: r.id, notes: [desc, r.hours != null && r.rate != null ? `${U.fmtNum(r.hours, 2)} × ${money(r.rate)}` : null, r.date && U.fmtDate(r.date)].filter(Boolean).join(' · ') });
    }
    if (!found.length) {
      SF.app.toast(have.size ? 'No new cost records to add for this event.' : `No imported costs or hires found for "${ev.linkName || ev.name}".`, !have.size);
      return;
    }
    for (const f of found) ev.actualCosts.push({ id: U.uid(), description: f.description, type: f.type, unitCost: f.amount, qty: 1, notes: f.notes, sourceId: f.sourceId });
    S.save();
    E.render();
    const unmatched = found.length - matched;
    SF.app.toast(`Added ${found.length} cost line${found.length > 1 ? 's' : ''} from imported data` +
      (ev.plannedCosts.length ? ` (${matched} matched to planned lines${unmatched ? `, ${unmatched} unplanned` : ''})` : '') +
      '. Check each is marked fixed or variable correctly.');
  }

  // ---------- analysis ----------

  function deltaCell(d, goodWhenUp, fmt) {
    if (d === null || !isFinite(d) || Math.abs(d) < 0.005) return el('td', { class: 'num muted' }, fmt ? fmt(0) : '–');
    const good = goodWhenUp ? d > 0 : d < 0;
    return el('td', { class: 'num delta ' + (good ? 'good' : 'bad') },
      el('span', { 'aria-hidden': 'true' }, d > 0 ? '▲ ' : '▼ '), fmt(d),
      el('span', { class: 'visually-hidden' }, good ? ' (better than plan)' : ' (worse than plan)'));
  }

  function statTile(label, value, sub, tone) {
    return el('div', { class: 'stat ' + (tone || '') }, el('div', { class: 'stat-label' }, label), el('div', { class: 'stat-value' }, value), sub ? el('div', { class: 'stat-sub' }, sub) : null);
  }

  function renderAnalysis() {
    const host = document.getElementById('event-analysis');
    if (!host) return;
    const ev = cur();
    U.clear(host);
    const p = F.summarise(ev, 'plan');
    const hasA = F.hasActuals(ev);
    const a = F.summarise(ev, 'actual');
    const m = (n) => money(n);
    const ms = (n) => money(n, { signed: true });

    // Headline tiles
    host.append(el('div', { class: 'stats' },
      statTile('Planned net profit', m(p.net), p.revenue ? `${U.fmtPct(p.margin)} margin on ${m(p.revenue)} income` : 'Add ticket prices and expected sales', p.net < 0 ? 'neg' : ''),
      statTile('Actual net profit', hasA ? m(a.net) : '–', hasA ? (a.revenue ? `${U.fmtPct(a.margin)} margin on ${m(a.revenue)} income` : 'No actual ticket sales yet') : 'Fill in actual sales and costs after the event', hasA && a.net < 0 ? 'neg' : ''),
      statTile('Difference vs plan', hasA ? ms(a.net - p.net) : '–', hasA ? (a.net >= p.net ? 'Better than planned' : 'Worse than planned') : null)));

    // Comparison table (also the table view of the bar chart)
    const rows = [
      ['Attendees', p.attendees, a.attendees, true, (v) => U.fmtNum(v), (d) => (d > 0 ? '+' : '−') + U.fmtNum(Math.abs(d))],
      ['Ticket income', p.revenue, a.revenue, true, m, ms],
      ['Fixed costs', p.fixed, a.fixed, false, m, ms],
      ['Variable costs', p.variable, a.variable, false, m, ms],
      ['Total costs', p.totalCost, a.totalCost, false, m, ms],
      ['Net profit', p.net, a.net, true, m, ms],
      ['Profit margin', p.margin, a.margin, true, (v) => U.fmtPct(v), (d) => U.fmtPct(d, true).replace('%', ' pts')],
      ['Cost per attendee', p.costPerHead, a.costPerHead, false, m, ms],
    ];
    host.append(el('h3', null, 'Planned vs actual'),
      el('div', { class: 'table-scroll' }, el('table', { class: 'compare' },
        el('thead', null, el('tr', null, el('th', null, ''), el('th', { class: 'num' }, 'Planned'), el('th', { class: 'num' }, 'Actual'), el('th', { class: 'num' }, 'Difference'))),
        el('tbody', null, rows.map(([label, pv, av, up, fmt, dfmt]) => el('tr', { class: label === 'Net profit' ? 'total' : null },
          el('th', { scope: 'row' }, label),
          el('td', { class: 'num' }, pv == null ? '–' : fmt(pv)),
          el('td', { class: 'num' }, hasA && av != null ? fmt(av) : '–'),
          hasA && pv != null && av != null ? deltaCell(av - pv, up, dfmt) : el('td', { class: 'num muted' }, '–')))))));

    const chartHost = el('div', { class: 'chart-host' });
    host.append(chartHost);
    const cats = ['Ticket income', 'Fixed costs', 'Variable costs', 'Net profit'];
    const series = [{ label: 'Planned', color: '--series-1', values: [p.revenue, p.fixed, p.variable, p.net] }];
    if (hasA) series.push({ label: 'Actual', color: '--series-2', values: [a.revenue, a.fixed, a.variable, a.net] });
    SF.charts.groupedBars(chartHost, cats, series, sym(), 'Bar chart of income, fixed costs, variable costs and net profit, planned' + (hasA ? ' and actual.' : '.'));

    // Break-even
    const scen = hasA ? beScenario : 'plan';
    const s = scen === 'plan' ? p : a;
    const be = F.breakEven(s);
    const toggle = el('div', { class: 'segmented', role: 'group', 'aria-label': 'Break-even based on' },
      ['plan', 'actual'].map((k) => el('button', { 'aria-pressed': scen === k ? 'true' : 'false', disabled: k === 'actual' && !hasA,
        onclick: () => { beScenario = k; renderAnalysis(); } }, k === 'plan' ? 'Planned figures' : 'Actual figures')));

    const beFacts = el('dl', { class: 'facts' },
      el('div', null, el('dt', null, 'Fixed costs'), el('dd', null, m(s.fixed))),
      el('div', null, el('dt', null, 'Average ticket price'), el('dd', null, m(s.avgPrice))),
      el('div', null, el('dt', null, 'Variable cost per attendee'), el('dd', null, m(s.varPerHead))),
      el('div', null, el('dt', null, 'Each attendee contributes'), el('dd', null, m(be.contribution))),
      el('div', { class: 'key-fact' }, el('dt', null, 'Break-even attendance'), el('dd', null, be.possible ? U.fmtNum(be.units) + ' people' : 'Not reachable')),
      s.attendees > 0 && be.possible ? el('div', null, el('dt', null, 'Margin of safety'), el('dd', { class: be.safety < 0 ? 'bad' : '' }, `${be.safety < 0 ? '−' : ''}${U.fmtNum(Math.abs(be.safety))} people (${U.fmtPct(be.safetyPct)})`)) : null,
      s.attendees > 0 ? el('div', null, el('dt', null, `Break-even price at ${U.fmtNum(s.attendees)} attendees`), el('dd', null, m(be.priceAtAttendance))) : null);

    const cvp = el('div', { class: 'chart-host' });
    host.append(
      el('div', { class: 'card-head' }, el('h3', null, 'Break-even analysis'), toggle),
      el('p', { class: 'hint' }, 'Break-even = fixed costs ÷ (average ticket price − variable cost per attendee). The average price is weighted by the ticket mix.'),
      el('div', { class: 'be-grid' }, beFacts, cvp));
    SF.charts.breakEven(cvp, s, be, sym());

    // Line variance
    if (hasA) {
      const lv = F.lineVariance(ev);
      host.append(el('h3', null, 'Cost lines: planned vs actual'),
        el('div', { class: 'table-scroll' }, el('table', { class: 'compare' },
          el('thead', null, el('tr', null, el('th', null, 'Cost'), el('th', null, 'Type'), el('th', { class: 'num' }, 'Planned'), el('th', { class: 'num' }, 'Actual'), el('th', { class: 'num' }, 'Difference'))),
          el('tbody', null, lv.map((r) => el('tr', null,
            el('th', { scope: 'row' }, r.description, !r.inPlan ? el('span', { class: 'tag' }, 'unplanned') : !r.inActual ? el('span', { class: 'tag' }, 'not spent') : null),
            el('td', { class: 'muted' }, r.type === 'variable' ? 'Variable' : 'Fixed'),
            el('td', { class: 'num' }, r.inPlan ? m(r.planned) : '–'),
            el('td', { class: 'num' }, r.inActual ? m(r.actual) : '–'),
            deltaCell(r.diff, false, ms)))))));
    }

    // Findings
    host.append(el('h3', null, 'Key findings'),
      el('ul', { class: 'findings' }, F.findings(ev, sym()).map((f) => el('li', { class: f.tone },
        el('span', { class: 'finding-icon', 'aria-hidden': 'true' }, f.tone === 'good' ? '✓' : f.tone === 'bad' ? '!' : 'i'),
        el('span', { class: 'visually-hidden' }, f.tone === 'good' ? 'Good: ' : f.tone === 'bad' ? 'Watch: ' : 'Note: '),
        f.text))));
  }

  // ---------- export ----------

  async function exportEvent() {
    const ev = cur();
    const X = SF.excel, sy = sym();
    const wb = X.newWorkbook();
    const p = F.summarise(ev, 'plan'), a = F.summarise(ev, 'actual');
    const hasA = F.hasActuals(ev);

    const sum = wb.addWorksheet('Summary');
    sum.getCell('A1').value = ev.name || 'Event';
    sum.getCell('A1').font = { bold: true, size: 14 };
    sum.getCell('A2').value = ev.date ? U.fmtDate(ev.date) : '';
    const r2 = (v) => (v == null ? null : U.round2(v));
    const metric = (label, pv, av) => ({ m: label, p: r2(pv), a: hasA ? r2(av) : null, d: hasA && pv != null && av != null ? r2(av - pv) : null });
    let r = X.addTable(sum, 4, [
      { header: 'Metric', key: 'm', width: 34 }, { header: 'Planned', key: 'p', width: 14, money: true },
      { header: 'Actual', key: 'a', width: 14, money: true }, { header: 'Difference', key: 'd', width: 14, money: true }],
    [metric('Ticket income', p.revenue, a.revenue), metric('Fixed costs', p.fixed, a.fixed), metric('Variable costs', p.variable, a.variable),
      metric('Total costs', p.totalCost, a.totalCost), { ...metric('Net profit', p.net, a.net), _bold: true }, metric('Cost per attendee', p.costPerHead, a.costPerHead)], sy, 'Planned vs actual');
    const att = sum.getRow(r);
    att.values = ['Attendees', p.attendees, hasA ? a.attendees : null, hasA ? a.attendees - p.attendees : null];
    r += 2;
    const beRows = (s) => { const b = F.breakEven(s); return [r2(s.fixed), r2(s.avgPrice), r2(s.varPerHead), r2(b.contribution), b.possible ? b.units : 'Not reachable', r2(b.priceAtAttendance)]; };
    const bp = beRows(p), ba = hasA ? beRows(a) : [];
    const labels = ['Fixed costs', 'Average ticket price', 'Variable cost per attendee', 'Contribution per attendee', 'Break-even attendance', 'Break-even price at this attendance'];
    r = X.addTable(sum, r, [{ header: 'Break-even', key: 'm', width: 34 }, { header: 'Planned', key: 'p', money: true }, { header: 'Actual', key: 'a', money: true }],
      labels.map((l, i) => ({ m: l, p: bp[i], a: hasA ? ba[i] : null })), sy);
    // attendance counts are not money
    sum.getCell(r - 2, 2).numFmt = '0'; sum.getCell(r - 2, 3).numFmt = '0';
    r += 1;
    sum.getCell(r, 1).value = 'Key findings';
    sum.getCell(r, 1).font = { bold: true, size: 12 };
    F.findings(ev, sy).forEach((f, i) => { sum.getCell(r + 1 + i, 1).value = '• ' + f.text; });

    // Tickets with live formulas
    const tk = wb.addWorksheet('Ticket sales');
    const tRows = ev.tickets.map((t, i) => {
      const row = i + 2, price = Number(t.price) || 0, eq = Number(t.expectedQty) || 0, aq = t.actualQty === '' ? null : Number(t.actualQty);
      return { name: t.name, price, eq, aq,
        ei: { formula: `B${row}*C${row}`, result: price * eq },
        ai: { formula: `B${row}*D${row}`, result: price * (aq || 0) } };
    });
    const last = tRows.length + 1;
    tRows.push({ name: 'Total', eq: { formula: `SUM(C2:C${last})`, result: p.attendees }, aq: { formula: `SUM(D2:D${last})`, result: a.attendees },
      ei: { formula: `SUM(E2:E${last})`, result: p.revenue }, ai: { formula: `SUM(F2:F${last})`, result: a.revenue }, _bold: true });
    X.addTable(tk, 1, [{ header: 'Ticket type', key: 'name', width: 24 }, { header: 'Price', key: 'price', width: 12, money: true },
      { header: 'Expected sales', key: 'eq', width: 15 }, { header: 'Actual sales', key: 'aq', width: 13 },
      { header: 'Expected income', key: 'ei', width: 16, money: true }, { header: 'Actual income', key: 'ai', width: 16, money: true }], tRows, sy);

    const costSheet = (name, lines, n) => {
      const ws = wb.addWorksheet(name);
      const ordered = [...lines.filter((l) => l.type !== 'variable'), ...lines.filter((l) => l.type === 'variable')];
      const rows = ordered.map((l, i) => {
        const row = i + 2, unit = Number(l.unitCost) || 0, q = F.lineQty(l, n);
        return { type: l.type === 'variable' ? 'Variable' : 'Fixed', d: l.description, u: unit, q,
          t: { formula: `C${row}*D${row}`, result: unit * q },
          n: [l.qty === '' && l.type === 'variable' ? 'Qty = attendees' : null, l.notes].filter(Boolean).join(' · ') };
      });
      const lr = rows.length + 1;
      rows.push({ d: 'Fixed subtotal', t: { formula: `SUMIF(A2:A${lr},"Fixed",E2:E${lr})`, result: U.sum(lines.filter((l) => l.type !== 'variable'), (l) => F.lineTotal(l, n)) } });
      rows.push({ d: 'Variable subtotal', t: { formula: `SUMIF(A2:A${lr},"Variable",E2:E${lr})`, result: U.sum(lines.filter((l) => l.type === 'variable'), (l) => F.lineTotal(l, n)) } });
      rows.push({ d: 'Total', t: { formula: `SUM(E2:E${lr})`, result: U.sum(lines, (l) => F.lineTotal(l, n)) }, _bold: true });
      X.addTable(ws, 1, [{ header: 'Type', key: 'type', width: 10 }, { header: 'Description', key: 'd', width: 30 }, { header: 'Unit cost', key: 'u', width: 12, money: true },
        { header: 'Qty', key: 'q', width: 8 }, { header: 'Total', key: 't', width: 14, money: true }, { header: 'Notes', key: 'n', width: 36 }], rows, sy);
    };
    costSheet('Planned costs', ev.plannedCosts, p.attendees);
    costSheet('Actual costs', ev.actualCosts, a.attendees);

    await X.saveWorkbook(wb, `${U.safeFilename(ev.name)}-finance.xlsx`);
  }

  // ---------- render ----------

  E.render = function () {
    const host = U.clear(document.getElementById('events-body'));
    calcs = [];
    if (!S.data.events.find((e) => e.id === currentId)) currentId = S.data.events[0] ? S.data.events[0].id : null;
    renderToolbar(host);
    const ev = cur();
    if (!ev) {
      host.append(el('section', { class: 'card empty-state' },
        el('h2', null, 'Plan and track an event'),
        el('p', null, 'Create an event to budget it before it happens (ticket prices, expected sales, fixed and variable costs), then fill in what actually happened afterwards. You get net profit, break-even and a planned-vs-actual comparison.'),
        el('button', { class: 'btn primary', onclick: newEvent }, '+ New event')));
      return;
    }
    host.append(
      renderDetails(ev),
      renderTickets(ev),
      el('div', { class: 'costs-pair' }, renderCostTable(ev, 'plan'), renderCostTable(ev, 'actual')),
      el('section', { class: 'card' }, el('h2', null, 'Analysis'), el('div', { id: 'event-analysis' })));
    renderAnalysis();
  };

  E.select = (id) => { currentId = id; };

  /** Start a new plan from an event's actual figures (from the master dataset). */
  E.createFromActuals = function (e) {
    const n = e.attendees || 0;
    const r2 = U.round2;
    const ev = {
      id: U.uid(), name: `${e.name} (next)`, date: '', linkName: e.name,
      notes: `Started from ${e.name} actuals${e.kind === 'recurring' ? ` (${e.sessionCount} sessions, figures are for the whole run)` : ''}.`,
      tickets: e.tiers.length
        ? e.tiers.map((t) => ({ id: U.uid(), name: t.name, price: r2(t.avgPrice), expectedQty: t.qty, actualQty: '' }))
        : [{ id: U.uid(), name: 'Standard', price: '', expectedQty: n || '', actualQty: '' }],
      plannedCosts: e.costLines.map((l) => (l.costType === 'variable' && n
        ? { id: U.uid(), description: l.name, type: 'variable', unitCost: r2(l.amount / n), qty: '', notes: `last time ${money(l.amount)} for ${n} people` }
        : { id: U.uid(), description: l.name, type: 'fixed', unitCost: r2(l.amount), qty: '', notes: l.count > 1 ? `${l.count} payments last time` : '' })),
      actualCosts: [],
    };
    S.data.events.push(ev);
    currentId = ev.id;
    S.save();
    location.hash = '#/plan/event';
    SF.app.toast(`New plan started from ${e.name}. Adjust the numbers for next time.`);
  };
})(typeof window !== 'undefined' ? window : globalThis);
