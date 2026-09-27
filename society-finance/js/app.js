/* App shell: sidebar steps, routing, shared filter state, model cache, settings, toasts. */
(function (root) {
  const SF = (root.SF = root.SF || {});
  const U = SF.util, S = SF.store, M = SF.master;
  const el = U.el;

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const app = (SF.app = SF.app || {});
  app.state = { fy: null, gran: 'month' };

  // ---------- model cache ----------
  const cache = new Map();
  let cacheVersion = -1;
  app.model = (fy) => {
    if (cacheVersion !== S.version) { cache.clear(); cacheVersion = S.version; }
    const k = fy || app.state.fy || 'all';
    if (!cache.has(k)) cache.set(k, M.build(S.data, k));
    return cache.get(k);
  };
  app.fys = () => app.model('all').fys;
  app.hasData = () => SF.categoryKeys.some((k) => S.data.records[k].length);
  function ensureFy() {
    const fys = app.fys();
    if (!fys.length) { app.state.fy = null; return; } // pick the latest year once data arrives
    if (app.state.fy !== 'all' && !fys.includes(app.state.fy)) app.state.fy = fys[fys.length - 1];
  }

  // ---------- toasts ----------
  let toastTimer = null;
  app.toast = function (msg, isError) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = 'toast'), msg.length > 90 ? 9000 : 5000);
  };

  // ---------- navigation ----------
  const NAV = [
    { step: 1, href: '#/add', label: 'Add data', icon: 'upload', match: /^add/ },
    { step: 2, href: '#/data', label: 'Check data', icon: 'check', match: /^data/ },
    { step: 3, href: '#/analyse', label: 'Analyse', icon: 'chart', match: /^(analyse|events)/, children: [
      { href: '#/analyse/overview', label: 'Overview', match: /^analyse\/overview/ },
      { href: '#/events', label: 'Events', match: /^events/ },
      { href: '#/analyse/income', label: 'Income', match: /^analyse\/income/ },
      { href: '#/analyse/spending', label: 'Spending', match: /^analyse\/spending/ },
      { href: '#/analyse/cash', label: 'Cash flow & balance', match: /^analyse\/cash/ },
      { href: '#/analyse/memberships', label: 'Memberships', match: /^analyse\/memberships/ },
      { href: '#/analyse/coaching', label: 'Coaching & hires', match: /^analyse\/coaching/ },
      { href: '#/analyse/compare', label: 'Compare years', match: /^analyse\/compare/ },
    ] },
    { step: 4, href: '#/plan', label: 'Plan', icon: 'plan', match: /^plan/, children: [
      { href: '#/plan/event', label: 'Event budget', match: /^plan\/event/ },
      { href: '#/plan/membership', label: 'Membership price', match: /^plan\/membership/ },
      { href: '#/plan/budget', label: 'Next year’s budget', match: /^plan\/budget/ },
    ] },
    { step: 5, href: '#/report', label: 'Report', icon: 'report', match: /^report/ },
  ];

  const route = () => (location.hash || '').replace(/^#\/?/, '');

  function renderNav() {
    const r = route();
    const nav = U.clear(document.getElementById('steps'));
    const hasData = app.hasData();
    for (const item of NAV) {
      const active = item.match.test(r);
      const done = (item.step === 1 && hasData);
      nav.appendChild(el('li', { class: 'step' + (active ? ' active' : '') },
        el('a', { href: item.href, 'aria-current': active && !item.children?.some((c) => c.match.test(r)) ? 'page' : null },
          el('span', { class: 'step-num' + (done ? ' done' : '') }, done ? '✓' : String(item.step)),
          el('span', { class: 'step-label' }, item.label)),
        item.children && active ? el('ul', { class: 'substeps' }, item.children.map((c) => el('li', null,
          el('a', { href: c.href, class: c.match.test(r) ? 'active' : null, 'aria-current': c.match.test(r) ? 'page' : null }, c.label)))) : null));
    }
    const settingsLink = document.getElementById('settings-link');
    settingsLink.classList.toggle('active', /^settings/.test(r));
    document.getElementById('society-name').textContent = S.data.settings.societyName || 'Your society';
  }

  // ---------- pages ----------
  function pageFor(r) {
    const P = SF.pages;
    const [a, b] = r.split('/');
    if (a === 'add') return P.add;
    if (a === 'data') return P.data;
    if (a === 'analyse') return ({ overview: P.overview, income: P.income, spending: P.spending, cash: P.cash, memberships: P.memberships, coaching: P.coaching, compare: P.compare })[b] || P.analyse;
    if (a === 'events') return b ? (h) => P.event(h, decodeURIComponent(r.slice('events/'.length))) : P.events;
    if (a === 'plan') return ({ event: P.planEvent, membership: P.planMembership, budget: P.planBudget })[b] || P.plan;
    if (a === 'report') return P.report;
    if (a === 'settings') return settingsPage;
    return app.hasData() ? P.analyse : P.add;
  }

  let lastRoute = null;
  app.render = function () {
    ensureFy();
    const r = route();
    renderNav();
    const main = document.getElementById('main');
    const keepScroll = r === lastRoute ? window.scrollY : 0;
    U.clear(main);
    try {
      pageFor(r)(main);
      SF.kit.flush();
    } catch (err) {
      console.error(err);
      main.appendChild(el('div', { class: 'card error-card' }, el('h2', null, 'Something went wrong on this page'), el('p', null, String(err.message || err)),
        el('p', { class: 'hint' }, 'Your data is safe. Try another page, or download a backup from Settings.')));
    }
    document.body.classList.remove('nav-open');
    if (r !== lastRoute) { window.scrollTo(0, 0); main.focus({ preventScroll: true }); } else window.scrollTo(0, keepScroll);
    lastRoute = r;
  };

  // ---------- settings ----------
  function settingsPage(host) {
    const K = SF.kit;
    const st = S.data.settings;
    const body = K.page(host, { title: 'Settings', lead: 'Society details, your data, and the optional Claude connection.' });

    const soc = K.card({ title: 'Society' });
    soc.body.append(el('div', { class: 'grid-3' },
      el('label', { class: 'field' }, 'Society name', el('input', { value: st.societyName, placeholder: 'e.g. Hockey Society', onchange: (e) => { st.societyName = e.target.value; S.save(); renderNav(); } })),
      el('label', { class: 'field' }, 'Currency symbol', el('input', { value: st.currency, maxlength: 3, onchange: (e) => { st.currency = e.target.value || '£'; S.save(); } })),
      el('label', { class: 'field' }, 'Financial year starts in',
        el('select', { onchange: (e) => {
          st.fyStartMonth = +e.target.value;
          for (const k of SF.categoryKeys) for (const r of S.data.records[k]) r.fy = U.fyLabel(r.date, st.fyStartMonth);
          app.state.fy = null;
          S.save();
          app.toast('Financial years recalculated.');
        } }, MONTHS.map((m, i) => el('option', { value: i + 1, selected: st.fyStartMonth === i + 1 }, m)))),
      el('label', { class: 'field' }, 'Opening bank balance', el('input', { type: 'number', step: 'any', value: st.openingBalance ?? '', placeholder: 'optional',
        onchange: (e) => { st.openingBalance = e.target.value === '' ? null : +e.target.value; S.save(); } }),
      el('span', { class: 'hint' }, 'The balance at the start of your earliest records. Used for the cash flow page.'))));
    body.append(soc.el);

    const ai = K.card({ title: 'Claude (optional)', desc: 'To have Claude write summaries inside the tool, paste an Anthropic API key. It is kept in this browser only and is never included in backups. Usage is billed to that key’s account. Without a key, use “Copy for Claude.ai” on any summary card instead.' });
    const keyInput = el('input', { type: 'password', value: SF.ai.getKey(), placeholder: 'sk-ant-…', autocomplete: 'off', 'aria-label': 'Anthropic API key' });
    ai.body.append(el('div', { class: 'row wrap' },
      el('label', { class: 'field grow' }, 'Anthropic API key', keyInput),
      el('button', { class: 'btn', onclick: () => { SF.ai.setKey(keyInput.value); app.toast(keyInput.value ? 'Key saved in this browser.' : 'Key removed.'); } }, 'Save key'),
      el('button', { class: 'btn ghost', onclick: () => { SF.ai.setKey(''); keyInput.value = ''; app.toast('Key removed.'); } }, 'Remove')));
    body.append(ai.el);

    const data = K.card({ title: 'Your data', desc: 'Everything is saved in this browser only; nothing is uploaded. Download a backup to keep a copy, move to another computer, or hand over to next year’s committee.' });
    const restoreInput = el('input', { type: 'file', accept: '.json,application/json', class: 'visually-hidden', id: 'restore-input',
      onchange: async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          const d = JSON.parse(await f.text());
          if (!d.records) throw new Error('not a backup');
          if (!confirm('Replace everything in this browser with the backup?')) return;
          S.replace(d);
          app.toast('Backup restored.');
          app.render();
        } catch (err) {
          app.toast('That file is not a Society Finance backup.', true);
        }
      } });
    data.body.append(el('div', { class: 'row wrap' },
      el('button', { class: 'btn primary', onclick: () => U.download(`society-finance-backup-${new Date().toISOString().slice(0, 10)}.json`, S.backupBlob()) }, 'Download backup'),
      el('label', { class: 'btn', for: 'restore-input' }, 'Restore from backup…'), restoreInput));
    body.append(data.el);

    const demo = K.card({ title: 'Try it out', desc: 'Load two years of made-up data for a sports society: memberships, weekly training with a coach and sign-in sheets, weekly socials, a Winter Ball, a tour, sponsorship and kit costs, all in deliberately messy spreadsheets.' });
    demo.body.append(el('div', { class: 'row wrap' },
      el('button', { class: 'btn', onclick: loadDemo }, 'Load demo data'),
      el('button', { class: 'btn ghost danger', onclick: () => {
        if (!confirm('Delete ALL data, events and plans from this browser? Download a backup first if you need it.')) return;
        S.reset();
        app.state.fy = null;
        app.toast('All data deleted.');
        location.hash = '#/add';
      } }, 'Delete all data')));
    body.append(demo.el);
  }

  function loadDemo() {
    if (app.hasData() && !confirm('Add the demo data alongside your existing data?')) return;
    for (const sh of SF.demo.sheets()) importMatrix(sh.file, sh.sheet, sh.rows, sh.category);
    const ev = SF.demo.event(U.uid);
    S.data.events.push(ev);
    if (!S.data.settings.societyName) S.data.settings.societyName = 'Demo Hockey Society';
    if (S.data.settings.openingBalance == null) S.data.settings.openingBalance = 1200;
    S.data.eventMeta = { ...SF.demo.meta(), ...S.data.eventMeta };
    app.state.fy = null;
    S.save();
    app.toast('Demo data loaded: messy spreadsheets cleaned into one master dataset.');
    location.hash = '#/analyse';
  }

  /** Save an in-memory sheet straight through the cleaner (demo data). */
  function importMatrix(fileName, sheetName, rows, category) {
    const C = SF.clean;
    const hr = C.detectHeaderRow(rows, category);
    const res = C.cleanSheet(rows, hr, C.autoMap(rows[hr], category), category, { dedupe: SF.categories[category].dedupeDefault, fyStartMonth: S.data.settings.fyStartMonth });
    const importId = U.uid();
    for (const r of res.records) S.data.records[category].push({ ...r, id: U.uid(), importId });
    S.data.imports.unshift({ id: importId, fileName, sheet: sheetName, category, count: res.records.length, at: new Date().toISOString() });
  }

  // ---------- boot ----------
  document.addEventListener('DOMContentLoaded', () => {
    S.load();
    S.onSave((err) => { if (err) app.toast('Could not save: browser storage may be full. Download a backup from Settings.', true); });
    window.addEventListener('hashchange', app.render);
    document.getElementById('menu-btn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
    let lastW = window.innerWidth, t = null;
    window.addEventListener('resize', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (Math.abs(window.innerWidth - lastW) < 40) return;
        lastW = window.innerWidth;
        if (!document.activeElement || !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) app.render();
      }, 200);
    });
    if (!location.hash) location.hash = app.hasData() ? '#/analyse' : '#/add';
    app.render();
  });
})(typeof window !== 'undefined' ? window : globalThis);
