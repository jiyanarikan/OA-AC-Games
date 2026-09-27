/*
 * Shared UI building blocks so every page looks and behaves the same:
 * page header, cards, stat tiles, tables (with Excel export), chart cards
 * with a Chart / Table switch, filter bar, insight lists, rating badges.
 */
(function (root) {
  const SF = (root.SF = root.SF || {});
  const U = SF.util;
  const el = U.el;
  const K = (SF.kit = {});

  // Work that needs the page to be in the DOM (charts measure their width).
  let queue = [];
  K.defer = (fn) => queue.push(fn);
  K.flush = () => { const q = queue; queue = []; q.forEach((fn) => fn()); };

  K.sym = () => SF.store.data.settings.currency;
  K.money = (n, o) => U.fmtMoney(n, K.sym(), o);

  K.icon = (name) => {
    const paths = {
      upload: 'M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3',
      check: 'M4 6h16M4 12h10M4 18h7m8-3l2 2 4-4',
      chart: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
      plan: 'M8 4h8m-8 0a2 2 0 00-2 2v14h12V6a2 2 0 00-2-2M9 10h6m-6 4h6m-6 4h3',
      report: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6m-6 4h6',
      gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.4 7.4 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7.3 7.3 0 00-2-1.2L14.5 3h-5l-.4 2.6a7.3 7.3 0 00-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 000 2.4l-2 1.6 2 3.4 2.4-1c.6.5 1.3.9 2 1.2l.4 2.6h5l.4-2.6c.7-.3 1.4-.7 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
      sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
      menu: 'M4 6h16M4 12h16M4 18h16',
      arrow: 'M5 12h14m-6-6l6 6-6 6',
      back: 'M19 12H5m6-6l-6 6 6 6',
    };
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', paths[name] || '');
    svg.appendChild(p);
    return svg;
  };

  /** Page header. Returns the page body element (already appended to host). */
  K.page = function (host, o) {
    const head = el('header', { class: 'page-head' },
      o.back ? el('a', { class: 'back-link', href: o.back.href }, K.icon('back'), o.back.label) : null,
      o.step ? el('div', { class: 'step-chip' }, `Step ${o.step}`) : null,
      el('div', { class: 'page-title-row' },
        el('h1', null, o.title, o.badge || null),
        o.actions ? el('div', { class: 'page-actions' }, o.actions) : null),
      o.lead ? el('p', { class: 'lead' }, o.lead) : null);
    const body = el('div', { class: 'page-body' });
    host.append(head, body);
    return body;
  };

  /** A section card. Returns { el, body }. */
  K.card = function (o) {
    const body = el('div', { class: 'card-body' });
    const card = el('section', { class: 'card ' + (o.cls || ''), id: o.id || null },
      o.title ? el('div', { class: 'card-head' },
        el('div', null, el('h2', null, o.title), o.desc ? el('p', { class: 'card-desc' }, o.desc) : null),
        o.actions ? el('div', { class: 'card-actions' }, o.actions) : null) : null,
      body);
    return { el: card, body };
  };

  K.stats = (items) => el('div', { class: 'stats' }, items.filter(Boolean).map((it) =>
    el('div', { class: 'stat ' + (it.tone || '') },
      el('div', { class: 'stat-label' }, it.label),
      el('div', { class: 'stat-value' }, it.value),
      it.sub ? el('div', { class: 'stat-sub' }, it.sub) : null)));

  K.badge = (rating) => {
    const r = SF.insights.RATINGS[rating] || SF.insights.RATINGS.nodata;
    return el('span', { class: 'badge ' + r.tone }, el('span', { class: 'badge-dot', 'aria-hidden': 'true' }), r.label);
  };

  K.tag = (text, cls) => el('span', { class: 'tag ' + (cls || '') }, text);

  /**
   * Data table.
   *   columns: [{ key, label, num, money, pct, count, format(v,row), cls(v,row) }]
   *   rows:    array of objects
   *   foot:    optional totals object
   *   exportName: adds an "Excel" download button
   */
  K.table = function (o) {
    const fmt = (c, v, row) => {
      if (c.format) return c.format(v, row);
      if (v == null || v === '') return '–';
      if (c.money) return K.money(v);
      if (c.pct) return U.fmtPct(v);
      if (c.count) return U.fmtNum(v, c.digits || 0);
      return v;
    };
    const numeric = (c) => c.num || c.money || c.pct || c.count;
    const cell = (tag, c, v, row) => el(tag, { class: [numeric(c) ? 'num' : '', c.cls ? c.cls(v, row) : ''].join(' ').trim() || null, scope: tag === 'th' ? 'row' : null }, fmt(c, v, row));
    const table = el('table', { class: 'data ' + (o.cls || '') },
      el('thead', null, el('tr', null, o.columns.map((c) => el('th', { class: numeric(c) ? 'num' : null, scope: 'col' }, c.label)))),
      el('tbody', null, o.rows.map((row) => el('tr', { class: row._cls || null, onclick: row._onClick || null, tabindex: row._onClick ? 0 : null,
        onkeydown: row._onClick ? (e) => { if (e.key === 'Enter') row._onClick(); } : null },
      o.columns.map((c, i) => cell(i === 0 ? 'th' : 'td', c, row[c.key], row))))),
      o.foot ? el('tfoot', null, el('tr', { class: 'total' }, o.columns.map((c, i) => cell(i === 0 ? 'th' : 'td', c, o.foot[c.key], o.foot)))) : null);
    const wrap = el('div', { class: 'table-block' },
      el('div', { class: 'table-scroll' + (o.tall ? ' tall' : '') }, table));
    if (o.exportName) {
      wrap.prepend(el('div', { class: 'table-tools' },
        o.caption ? el('span', { class: 'muted small' }, o.caption) : el('span'),
        el('button', { class: 'btn ghost small', onclick: () => K.exportTable(o) }, 'Download as Excel')));
    }
    return wrap;
  };

  K.exportTable = async function (o) {
    const X = SF.excel;
    const wb = X.newWorkbook();
    const ws = wb.addWorksheet(String(o.exportName).slice(0, 30).replace(/[\\/?*[\]:]/g, ' '));
    const cols = o.columns.map((c) => ({ header: c.label, key: c.key, width: Math.max(12, String(c.label).length + 2), money: c.money, pct: c.pct }));
    const plain = (row) => Object.fromEntries(o.columns.map((c) => {
      let v = row[c.key];
      if (c.exportValue) v = c.exportValue(v, row);
      else if (v != null && typeof v === 'object') v = String(v);
      if (typeof v === 'number') v = Math.round(v * 10000) / 10000;
      return [c.key, v == null ? null : v];
    }));
    const rows = (o.exportRows || o.rows).map(plain);
    if (o.foot) rows.push({ ...plain(o.foot), _bold: true });
    X.addTable(ws, 1, cols, rows, K.sym());
    ws.getColumn(1).width = 28;
    await X.saveWorkbook(wb, U.safeFilename(o.exportName) + '.xlsx');
  };

  // Remembers Chart/Table choice per card while the app is open.
  const viewChoice = new Map();

  /**
   * Card with a chart and a Chart/Table switch.
   *   { id, title, desc, draw(container), table() -> element, note }
   */
  K.chartCard = function (o) {
    const c = K.card({ title: o.title, desc: o.desc, id: o.id, cls: 'chart-card' });
    const chartHost = el('div', { class: 'chart-host' });
    const tableHost = el('div', { class: 'table-host' });
    const choice = viewChoice.get(o.id) || 'chart';
    const setView = (v) => {
      viewChoice.set(o.id, v);
      chartHost.hidden = v !== 'chart';
      tableHost.hidden = v !== 'table';
      seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === v ? 'true' : 'false'));
      if (v === 'table' && !tableHost.firstChild && o.table) tableHost.appendChild(o.table());
      if (v === 'chart' && !chartHost.dataset.drawn) { chartHost.dataset.drawn = '1'; o.draw(chartHost); }
    };
    const seg = el('div', { class: 'segmented small', role: 'group', 'aria-label': 'Show as' },
      el('button', { 'data-v': 'chart', onclick: () => setView('chart') }, 'Chart'),
      o.table ? el('button', { 'data-v': 'table', onclick: () => setView('table') }, 'Table') : null);
    c.el.querySelector('.card-head')?.appendChild(el('div', { class: 'card-actions' }, seg));
    c.body.append(chartHost, tableHost, o.note ? el('p', { class: 'hint chart-note' }, o.note) : null);
    chartHost.hidden = choice !== 'chart';
    tableHost.hidden = choice !== 'table';
    K.defer(() => setView(choice));
    return c.el;
  };

  K.segmented = function (options, value, onChange, label) {
    return el('div', { class: 'segmented', role: 'group', 'aria-label': label || '' },
      options.map((o) => el('button', { 'aria-pressed': o.key === value ? 'true' : 'false', disabled: o.disabled || null, title: o.title || null, onclick: () => onChange(o.key) }, o.label)));
  };

  /** Financial-year + time-grouping filter bar. */
  K.filterBar = function (o) {
    const st = SF.app.state;
    const fys = SF.app.fys();
    return el('div', { class: 'filter-bar', role: 'region', 'aria-label': 'Filters' },
      el('label', { class: 'filter' }, el('span', null, 'Financial year'),
        el('select', { onchange: (e) => { st.fy = e.target.value; SF.app.render(); } },
          fys.slice().reverse().map((f) => el('option', { value: f, selected: st.fy === f }, f)),
          o.allowAll !== false ? el('option', { value: 'all', selected: st.fy === 'all' }, 'All years') : null)),
      o.gran !== false ? el('div', { class: 'filter' }, el('span', null, 'Group by'),
        K.segmented(SF.master.GRANS, st.gran, (g) => { st.gran = g; SF.app.render(); }, 'Group by')) : null,
      o.extra || null);
  };

  K.insightList = (items) => el('ul', { class: 'insights' }, items.map((f) => el('li', { class: f.tone || 'info' },
    el('span', { class: 'finding-icon', 'aria-hidden': 'true' }, f.tone === 'good' ? '✓' : f.tone === 'bad' ? '!' : 'i'),
    el('div', null,
      f.title ? el('strong', { class: 'insight-title' }, f.title) : null,
      el('span', { class: 'visually-hidden' }, f.tone === 'good' ? ' (good) ' : f.tone === 'bad' ? ' (watch) ' : ' '),
      el('span', null, f.text)))));

  K.recList = (recs) => el('ul', { class: 'recs' }, recs.map((r) => el('li', null, el('span', { class: 'rec-area' }, r.area), el('span', null, r.text))));

  K.empty = (o) => el('div', { class: 'empty-state' },
    el('h2', null, o.title), el('p', null, o.text), o.action ? el('a', { class: 'btn primary', href: o.action.href }, o.action.label) : null);

  K.next = (o) => el('nav', { class: 'next-step', 'aria-label': 'Next step' },
    o.prev ? el('a', { class: 'btn ghost', href: o.prev.href }, K.icon('back'), o.prev.label) : el('span'),
    el('a', { class: 'btn primary', href: o.href }, o.label, K.icon('arrow')));

  /** Change vs previous value, with arrow + sign so it is never colour-only. */
  K.delta = (cur, prev, goodWhenUp, fmt) => {
    if (prev == null || cur == null || !isFinite(prev) || !isFinite(cur) || Math.abs(cur - prev) < 1e-9) return el('span', { class: 'delta muted' }, '–');
    const d = cur - prev;
    const good = goodWhenUp == null ? null : goodWhenUp ? d > 0 : d < 0;
    return el('span', { class: 'delta ' + (good == null ? '' : good ? 'good' : 'bad') }, (d > 0 ? '▲ ' : '▼ ') + (fmt ? fmt(d) : U.fmtNum(d)));
  };

  K.colors = {
    memberships: '--c-memberships', tickets: '--c-tickets', otherIncome: '--c-other',
    expenses: '--c-expenses', hires: '--c-hires', income: '--c-income', expense: '--c-spending',
  };
})(typeof window !== 'undefined' ? window : globalThis);
