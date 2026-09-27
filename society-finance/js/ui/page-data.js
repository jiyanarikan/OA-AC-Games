/*
 * Step 2 - Check data: the master dataset. Shows everything combined, flags
 * problems, lets the committee merge duplicate event names and tell the tool
 * what each event is for (fundraiser / break even / member benefit).
 */
(function (root) {
  const SF = (root.SF = root.SF || {});
  const U = SF.util, S = SF.store, K = SF.kit, M = SF.master;
  const el = U.el;

  const filt = { type: 'all', stream: 'all', event: 'all', q: '' };
  const PAGE = 250;

  const CAT_OF_STREAM = { memberships: 'memberships', tickets: 'ticketSales', otherIncome: 'otherIncome', expenses: 'eventCosts', hires: 'externalHires' };

  function similar(a, b) {
    const ta = new Set(a.split(' ').filter((w) => w.length > 2 && !/^(the|and|20\d\d|\d+)$/.test(w)));
    const tb = new Set(b.split(' ').filter((w) => w.length > 2 && !/^(the|and|20\d\d|\d+)$/.test(w)));
    if (!ta.size || !tb.size) return false;
    const inter = [...ta].filter((w) => tb.has(w)).length;
    return inter / Math.min(ta.size, tb.size) >= 0.99 || a.includes(b) || b.includes(a);
  }

  function setMeta(key, patch) {
    S.data.eventMeta[key] = { ...(S.data.eventMeta[key] || {}), ...patch };
    for (const k of Object.keys(S.data.eventMeta[key])) if (S.data.eventMeta[key][k] === '' || S.data.eventMeta[key][k] == null) delete S.data.eventMeta[key][k];
    S.save();
    SF.app.render();
  }

  function merge(fromKey, intoKey) {
    if (!intoKey || fromKey === intoKey) return;
    S.data.eventAliases[fromKey] = intoKey;
    for (const [k, v] of Object.entries(S.data.eventAliases)) if (v === fromKey) S.data.eventAliases[k] = intoKey;
    S.save();
    SF.app.toast('Merged. Both names now count as one event.');
    SF.app.render();
  }

  function unmerge(fromKey) {
    delete S.data.eventAliases[fromKey];
    S.save();
    SF.app.render();
  }

  function eventsTable(model) {
    const evs = model.events;
    if (!evs.length) return el('p', { class: 'muted' }, 'No event names found yet. Ticket sales, expenses, hires and attendance rows with an event name will show up here.');
    return el('div', { class: 'table-scroll' }, el('table', { class: 'data events-setup' },
      el('thead', null, el('tr', null,
        el('th', null, 'Event / activity'), el('th', null, 'Type'), el('th', null, 'Purpose'), el('th', { class: 'num' }, 'Capacity'),
        el('th', null, 'Dates'), el('th', { class: 'num' }, 'Rows'), el('th', null, 'Same as…'))),
      el('tbody', null, evs.map((e) => {
        const meta = S.data.eventMeta[e.key] || {};
        return el('tr', null,
          el('th', { scope: 'row' }, el('a', { href: `#/events/${encodeURIComponent(e.key)}` }, e.name)),
          el('td', null, el('select', { 'aria-label': `Type for ${e.name}`, onchange: (ev) => setMeta(e.key, { kind: ev.target.value }) },
            el('option', { value: '', selected: !meta.kind }, `Auto: ${e.detectedFrequency || 'one-off'}`),
            el('option', { value: 'oneoff', selected: meta.kind === 'oneoff' }, 'One-off'),
            el('option', { value: 'recurring', selected: meta.kind === 'recurring' }, 'Recurring'))),
          el('td', null, el('select', { 'aria-label': `Purpose of ${e.name}`, onchange: (ev) => setMeta(e.key, { goal: ev.target.value }) },
            el('option', { value: '', selected: !meta.goal }, `Auto: ${M.GOALS[e.goal].label}`),
            Object.entries(M.GOALS).map(([k, g]) => el('option', { value: k, selected: meta.goal === k, title: g.hint }, g.label)))),
          el('td', { class: 'num' }, el('input', { type: 'number', min: 0, step: 1, value: meta.capacity || '', placeholder: '–', 'aria-label': `Capacity of ${e.name}`, class: 'cap-input',
            onchange: (ev) => setMeta(e.key, { capacity: ev.target.value ? +ev.target.value : '' }) })),
          el('td', { class: 'muted nowrap' }, e.firstDate ? (e.firstDate === e.lastDate ? U.fmtDate(e.firstDate) : `${U.fmtDate(e.firstDate)} – ${U.fmtDate(e.lastDate)}`) : '–'),
          el('td', { class: 'num' }, U.fmtNum(e.tx.length + e.att.length)),
          el('td', null, el('select', { 'aria-label': `Merge ${e.name} into another event`, onchange: (ev) => merge(e.key, ev.target.value) },
            el('option', { value: '' }, '—'),
            evs.filter((o) => o.key !== e.key).map((o) => el('option', { value: o.key }, o.name)))));
      }))));
  }

  function health(model) {
    const items = [];
    const all = SF.app.model('all');
    const noDate = all.tx.filter((t) => !t.date).length + all.attendance.filter((a) => !a.date).length;
    if (noDate) items.push({ tone: 'bad', title: 'Rows without a date', text: `${noDate} rows have no date, so they can't appear in time-based charts. They still count in totals for "All years".` });
    const ticketsNoEvent = all.tx.filter((t) => t.stream === 'tickets' && !t.eventKey).length;
    if (ticketsNoEvent) items.push({ tone: 'bad', title: 'Ticket sales without an event', text: `${ticketsNoEvent} ticket sales have no event name, so they can't be linked to an event's costs.` });
    const attNoEvent = all.attendance.filter((a) => !a.eventKey).length;
    if (attNoEvent) items.push({ tone: 'bad', title: 'Attendance without an event', text: `${attNoEvent} attendance rows have no event or session name.` });
    const evs = all.events;
    const pairs = [];
    for (let i = 0; i < evs.length; i++) for (let j = i + 1; j < evs.length; j++) if (similar(evs[i].key, evs[j].key)) pairs.push([evs[i], evs[j]]);
    for (const [a, b] of pairs.slice(0, 5)) {
      items.push({ tone: 'info', title: 'Possible duplicate names', text: `“${a.name}” and “${b.name}” might be the same event.`, action: el('button', { class: 'btn small', onclick: () => merge(b.key, a.key) }, `Merge into “${a.name}”`) });
    }
    const aliases = Object.entries(S.data.eventAliases);
    if (aliases.length) {
      items.push({ tone: 'good', title: 'Merged names', text: aliases.map(([f, t]) => `“${f}” → “${(all.eventMap.get(t) || { name: t }).name}”`).join('; '),
        action: el('div', { class: 'row' }, aliases.slice(0, 4).map(([f]) => el('button', { class: 'btn ghost small', onclick: () => unmerge(f) }, `Undo “${f}”`))) });
    }
    const general = model.tx.filter((t) => t.kind === 'expense' && !t.eventKey);
    if (general.length) items.push({ tone: 'info', title: 'General costs', text: `${general.length} expenses (${K.money(U.sum(general, (t) => t.amount))}) aren't tied to an event, e.g. kit, insurance or affiliation fees. They count as society running costs.` });
    if (!items.length) items.push({ tone: 'good', title: 'Looks good', text: 'No problems found in the data.' });
    return el('ul', { class: 'insights' }, items.map((f) => el('li', { class: f.tone },
      el('span', { class: 'finding-icon', 'aria-hidden': 'true' }, f.tone === 'good' ? '✓' : f.tone === 'bad' ? '!' : 'i'),
      el('div', null, el('strong', { class: 'insight-title' }, f.title), el('span', null, f.text), f.action ? el('div', { class: 'insight-action' }, f.action) : null))));
  }

  function masterTable(model) {
    const q = U.norm(filt.q);
    const rows = model.tx
      .filter((t) => filt.type === 'all' || t.kind === filt.type)
      .filter((t) => filt.stream === 'all' || t.stream === filt.stream)
      .filter((t) => filt.event === 'all' || (filt.event === 'none' ? !t.eventKey : t.eventKey === filt.event))
      .filter((t) => !q || U.norm([t.detail, t.party, t.eventKey].join(' ')).includes(q))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const total = U.sum(rows, (t) => (t.kind === 'income' ? t.amount : -t.amount));
    const evName = (k) => (model.eventMap.get(k) || { name: k }).name;

    const controls = el('div', { class: 'filter-bar inner' },
      el('label', { class: 'filter' }, el('span', null, 'In / out'),
        el('select', { onchange: (e) => { filt.type = e.target.value; SF.app.render(); } },
          [['all', 'Everything'], ['income', 'Money in'], ['expense', 'Money out']].map(([v, l]) => el('option', { value: v, selected: filt.type === v }, l)))),
      el('label', { class: 'filter' }, el('span', null, 'Source'),
        el('select', { onchange: (e) => { filt.stream = e.target.value; SF.app.render(); } },
          el('option', { value: 'all' }, 'All sources'),
          M.STREAMS.map((s) => el('option', { value: s.key, selected: filt.stream === s.key }, s.label)))),
      el('label', { class: 'filter' }, el('span', null, 'Event'),
        el('select', { onchange: (e) => { filt.event = e.target.value; SF.app.render(); } },
          el('option', { value: 'all' }, 'All'),
          el('option', { value: 'none', selected: filt.event === 'none' }, '(not tied to an event)'),
          model.events.map((e) => el('option', { value: e.key, selected: filt.event === e.key }, e.name)))),
      el('label', { class: 'filter grow' }, el('span', null, 'Search'),
        el('input', { type: 'search', value: filt.q, placeholder: 'Item, supplier, member…', onchange: (e) => { filt.q = e.target.value; SF.app.render(); } })));

    const columns = [
      { key: 'date', label: 'Date', format: (v) => (v ? U.fmtDate(v) : '–'), exportValue: (v) => v },
      { key: 'kind', label: 'In / out', format: (v) => (v === 'income' ? 'In' : 'Out') },
      { key: 'stream', label: 'Source', format: (v) => M.streamLabel(v) },
      { key: 'eventKey', label: 'Event', format: (v) => (v ? evName(v) : '–'), exportValue: (v) => (v ? evName(v) : '') },
      { key: 'detail', label: 'Detail' },
      { key: 'qty', label: 'Qty', count: true },
      { key: 'signed', label: 'Amount', money: true, cls: (v) => (v < 0 ? 'neg-text' : '') },
      { key: 'fy', label: 'Year' },
      { key: 'del', label: '', format: (v, row) => row._del || '', exportValue: () => '' },
    ];
    const shown = rows.slice(0, PAGE).map((t) => ({
      ...t, signed: t.kind === 'income' ? t.amount : -t.amount,
      _del: el('button', { class: 'icon-btn', title: 'Delete this row', 'aria-label': 'Delete this row', onclick: (e) => {
        e.stopPropagation();
        const cat = CAT_OF_STREAM[t.stream];
        S.data.records[cat] = S.data.records[cat].filter((r) => r.id !== t.id);
        S.save();
        SF.app.render();
      } }, '×'),
    }));
    return el('div', null, controls,
      el('p', { class: 'summary-line' }, el('strong', null, U.fmtNum(rows.length)), ' rows · net ', el('strong', null, K.money(total, { signed: true })),
        rows.length > PAGE ? el('span', { class: 'muted' }, ` · showing the newest ${PAGE}; the Excel download has all of them`) : null),
      K.table({ columns, rows: shown, exportName: 'Master dataset', tall: true,
        exportRows: rows.map((t) => ({ ...t, signed: t.kind === 'income' ? t.amount : -t.amount })) }));
  }

  SF.pages = SF.pages || {};
  SF.pages.data = function (host) {
    const body = K.page(host, {
      step: 2, title: 'Check your data',
      lead: 'This is your master dataset: every upload combined into one list of money in and money out, linked to events. Fix anything flagged here and the analysis will be more accurate.',
    });
    if (!SF.app.hasData()) {
      body.append(K.empty({ title: 'No data yet', text: 'Add some spreadsheets first.', action: { href: '#/add', label: 'Go to Add data' } }));
      return;
    }
    body.append(K.filterBar({ gran: false }));
    const model = SF.app.model();
    const s = M.summary(model);
    body.append(K.stats([
      { label: 'Rows in the master dataset', value: U.fmtNum(s.records), sub: s.firstDate ? `${U.fmtDate(s.firstDate)} – ${U.fmtDate(s.lastDate)}` : null },
      { label: 'Money in', value: K.money(s.income, { whole: true }) },
      { label: 'Money out', value: K.money(s.spending, { whole: true }) },
      { label: 'Events & activities found', value: U.fmtNum(s.events), sub: `${s.recurring} recurring, ${s.events - s.recurring} one-off` },
    ]));

    const h = K.card({ title: 'Things to check', desc: 'Problems and suggestions the tool found in the combined data.' });
    h.body.append(health(model));
    body.append(h.el);

    const ev = K.card({
      title: 'Events and activities',
      desc: 'Found from the event names in your files. Set each one’s purpose so it is judged fairly: training that members get for free is a member benefit, not a failed fundraiser. Capacity (optional) lets the tool spot sell-outs.',
    });
    ev.body.append(eventsTable(model));
    body.append(ev.el);

    const mt = K.card({ title: 'Master dataset', desc: 'Every transaction from every file, newest first. Filter, search, delete a wrong row, or download it as Excel.' });
    mt.body.append(masterTable(model));
    body.append(mt.el);

    body.append(K.next({ prev: { href: '#/add', label: 'Add data' }, href: '#/analyse', label: 'Next: analyse' }));
  };
})(typeof window !== 'undefined' ? window : globalThis);
