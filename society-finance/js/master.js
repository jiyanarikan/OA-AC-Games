/*
 * Master dataset. Every stored record (memberships, tickets, other income,
 * expenses, coaching/hires, attendance) becomes one list of transactions,
 * and events are detected from it: one-off vs recurring, sessions, attendance,
 * ticket tiers and sales timing. Also the time-period engine (week, month,
 * term, quarter, year) used by every chart and table. Pure - runs under Node.
 */
(function (root) {
  const SF = (root.SF = root.SF || {});
  const U = SF.util;
  const M = (SF.master = {});

  const DAY = 86400000;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  M.STREAMS = [
    { key: 'memberships', label: 'Memberships', kind: 'income' },
    { key: 'tickets', label: 'Ticket sales', kind: 'income' },
    { key: 'otherIncome', label: 'Sponsorship & grants', kind: 'income' },
    { key: 'expenses', label: 'Expenses', kind: 'expense' },
    { key: 'hires', label: 'Coaching & hires', kind: 'expense' },
  ];
  M.streamLabel = (k) => (M.STREAMS.find((s) => s.key === k) || { label: k }).label;

  M.GOALS = {
    fundraiser: { label: 'Fundraiser', hint: 'Meant to make money for the society' },
    breakeven: { label: 'Break even', hint: 'Should roughly pay for itself' },
    service: { label: 'Member benefit', hint: 'Subsidised on purpose, e.g. training or free socials' },
  };

  // ---------- dates ----------

  M.dayNum = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY;
  M.isoFromDay = (n) => new Date(n * DAY).toISOString().slice(0, 10);
  M.daysBetween = (a, b) => M.dayNum(b) - M.dayNum(a);
  const shortYear = (y) => String(y).slice(2);

  // ---------- periods ----------

  M.GRANS = [
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'term', label: 'Term' },
    { key: 'quarter', label: 'Quarter' },
    { key: 'year', label: 'Year' },
  ];

  /** Period for an ISO date: { key, label, sort }. Terms follow the UK academic year. */
  M.period = function (iso, gran, fyStart) {
    const y = +iso.slice(0, 4), m = +iso.slice(5, 7);
    const fs = fyStart || 8;
    switch (gran) {
      case 'week': {
        const dn = M.dayNum(iso);
        const monday = dn - ((new Date(dn * DAY).getUTCDay() + 6) % 7);
        const mi = M.isoFromDay(monday);
        return { key: 'W' + mi, label: `w/c ${+mi.slice(8, 10)} ${MON[+mi.slice(5, 7) - 1]} ${shortYear(mi.slice(0, 4))}`, sort: monday };
      }
      case 'month':
        return { key: iso.slice(0, 7), label: `${MON[m - 1]} ${shortYear(y)}`, sort: y * 12 + m };
      case 'term': {
        const ay = m >= 8 ? y : y - 1;
        const t = m >= 8 ? 1 : m <= 3 ? 2 : 3;
        return { key: `${ay}-T${t}`, label: `${['Autumn', 'Spring', 'Summer'][t - 1]} ${shortYear(ay)}/${shortYear(ay + 1)}`, sort: ay * 3 + t };
      }
      case 'quarter': {
        const sy = m >= fs ? y : y - 1;
        const q = Math.floor(((m - fs + 12) % 12) / 3) + 1;
        const m0 = ((fs - 1 + (q - 1) * 3) % 12);
        const fy = fs === 1 ? String(sy) : `${shortYear(sy)}/${shortYear(sy + 1)}`;
        return { key: `${sy}-Q${q}`, label: `Q${q} ${fy} (${MON[m0]}–${MON[(m0 + 2) % 12]})`, sort: sy * 4 + q };
      }
      default: {
        const fy = U.fyLabel(iso, fs);
        return { key: fy, label: fy, sort: +fy.slice(0, 4) };
      }
    }
  };

  /** Every period between two ISO dates inclusive, in order (no gaps). */
  M.periodRange = function (fromIso, toIso, gran, fyStart) {
    const out = [], seen = new Set();
    const a = M.dayNum(fromIso), b = M.dayNum(toIso);
    const step = gran === 'week' ? 7 : 1;
    const push = (iso) => {
      const p = M.period(iso, gran, fyStart);
      if (!seen.has(p.key)) { seen.add(p.key); out.push(p); }
    };
    for (let d = a; d <= b; d += step) push(M.isoFromDay(d));
    push(toIso);
    return out.sort((x, y) => x.sort - y.sort);
  };

  /** Start and end ISO dates of a financial year label like "2025/26". */
  M.fyBounds = function (fy, fyStart) {
    const fs = fyStart || 8;
    const sy = +fy.slice(0, 4);
    const start = `${sy}-${String(fs).padStart(2, '0')}-01`;
    const endDay = M.dayNum(`${fs === 1 ? sy + 1 : sy + 1}-${String(fs).padStart(2, '0')}-01`) - 1;
    return { start, end: M.isoFromDay(endDay) };
  };

  /**
   * Sum items into periods.
   *   items: [{ date, ... }]
   *   opts:  { gran, fyStart, value(item) -> number, split(item) -> key, seriesOrder: [{key,label}], from, to }
   * Returns { periods, series: [{ key, label, values }], totals }
   */
  M.timeSeries = function (items, opts) {
    const dated = items.filter((i) => i.date);
    const periods = dated.length || (opts.from && opts.to)
      ? M.periodRange(opts.from || dated.reduce((a, i) => (i.date < a ? i.date : a), dated[0].date),
        opts.to || dated.reduce((a, i) => (i.date > a ? i.date : a), dated[0].date), opts.gran, opts.fyStart)
      : [];
    const idx = new Map(periods.map((p, i) => [p.key, i]));
    const series = new Map((opts.seriesOrder || []).map((s) => [s.key, { key: s.key, label: s.label, values: periods.map(() => 0) }]));
    const split = opts.split || (() => 'total');
    for (const it of dated) {
      const i = idx.get(M.period(it.date, opts.gran, opts.fyStart).key);
      if (i === undefined) continue;
      const k = split(it);
      if (!series.has(k)) series.set(k, { key: k, label: k, values: periods.map(() => 0) });
      series.get(k).values[i] += opts.value ? opts.value(it) : 1;
    }
    const list = [...series.values()];
    const totals = periods.map((_, i) => U.sum(list, (s) => s.values[i]));
    return { periods, series: list, totals };
  };

  // ---------- building the master dataset ----------

  function eventKeyFn(aliases) {
    return (name) => {
      if (!name) return null;
      let k = U.norm(name);
      for (let guard = 0; aliases[k] && guard < 10; guard++) k = aliases[k];
      return k || null;
    };
  }

  /** Event key for a raw event name, following merged names. */
  M.resolveKey = (data, name) => eventKeyFn(data.eventAliases || {})(name);

  /** All stored records -> transactions + attendance, optionally for one financial year. */
  M.transactions = function (data) {
    const fs = data.settings.fyStartMonth;
    const keyOf = eventKeyFn(data.eventAliases || {});
    const R = data.records;
    const tx = [];
    const names = new Map(); // eventKey -> Map(rawName -> count)
    const noteName = (k, raw) => {
      if (!k) return;
      if (!names.has(k)) names.set(k, new Map());
      const m = names.get(k);
      m.set(raw, (m.get(raw) || 0) + 1);
    };
    const add = (r, kind, stream, extra) => {
      const eventKey = keyOf(r.event);
      noteName(eventKey, r.event);
      tx.push({
        id: r.id, date: r.date || null, fy: r.date ? U.fyLabel(r.date, fs) : null, kind, stream,
        eventKey, amount: r.amount || 0, qty: 1, detail: null, party: null, costType: null, ...extra,
      });
    };
    for (const r of R.memberships || []) add(r, 'income', 'memberships', { detail: r.type || 'Membership', party: r.name || r.memberId, memberId: r.memberId || r.name || null });
    for (const r of R.ticketSales || []) add(r, 'income', 'tickets', { detail: r.ticketType || 'Ticket', party: r.buyer, qty: r.quantity == null ? 1 : r.quantity, price: r.price });
    for (const r of R.otherIncome || []) add(r, 'income', 'otherIncome', { detail: r.description || r.source || 'Other income', party: r.source });
    for (const r of R.eventCosts || []) add(r, 'expense', 'expenses', { detail: r.item || r.supplier || 'Expense', party: r.supplier, costType: r.costType });
    for (const r of R.externalHires || []) {
      add(r, 'expense', 'hires', {
        detail: [r.provider, r.service].filter(Boolean).join(' – ') || 'Hire', party: r.provider, hours: r.hours, rate: r.rate, costType: 'fixed',
      });
    }
    const attendance = (R.attendance || []).map((r) => {
      const eventKey = keyOf(r.event);
      noteName(eventKey, r.event);
      return { id: r.id, date: r.date, fy: r.date ? U.fyLabel(r.date, fs) : null, eventKey, count: r.count == null ? 1 : r.count, name: r.name, member: r.memberStatus };
    });

    const displayName = new Map();
    for (const [k, m] of names) {
      let best = null, n = -1;
      for (const [raw, c] of m) if (c > n) { best = raw; n = c; }
      displayName.set(k, best);
    }
    const fys = [...new Set(tx.map((t) => t.fy).concat(attendance.map((a) => a.fy)).filter(Boolean))].sort();
    return { tx, attendance, displayName, fys };
  };

  function median(arr) {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }
  M.median = median;

  /** Are these (sorted, distinct) dates a regular schedule? Returns { frequency } or null. */
  M.regularity = function (dates) {
    if (dates.length < 4) return null;
    const gaps = [];
    for (let i = 1; i < dates.length; i++) gaps.push(M.daysBetween(dates[i - 1], dates[i]));
    const med = median(gaps);
    if (med < 5 || med > 35) return null;
    const steady = gaps.filter((g) => g >= med * 0.5 && g <= med * 1.6).length / gaps.length;
    // Four dates must be perfectly regular; with more, allow holiday breaks.
    if (dates.length < 5 ? steady < 1 : steady < 0.6) return null;
    return { frequency: med <= 8 ? 'Weekly' : med <= 16 ? 'Fortnightly' : 'Monthly', medianGap: med };
  };

  const distinctDates = (items) => [...new Set(items.map((i) => i.date).filter(Boolean))].sort();

  /** Nearest session index for a date (mode 'next' prefers the next session on/after it). */
  function sessionIndex(sessions, iso, mode) {
    const d = M.dayNum(iso);
    if (mode === 'next') {
      for (let i = 0; i < sessions.length; i++) if (M.dayNum(sessions[i]) >= d) return i;
      return sessions.length - 1;
    }
    let best = 0, bd = Infinity;
    sessions.forEach((s, i) => {
      const diff = Math.abs(M.dayNum(s) - d);
      if (diff < bd) { bd = diff; best = i; }
    });
    return best;
  }

  function buildEvent(key, name, tx, att, meta) {
    const inc = tx.filter((t) => t.kind === 'income');
    const exp = tx.filter((t) => t.kind === 'expense');
    const tickets = tx.filter((t) => t.stream === 'tickets');
    const ev = {
      key, name, tx, att, meta: meta || {},
      income: U.sum(inc, (t) => t.amount),
      ticketIncome: U.sum(tickets, (t) => t.amount),
      otherIncome: U.sum(tx.filter((t) => t.stream === 'otherIncome'), (t) => t.amount),
      costs: U.sum(exp, (t) => t.amount),
      expenseCosts: U.sum(tx.filter((t) => t.stream === 'expenses'), (t) => t.amount),
      hireCosts: U.sum(tx.filter((t) => t.stream === 'hires'), (t) => t.amount),
      ticketsSold: U.sum(tickets, (t) => t.qty || 0),
      attendanceTotal: U.sum(att, (a) => a.count || 0),
    };
    ev.net = ev.income - ev.costs;

    // ticket tiers
    const tiers = new Map();
    for (const t of tickets) {
      const k = t.detail || 'Ticket';
      const g = tiers.get(k) || { name: k, qty: 0, revenue: 0 };
      g.qty += t.qty || 0;
      g.revenue += t.amount;
      tiers.set(k, g);
    }
    ev.tiers = [...tiers.values()].map((g) => ({ ...g, avgPrice: g.qty ? g.revenue / g.qty : 0 })).sort((a, b) => b.qty - a.qty);
    ev.hasAttendance = att.length > 0;
    ev.attendees = ev.hasAttendance ? ev.attendanceTotal : ev.ticketsSold;
    ev.avgPrice = ev.ticketsSold ? ev.ticketIncome / ev.ticketsSold : null;

    // one-off or recurring?
    const attDates = distinctDates(att);
    const costDates = distinctDates(exp);
    const ticketDates = distinctDates(tickets);
    const allDates = distinctDates([...tx, ...att]);
    let sessions = null, reg = null;
    if (attDates.length >= 2) { reg = M.regularity(attDates); sessions = attDates; }
    if (!reg && (reg = M.regularity(costDates))) sessions = costDates;
    if (!reg && (reg = M.regularity(ticketDates))) sessions = ticketDates;
    const forced = ev.meta.kind;
    ev.detectedKind = reg ? 'recurring' : 'oneoff';
    ev.detectedFrequency = reg ? reg.frequency : null;
    ev.kind = forced === 'recurring' || forced === 'oneoff' ? forced : ev.detectedKind;
    ev.firstDate = allDates[0] || null;
    ev.lastDate = allDates[allDates.length - 1] || null;

    if (ev.kind === 'recurring') {
      if (!reg) sessions = attDates.length ? attDates : costDates.length >= ticketDates.length ? costDates : ticketDates;
      if (!sessions || !sessions.length) sessions = allDates;
      ev.frequency = reg ? reg.frequency : (M.regularity(sessions) || { frequency: 'Irregular' }).frequency;
      const rows = sessions.map((d) => ({ date: d, attendees: 0, income: 0, costs: 0, tickets: 0 }));
      for (const t of tx) {
        if (!t.date) continue;
        const r = rows[sessionIndex(sessions, t.date, t.stream === 'tickets' ? 'next' : 'nearest')];
        if (t.kind === 'income') r.income += t.amount; else r.costs += t.amount;
        if (t.stream === 'tickets') r.tickets += t.qty || 0;
      }
      for (const a of att) if (a.date) rows[sessionIndex(sessions, a.date, 'nearest')].attendees += a.count || 0;
      for (const r of rows) {
        if (!ev.hasAttendance) r.attendees = r.tickets;
        r.net = r.income - r.costs;
      }
      ev.sessions = rows;
      ev.sessionCount = rows.length;
      ev.eventDate = null;
    } else {
      ev.sessionCount = 1;
      ev.frequency = 'One-off';
      ev.eventDate = ev.meta.date || costDates[costDates.length - 1] || attDates[attDates.length - 1] || ev.lastDate;
      // cumulative ticket sales up to the event
      let cum = 0;
      ev.salesCurve = ticketDates.map((d) => {
        cum += U.sum(tickets.filter((t) => t.date === d), (t) => t.qty || 0);
        return { date: d, cumulative: cum, daysBefore: ev.eventDate ? M.daysBetween(d, ev.eventDate) : null };
      });
    }
    ev.perSession = {
      attendees: ev.sessionCount ? ev.attendees / ev.sessionCount : 0,
      income: ev.sessionCount ? ev.income / ev.sessionCount : 0,
      costs: ev.sessionCount ? ev.costs / ev.sessionCount : 0,
      net: ev.sessionCount ? ev.net / ev.sessionCount : 0,
    };
    ev.netPerAttendee = ev.attendees ? ev.net / ev.attendees : null;
    ev.costPerAttendee = ev.attendees ? ev.costs / ev.attendees : null;
    ev.goal = M.GOALS[ev.meta.goal] ? ev.meta.goal : ev.ticketIncome === 0 && ev.costs > 0 ? 'service' : 'breakeven';
    ev.goalGuessed = !M.GOALS[ev.meta.goal];
    ev.capacity = Number(ev.meta.capacity) || null;
    ev.fys = [...new Set(tx.map((t) => t.fy).concat(att.map((a) => a.fy)).filter(Boolean))].sort();

    // costs grouped by item, biggest first
    const lines = new Map();
    for (const t of exp) {
      const k = t.detail || 'Other';
      const g = lines.get(k) || { name: k, stream: t.stream, amount: 0, count: 0, costType: t.costType };
      g.amount += t.amount;
      g.count++;
      lines.set(k, g);
    }
    ev.costLines = [...lines.values()].sort((a, b) => b.amount - a.amount);
    return ev;
  }

  /**
   * The full model, optionally limited to one financial year ('all' = everything).
   * { tx, attendance, events: [...], eventMap, fys, fy, fyStart }
   */
  M.build = function (data, fy) {
    const base = M.transactions(data);
    const pick = (x) => !fy || fy === 'all' || x.fy === fy;
    const tx = base.tx.filter(pick);
    const attendance = base.attendance.filter(pick);
    const byKey = new Map();
    const bucket = (k) => {
      if (!byKey.has(k)) byKey.set(k, { tx: [], att: [] });
      return byKey.get(k);
    };
    for (const t of tx) if (t.eventKey) bucket(t.eventKey).tx.push(t);
    for (const a of attendance) if (a.eventKey) bucket(a.eventKey).att.push(a);
    const metaAll = data.eventMeta || {};
    const events = [...byKey.entries()].map(([k, b]) => buildEvent(k, base.displayName.get(k) || k, b.tx, b.att, metaAll[k]));
    events.sort((a, b) => (a.firstDate || '').localeCompare(b.firstDate || ''));
    return {
      tx, attendance, events, eventMap: new Map(events.map((e) => [e.key, e])),
      fys: base.fys, fy: fy || 'all', fyStart: data.settings.fyStartMonth, allTx: base.tx,
    };
  };

  /** Headline totals for a model. */
  M.summary = function (model) {
    const tx = model.tx;
    const byStream = Object.fromEntries(M.STREAMS.map((s) => [s.key, U.sum(tx.filter((t) => t.stream === s.key), (t) => t.amount)]));
    const income = U.sum(tx.filter((t) => t.kind === 'income'), (t) => t.amount);
    const spending = U.sum(tx.filter((t) => t.kind === 'expense'), (t) => t.amount);
    const mem = tx.filter((t) => t.stream === 'memberships');
    const members = new Set(mem.map((t) => U.norm(t.memberId || t.party || t.id))).size || mem.length;
    const general = tx.filter((t) => t.kind === 'expense' && !t.eventKey);
    const serviceEvents = model.events.filter((e) => e.goal === 'service');
    const memberBenefit = U.sum(serviceEvents, (e) => Math.max(0, -e.net)) + U.sum(general, (t) => t.amount);
    const dates = tx.map((t) => t.date).filter(Boolean).sort();
    return {
      income, spending, net: income - spending, byStream,
      members, membershipIncome: byStream.memberships, avgFee: mem.length ? byStream.memberships / mem.length : null,
      attendees: U.sum(model.events, (e) => e.attendees), events: model.events.length,
      recurring: model.events.filter((e) => e.kind === 'recurring').length,
      generalSpend: U.sum(general, (t) => t.amount),
      memberBenefit, spendPerMember: members ? spending / members : null,
      firstDate: dates[0] || null, lastDate: dates[dates.length - 1] || null,
      records: tx.length + model.attendance.length,
    };
  };

  /** Running bank balance by period (opening balance applies before the earliest record). */
  M.balanceSeries = function (model, gran, openingBalance, from, to) {
    const sorted = model.allTx.filter((t) => t.date).sort((a, b) => a.date.localeCompare(b.date));
    const periodsTs = M.timeSeries(model.tx, {
      gran, fyStart: model.fyStart, from, to,
      split: (t) => t.kind, value: (t) => t.amount,
      seriesOrder: [{ key: 'income', label: 'Income' }, { key: 'expense', label: 'Spending' }],
    });
    const start = periodsTs.periods.length ? (from || model.tx.map((t) => t.date).filter(Boolean).sort()[0]) : null;
    let bal = Number(openingBalance) || 0;
    for (const t of sorted) if (start && t.date < start) bal += t.kind === 'income' ? t.amount : -t.amount;
    const inc = periodsTs.series.find((s) => s.key === 'income').values;
    const exp = periodsTs.series.find((s) => s.key === 'expense').values;
    const opening = bal;
    const balance = periodsTs.periods.map((_, i) => (bal += inc[i] - exp[i]));
    return { periods: periodsTs.periods, income: inc, spending: exp, net: inc.map((v, i) => v - exp[i]), balance, opening };
  };

  /** Date window for a financial-year filter, trimmed to the data. */
  M.window = function (model) {
    const dates = model.tx.map((t) => t.date).concat(model.attendance.map((a) => a.date)).filter(Boolean).sort();
    if (!dates.length) return { from: null, to: null };
    if (model.fy && model.fy !== 'all') {
      const b = M.fyBounds(model.fy, model.fyStart);
      return { from: b.start, to: dates[dates.length - 1] < b.end ? dates[dates.length - 1] : b.end };
    }
    return { from: dates[0], to: dates[dates.length - 1] };
  };
})(typeof window !== 'undefined' ? window : globalThis);
