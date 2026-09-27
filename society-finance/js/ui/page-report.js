/*
 * Step 5 - Annual report: a printable document built from the master dataset
 * (figures, charts, events, memberships, findings, committee notes), plus an
 * Excel pack of every table.
 */
(function (root) {
  const SF = (root.SF = root.SF || {});
  const U = SF.util, S = SF.store, K = SF.kit, M = SF.master, I = SF.insights, CH = SF.charts;
  const el = U.el;
  SF.pages = SF.pages || {};

  SF.pages.report = function (host) {
    const body = K.page(host, {
      step: 5, title: 'Annual report',
      lead: 'A ready-made financial report for the year, built from your data. Add the committee’s comments, then print it or save it as a PDF, or download every table as Excel.',
      actions: [
        el('button', { class: 'btn', onclick: () => exportPack() }, 'Download Excel pack'),
        el('button', { class: 'btn primary', onclick: () => window.print() }, 'Print / save as PDF'),
      ],
    });
    if (!SF.app.hasData()) return body.append(K.empty({ title: 'No data yet', text: 'Add your spreadsheets to build the report.', action: { href: '#/add', label: 'Add data' } }));
    body.append(K.filterBar({ gran: false, allowAll: false }));
    const model = SF.app.model();
    const s = M.summary(model);
    const fys = SF.app.fys();
    const prevFy = fys[fys.indexOf(model.fy) - 1];
    const ps = prevFy ? M.summary(SF.app.model(prevFy)) : null;
    const ctx = I.context(model, K.sym());
    const name = S.data.settings.societyName || 'Society';
    const doc = el('article', { class: 'report-doc' });
    body.append(doc);

    doc.append(el('header', { class: 'report-cover' },
      el('p', { class: 'report-kicker' }, 'Financial report'),
      el('h1', null, `${name} · ${model.fy}`),
      el('p', { class: 'muted' }, `Covers ${U.fmtDate(M.window(model).from)} – ${U.fmtDate(M.window(model).to)}. Prepared ${new Date().toLocaleDateString('en-GB', { dateStyle: 'long' })}.`)));

    // 1 summary
    const sec = (n, title) => { const x = el('section', { class: 'report-section' }, el('h2', null, `${n}. ${title}`)); doc.append(x); return x; };
    const s1 = sec(1, 'Summary');
    s1.append(K.stats([
      { label: 'Income', value: K.money(s.income, { whole: true }), sub: ps ? `last year ${K.money(ps.income, { whole: true })}` : null },
      { label: 'Spending', value: K.money(s.spending, { whole: true }), sub: ps ? `last year ${K.money(ps.spending, { whole: true })}` : null },
      { label: s.net >= 0 ? 'Surplus' : 'Deficit', value: K.money(Math.abs(s.net), { whole: true }), tone: s.net < 0 ? 'neg' : 'pos' },
      { label: 'Members', value: U.fmtNum(s.members), sub: ps ? `last year ${U.fmtNum(ps.members)}` : null },
    ]));
    const auto = I.society(model, { sym: K.sym(), openingBalance: S.data.settings.openingBalance, allModel: SF.app.model('all'), data: S.data });
    s1.append(el('div', { class: 'report-prose' }, auto.filter((x) => /overall|member|compared/i.test(x.title)).map((x) => el('p', null, el('strong', null, x.title + '. '), x.text))));
    s1.append(SF.ai.card({ scope: 'report', model, compact: true }));

    // 2 income & spending
    const s2 = sec(2, 'Income and spending');
    const streamRows = M.STREAMS.map((x) => ({ item: x.label, kind: x.kind === 'income' ? 'Income' : 'Spending', amount: s.byStream[x.key], prev: ps ? ps.byStream[x.key] : null }));
    s2.append(K.table({
      columns: [{ key: 'item', label: 'Source' }, { key: 'kind', label: 'In / out' }, { key: 'amount', label: model.fy, money: true }].concat(ps ? [{ key: 'prev', label: prevFy, money: true }] : []),
      rows: streamRows.concat([{ item: 'Total income', amount: s.income, prev: ps && ps.income, _cls: 'total' }, { item: 'Total spending', amount: s.spending, prev: ps && ps.spending, _cls: 'total' }, { item: s.net >= 0 ? 'Surplus' : 'Deficit', amount: s.net, prev: ps && ps.net, _cls: 'total' }]),
    }));
    const w = M.window(model);
    const io = M.timeSeries(model.tx, { gran: 'month', fyStart: model.fyStart, from: w.from, to: w.to, split: (t) => t.kind, value: (t) => t.amount, seriesOrder: [{ key: 'income', label: 'Income' }, { key: 'expense', label: 'Spending' }] });
    io.series.forEach((x) => (x.color = K.colors[x.key]));
    const ch = el('div', { class: 'chart-host' });
    s2.append(el('h3', null, 'Month by month'), ch);
    K.defer(() => CH.bars(ch, { labels: io.periods.map((p) => p.label), series: io.series, sym: K.sym(), height: 240, aria: 'Income and spending by month' }));

    // 3 events
    const s3 = sec(3, 'Events and activities');
    if (model.events.length) {
      const rated = model.events.map((e) => ({ e, v: I.rateEvent(e, ctx) }));
      s3.append(K.table({
        columns: [{ key: 'name', label: 'Event' }, { key: 'type', label: 'Type' }, { key: 'purpose', label: 'Purpose' }, { key: 'att', label: 'Attendances', count: true },
          { key: 'income', label: 'Income', money: true }, { key: 'costs', label: 'Costs', money: true }, { key: 'net', label: 'Result', money: true, cls: (v) => (v < 0 ? 'neg-text' : '') },
          { key: 'rating', label: 'Rating', format: (v) => K.badge(v) }],
        rows: rated.map(({ e, v }) => ({ name: e.name, type: e.kind === 'recurring' ? `${e.frequency} (${e.sessionCount})` : 'One-off', purpose: M.GOALS[e.goal].label, att: e.attendees, income: e.income, costs: e.costs, net: e.net, rating: v.rating })),
      }));
      s3.append(el('ul', { class: 'report-list' }, rated.map(({ e, v }) => el('li', null, el('strong', null, e.name + ': '), v.headline, v.recs[0] ? ` Suggestion: ${v.recs[0].text}` : ''))));
    } else s3.append(el('p', { class: 'muted' }, 'No events recorded.'));

    // 4 memberships
    const s4 = sec(4, 'Memberships');
    const mem = model.tx.filter((t) => t.stream === 'memberships');
    if (mem.length) {
      const types = new Map();
      for (const t of mem) { const g = types.get(t.detail) || { n: 0, rev: 0 }; g.n++; g.rev += t.amount; types.set(t.detail, g); }
      s4.append(el('p', null, `${U.fmtNum(s.members)} members paid ${K.money(s.membershipIncome)} in total (average ${K.money(s.avgFee)}), ${U.fmtPct(s.income ? s.membershipIncome / s.income : 0)} of the society’s income.`));
      s4.append(K.table({ columns: [{ key: 'type', label: 'Type' }, { key: 'n', label: 'Members', count: true }, { key: 'price', label: 'Avg price', money: true }, { key: 'rev', label: 'Income', money: true }],
        rows: [...types.entries()].map(([type, g]) => ({ type, n: g.n, price: g.rev / g.n, rev: g.rev })) }));
    } else s4.append(el('p', { class: 'muted' }, 'No membership records for this year.'));

    // 5 findings
    const s5 = sec(5, 'Findings and recommendations');
    s5.append(K.insightList(auto));
    const recs = model.events.flatMap((e) => I.rateEvent(e, ctx).recs.map((r) => ({ ...r, text: `${e.name}: ${r.text}` })));
    if (recs.length) s5.append(el('h3', null, 'Event suggestions'), K.recList(recs.slice(0, 10)));

    // 6 notes
    const s6 = sec(6, 'Committee comments');
    S.data.reportNotes = S.data.reportNotes || {};
    const ta = el('textarea', { class: 'notes-box', rows: 5, placeholder: 'e.g. context the numbers don’t show: a cancelled event, a one-off kit purchase, plans for next year…',
      oninput: (e) => { S.data.reportNotes[model.fy] = e.target.value; S.save(); printNotes.textContent = e.target.value; } }, S.data.reportNotes[model.fy] || '');
    const printNotes = el('div', { class: 'print-only notes-print' }, S.data.reportNotes[model.fy] || '');
    s6.append(ta, printNotes);
  };

  async function exportPack() {
    const X = SF.excel;
    const model = SF.app.model();
    const s = M.summary(model);
    const ctx = I.context(model, K.sym());
    const sy = K.sym();
    const wb = X.newWorkbook();
    const sum = wb.addWorksheet('Summary');
    X.addTable(sum, 1, [{ header: 'Item', key: 'k', width: 34 }, { header: model.fy, key: 'v', width: 16, money: true }],
      M.STREAMS.map((x) => ({ k: `${x.kind === 'income' ? 'Income' : 'Spending'}: ${x.label}`, v: Math.round(s.byStream[x.key] * 100) / 100 }))
        .concat([{ k: 'Total income', v: s.income, _bold: true }, { k: 'Total spending', v: s.spending, _bold: true }, { k: 'Surplus / deficit', v: s.net, _bold: true }]), sy, `${S.data.settings.societyName || 'Society'} ${model.fy}`);
    const w = M.window(model);
    const mon = M.balanceSeries(model, 'month', S.data.settings.openingBalance, w.from, w.to);
    X.addTable(wb.addWorksheet('Monthly'), 1, [{ header: 'Month', key: 'p', width: 12 }, { header: 'Income', key: 'i', money: true, width: 14 }, { header: 'Spending', key: 'o', money: true, width: 14 }, { header: 'Net', key: 'n', money: true, width: 14 }, { header: 'Balance', key: 'b', money: true, width: 14 }],
      mon.periods.map((p, i) => ({ p: p.label, i: mon.income[i], o: mon.spending[i], n: mon.net[i], b: mon.balance[i] })), sy);
    X.addTable(wb.addWorksheet('Events'), 1, [{ header: 'Event', key: 'name', width: 26 }, { header: 'Type', key: 'type', width: 16 }, { header: 'Purpose', key: 'purpose', width: 16 }, { header: 'Sessions', key: 'sessions', width: 10 }, { header: 'Attendances', key: 'att', width: 12 },
      { header: 'Income', key: 'income', money: true, width: 14 }, { header: 'Costs', key: 'costs', money: true, width: 14 }, { header: 'Result', key: 'net', money: true, width: 14 }, { header: 'Rating', key: 'rating', width: 16 }, { header: 'Summary', key: 'headline', width: 60 }],
    model.events.map((e) => { const v = I.rateEvent(e, ctx); return { name: e.name, type: e.kind === 'recurring' ? e.frequency : 'One-off', purpose: M.GOALS[e.goal].label, sessions: e.sessionCount, att: e.attendees, income: e.income, costs: e.costs, net: e.net, rating: v.label, headline: v.headline }; }), sy);
    X.addTable(wb.addWorksheet('Findings'), 1, [{ header: 'Finding', key: 't', width: 28 }, { header: 'Detail', key: 'x', width: 110 }],
      I.society(model, { sym: sy, openingBalance: S.data.settings.openingBalance, allModel: SF.app.model('all'), data: S.data }).map((f) => ({ t: f.title, x: f.text })), sy);
    const md = wb.addWorksheet('Master data');
    X.addTable(md, 1, [{ header: 'Date', key: 'date', width: 12 }, { header: 'In / out', key: 'kind', width: 9 }, { header: 'Source', key: 'stream', width: 18 }, { header: 'Event', key: 'event', width: 22 }, { header: 'Detail', key: 'detail', width: 28 }, { header: 'Qty', key: 'qty', width: 6 }, { header: 'Amount', key: 'amount', money: true, width: 12 }],
      model.tx.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).map((t) => ({ date: t.date, kind: t.kind === 'income' ? 'In' : 'Out', stream: M.streamLabel(t.stream), event: t.eventKey ? (model.eventMap.get(t.eventKey) || {}).name : '', detail: t.detail, qty: t.qty, amount: t.kind === 'income' ? t.amount : -t.amount })), sy);
    await X.saveWorkbook(wb, `${U.safeFilename(S.data.settings.societyName || 'society')}-report-${model.fy.replace('/', '-')}.xlsx`);
  }
})(typeof window !== 'undefined' ? window : globalThis);
