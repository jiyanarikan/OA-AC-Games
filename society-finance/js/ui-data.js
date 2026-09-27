/*
 * "Data" view: import wizard (read -> map columns -> clean -> save) and the
 * stored records browser.
 */
(function (root) {
  const SF = (root.SF = root.SF || {});
  const U = SF.util, C = SF.clean, S = SF.store;
  const el = U.el;
  const D = (SF.uiData = {});

  const colLetter = (i) => {
    let s = '';
    for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    return s;
  };

  const sym = () => S.data.settings.currency;

  function fmtField(f, v) {
    if (v == null) return '';
    if (f.type === 'money') return U.fmtMoney(v, sym());
    if (f.type === 'date') return U.fmtDate(v);
    if (f.type === 'costType') return v === 'fixed' ? 'Fixed' : 'Variable';
    if (f.type === 'number') return U.fmtNum(v, 2);
    return v;
  }

  // ---------------- import wizard ----------------

  let W = null; // wizard state

  function startWizard(fileName, sheets) {
    const usable = sheets.filter((sh) => sh.rows.some((r) => r.some((v) => !U.isBlank(v))));
    if (!usable.length) throw new Error('That file has no data in it.');
    W = { fileName, sheets: usable, sheetIdx: 0 };
    chooseSheet(0);
  }

  function chooseSheet(i) {
    W.sheetIdx = i;
    const sh = W.sheets[i];
    chooseCategory(C.guessCategory(sh.rows, sh.name, W.fileName), true);
  }

  function chooseCategory(cat, guessed) {
    const sh = W.sheets[W.sheetIdx];
    W.category = cat;
    W.guessed = !!guessed;
    W.headerRow = C.detectHeaderRow(sh.rows, cat);
    W.mapping = C.autoMap(sh.rows[W.headerRow] || [], cat);
    W.dedupe = SF.categories[cat].dedupeDefault;
    W.skipExisting = true;
  }

  function runClean() {
    const sh = W.sheets[W.sheetIdx];
    const res = C.cleanSheet(sh.rows, W.headerRow, W.mapping, W.category, {
      dedupe: W.dedupe,
      fyStartMonth: S.data.settings.fyStartMonth,
    });
    let skipped = 0;
    if (W.skipExisting) {
      const sub = C.subtractExisting(res.records, S.data.records[W.category], W.category);
      res.records = sub.fresh;
      skipped = sub.skipped;
    }
    res.skipped = skipped;
    return res;
  }

  async function handleFile(file) {
    const status = document.getElementById('import-status');
    status.textContent = `Reading ${file.name}…`;
    try {
      const sheets = await SF.excel.readFile(file);
      startWizard(file.name, sheets);
      status.textContent = '';
      renderWizard();
    } catch (e) {
      console.error(e);
      status.textContent = e.message || String(e);
      W = null;
      renderWizard();
    }
  }

  function renderDropzone(host) {
    const input = el('input', { type: 'file', id: 'file-input', accept: '.xlsx,.xlsm,.csv,.xls', class: 'visually-hidden' });
    input.addEventListener('change', () => input.files[0] && handleFile(input.files[0]));
    const zone = el('label', { class: 'dropzone', for: 'file-input' },
      el('strong', null, 'Choose an Excel or CSV file'),
      el('span', { class: 'muted' }, ' or drop it here'),
      el('div', { class: 'hint' }, 'Membership purchases, event costs, coach / external hires, ticket sales. Title rows, £ signs, mixed date formats and total rows are handled.'));
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('over');
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    host.append(input, zone, el('p', { id: 'import-status', class: 'status', role: 'status' }));
  }

  function renderWizard() {
    const host = U.clear(document.getElementById('import-body'));
    if (!W) return renderDropzone(host);

    const sh = W.sheets[W.sheetIdx];
    const cat = SF.categories[W.category];
    const headers = sh.rows[W.headerRow] || [];
    const width = Math.max(headers.length, ...sh.rows.slice(W.headerRow, W.headerRow + 30).map((r) => r.length));

    // Step 2: what is it + column mapping
    const sheetSel = W.sheets.length > 1
      ? el('label', { class: 'field' }, 'Sheet',
        el('select', { onchange: (e) => { chooseSheet(+e.target.value); renderWizard(); } },
          W.sheets.map((x, i) => el('option', { value: i, selected: i === W.sheetIdx }, x.name))))
      : null;
    const catSel = el('label', { class: 'field' }, 'What is this data?',
      el('select', { onchange: (e) => { chooseCategory(e.target.value, false); renderWizard(); } },
        SF.categoryKeys.map((k) => el('option', { value: k, selected: k === W.category }, SF.categories[k].label + (k === W.category && W.guessed ? ' (detected)' : '')))));
    const hdr = el('label', { class: 'field narrow' }, 'Headings on row',
      el('input', { type: 'number', min: 1, max: sh.rows.length, value: W.headerRow + 1,
        onchange: (e) => {
          const v = Math.max(1, Math.min(sh.rows.length, +e.target.value || 1)) - 1;
          W.headerRow = v;
          W.mapping = C.autoMap(sh.rows[v] || [], W.category);
          renderWizard();
        } }));

    const sampleRow = (col) => {
      for (let r = W.headerRow + 1; r < Math.min(sh.rows.length, W.headerRow + 12); r++) {
        const v = (sh.rows[r] || [])[col];
        if (!U.isBlank(v)) return v instanceof Date ? C.parseDate(v) : String(v);
      }
      return '';
    };

    const mapRows = cat.fields.map((f) => {
      const sel = el('select', { 'aria-label': `Column for ${f.label}`, onchange: (e) => { W.mapping[f.key] = +e.target.value; renderWizard(); } },
        el('option', { value: -1 }, f.required ? '— choose a column —' : '— not in this sheet —'),
        Array.from({ length: width }, (_, c) => el('option', { value: c, selected: W.mapping[f.key] === c },
          `${colLetter(c)}: ${U.isBlank(headers[c]) ? '(no heading)' : String(headers[c]).slice(0, 40)}`)));
      const col = W.mapping[f.key];
      return el('tr', null,
        el('th', { scope: 'row' }, f.label, f.required ? el('span', { class: 'req', title: 'Required' }, ' *') : null),
        el('td', null, sel),
        el('td', { class: 'muted sample' }, col >= 0 ? sampleRow(col) : ''));
    });

    const res = runClean();
    const rep = res.report;

    const opts = el('div', { class: 'checks' },
      el('label', null, el('input', { type: 'checkbox', checked: W.dedupe, onchange: (e) => { W.dedupe = e.target.checked; renderWizard(); } }), ' Remove exact duplicate rows in this file'),
      el('label', null, el('input', { type: 'checkbox', checked: W.skipExisting, onchange: (e) => { W.skipExisting = e.target.checked; renderWizard(); } }), ' Skip rows that are already stored'));

    // Report
    const fixes = Object.entries(rep.fixes);
    const reportList = el('ul', { class: 'report' },
      el('li', null, el('strong', null, U.fmtNum(rep.rowsRead)), ' data rows read', rep.blankRows ? ` (${rep.blankRows} blank rows ignored)` : ''),
      fixes.map(([msg, n]) => el('li', { class: 'fix' }, `${msg}: `, el('strong', null, U.fmtNum(n)))),
      Object.entries(rep.merges).map(([label, merges]) => merges.map((mg) =>
        el('li', { class: 'fix' }, `${label}: `, mg.from.map((x) => `"${x}"`).join(', '), ' → ', el('strong', null, `"${mg.to}"`)))),
      rep.dropped.length ? el('li', { class: 'drop' }, el('strong', null, U.fmtNum(rep.dropped.length)), ' rows left out (see below)') : null,
      res.skipped ? el('li', { class: 'drop' }, el('strong', null, U.fmtNum(res.skipped)), ' rows already stored, skipped') : null,
      rep.warnings.length ? el('li', { class: 'warn' }, el('strong', null, U.fmtNum(rep.warnings.length)), ' values ignored (see below)') : null);

    const dropped = rep.dropped.length || rep.warnings.length
      ? el('details', { class: 'dropped' }, el('summary', null, 'Rows left out and values ignored'),
        el('div', { class: 'table-scroll short' }, el('table', null,
          el('thead', null, el('tr', null, el('th', null, 'Row'), el('th', null, 'Why'))),
          el('tbody', null,
            rep.dropped.map((d) => el('tr', null, el('td', { class: 'num' }, d.row), el('td', null, d.reason))),
            rep.warnings.map((w) => el('tr', null, el('td', { class: 'num' }, w.row), el('td', null, w.message)))))))
      : null;

    const shownFields = cat.fields.filter((f) => W.mapping[f.key] >= 0 || res.records.some((r) => r[f.key] != null));
    const preview = el('div', { class: 'table-scroll short' }, el('table', null,
      el('thead', null, el('tr', null, el('th', null, 'Row'), shownFields.map((f) => el('th', { class: f.type === 'money' || f.type === 'number' ? 'num' : null }, f.label)), el('th', null, 'Year'))),
      el('tbody', null, res.records.slice(0, 25).map((r) => el('tr', null,
        el('td', { class: 'num muted' }, r._row),
        shownFields.map((f) => el('td', { class: f.type === 'money' || f.type === 'number' ? 'num' : null }, fmtField(f, r[f.key]))),
        el('td', { class: 'muted' }, r.fy || ''))))));

    const missingReq = cat.fields.filter((f) => f.required && W.mapping[f.key] < 0);
    const total = U.sum(res.records, (r) => r.amount || 0);
    const saveBtn = el('button', { class: 'btn primary', disabled: !res.records.length || missingReq.length > 0, onclick: () => save(res) },
      `Save ${U.fmtNum(res.records.length)} records to ${cat.short}`);

    host.append(
      el('div', { class: 'file-line' }, el('strong', null, W.fileName), el('button', { class: 'btn ghost small', onclick: () => { W = null; renderWizard(); } }, 'Choose a different file')),
      el('div', { class: 'row wrap' }, sheetSel, catSel, hdr),
      el('h3', null, 'Match the columns'),
      el('div', { class: 'table-scroll' }, el('table', { class: 'map' },
        el('thead', null, el('tr', null, el('th', null, 'Field'), el('th', null, 'Column in your sheet'), el('th', null, 'First value'))),
        el('tbody', null, mapRows))),
      missingReq.length ? el('p', { class: 'status bad' }, `Choose a column for: ${missingReq.map((f) => f.label).join(', ')}.`) : null,
      opts,
      el('h3', null, 'Cleaning report'),
      reportList,
      dropped,
      el('h3', null, `Preview (${res.records.length > 25 ? 'first 25 of ' : ''}${U.fmtNum(res.records.length)} rows, total ${U.fmtMoney(total, sym())})`),
      res.records.length ? preview : el('p', { class: 'muted' }, 'Nothing to save yet.'),
      el('div', { class: 'row end' }, el('button', { class: 'btn ghost', onclick: () => { W = null; renderWizard(); } }, 'Cancel'), saveBtn));
  }

  function save(res) {
    const importId = U.uid();
    const store = S.data.records[W.category];
    for (const r of res.records) store.push({ ...r, id: U.uid(), importId });
    S.data.imports.unshift({
      id: importId, fileName: W.fileName, sheet: W.sheets[W.sheetIdx].name, category: W.category,
      count: res.records.length, at: new Date().toISOString(),
    });
    S.save();
    SF.app.toast(`Saved ${res.records.length} records to ${SF.categories[W.category].short}.`);
    browse.category = W.category;
    W = null;
    D.render();
  }

  // ---------------- stored data browser ----------------

  const browse = { category: 'memberships', fy: 'all', q: '' };
  const PAGE = 300;

  function filtered() {
    const cat = SF.categories[browse.category];
    const q = U.norm(browse.q);
    return S.data.records[browse.category]
      .filter((r) => browse.fy === 'all' || r.fy === browse.fy || (browse.fy === 'none' && !r.fy))
      .filter((r) => !q || U.norm(cat.fields.map((f) => r[f.key]).join(' ')).includes(q))
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }

  function renderBrowser() {
    const host = U.clear(document.getElementById('records-body'));
    const catKey = browse.category;
    const cat = SF.categories[catKey];
    const recs = S.data.records[catKey];

    const tabs = el('div', { class: 'tabs', role: 'tablist' }, SF.categoryKeys.map((k) =>
      el('button', { role: 'tab', 'aria-selected': k === catKey ? 'true' : 'false', class: 'tab',
        onclick: () => { browse.category = k; browse.fy = 'all'; renderBrowser(); } },
      SF.categories[k].short, el('span', { class: 'count' }, U.fmtNum(S.data.records[k].length)))));

    const years = [...new Set(recs.map((r) => r.fy).filter(Boolean))].sort().reverse();
    const rows = filtered();

    const controls = el('div', { class: 'row wrap' },
      el('label', { class: 'field narrow' }, 'Financial year',
        el('select', { onchange: (e) => { browse.fy = e.target.value; renderBrowser(); } },
          el('option', { value: 'all' }, 'All years'),
          years.map((y) => el('option', { value: y, selected: browse.fy === y }, y)),
          recs.some((r) => !r.fy) ? el('option', { value: 'none', selected: browse.fy === 'none' }, 'No date') : null)),
      el('label', { class: 'field' }, 'Search',
        el('input', { type: 'search', value: browse.q, placeholder: 'Name, event, type…',
          oninput: (e) => { browse.q = e.target.value; renderTable(); } })),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn', disabled: !rows.length, onclick: exportCategory }, 'Export to Excel'));

    const tableHost = el('div', { id: 'records-table' });
    host.append(tabs, controls, tableHost);
    renderTable();

    function renderTable() {
      const rows = filtered();
      const total = U.sum(rows, (r) => r.amount || 0);
      U.clear(tableHost);
      if (!recs.length) {
        tableHost.append(el('p', { class: 'muted empty' }, `No ${cat.short.toLowerCase()} stored yet. Import a spreadsheet above.`));
        return;
      }
      tableHost.append(
        el('p', { class: 'summary-line' }, el('strong', null, U.fmtNum(rows.length)), ' records · total ', el('strong', null, U.fmtMoney(total, sym()))),
        el('div', { class: 'table-scroll tall' }, el('table', null,
          el('thead', null, el('tr', null, cat.fields.map((f) => el('th', { class: f.type === 'money' || f.type === 'number' ? 'num' : null }, f.label)), el('th', null, 'Year'), el('th', null, el('span', { class: 'visually-hidden' }, 'Actions')))),
          el('tbody', null, rows.slice(0, PAGE).map((r) => el('tr', null,
            cat.fields.map((f) => el('td', { class: f.type === 'money' || f.type === 'number' ? 'num' : null }, fmtField(f, r[f.key]))),
            el('td', { class: 'muted' }, r.fy || ''),
            el('td', null, el('button', { class: 'icon-btn', title: 'Delete record', 'aria-label': 'Delete record',
              onclick: () => { S.data.records[catKey] = S.data.records[catKey].filter((x) => x.id !== r.id); S.save(); renderBrowser(); } }, '×'))))))),
        rows.length > PAGE ? el('p', { class: 'muted' }, `Showing the first ${PAGE}. Filter or export to see the rest.`) : null);
    }
  }

  async function exportCategory() {
    const cat = SF.categories[browse.category];
    const wb = SF.excel.newWorkbook();
    const ws = wb.addWorksheet(cat.short);
    const cols = cat.fields.map((f) => ({ header: f.label, key: f.key, width: f.type === 'text' ? 22 : 14, money: f.type === 'money' }))
      .concat([{ header: 'Financial year', key: 'fy', width: 12 }]);
    const rows = filtered().map((r) => {
      const o = { ...r };
      for (const f of cat.fields) {
        if (f.type === 'date' && r[f.key]) { const [y, m, d] = r[f.key].split('-').map(Number); o[f.key] = new Date(Date.UTC(y, m - 1, d)); }
        if (f.type === 'costType' && r[f.key]) o[f.key] = r[f.key] === 'fixed' ? 'Fixed' : 'Variable';
      }
      return o;
    });
    SF.excel.addTable(ws, 1, cols, rows, sym());
    cat.fields.forEach((f, i) => { if (f.type === 'date') ws.getColumn(i + 1).numFmt = 'dd/mm/yyyy'; });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    await SF.excel.saveWorkbook(wb, `${U.safeFilename(cat.short)}${browse.fy !== 'all' ? '-' + browse.fy.replace('/', '-') : ''}.xlsx`);
  }

  function renderHistory() {
    const host = U.clear(document.getElementById('history-body'));
    if (!S.data.imports.length) {
      host.append(el('p', { class: 'muted empty' }, 'Nothing imported yet.'));
      return;
    }
    host.append(el('div', { class: 'table-scroll short' }, el('table', null,
      el('thead', null, el('tr', null, el('th', null, 'When'), el('th', null, 'File'), el('th', null, 'Stored as'), el('th', { class: 'num' }, 'Records'), el('th', null, el('span', { class: 'visually-hidden' }, 'Actions')))),
      el('tbody', null, S.data.imports.map((imp) => el('tr', null,
        el('td', null, new Date(imp.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })),
        el('td', null, imp.fileName, imp.sheet ? el('span', { class: 'muted' }, ` · ${imp.sheet}`) : null),
        el('td', null, SF.categories[imp.category].short),
        el('td', { class: 'num' }, U.fmtNum(imp.count)),
        el('td', null, el('button', { class: 'btn ghost small', onclick: () => undoImport(imp) }, 'Undo'))))))));
  }

  function undoImport(imp) {
    if (!confirm(`Remove the ${imp.count} records imported from ${imp.fileName}?`)) return;
    S.data.records[imp.category] = S.data.records[imp.category].filter((r) => r.importId !== imp.id);
    S.data.imports = S.data.imports.filter((x) => x.id !== imp.id);
    S.save();
    D.render();
  }

  D.render = function () {
    renderWizard();
    renderBrowser();
    renderHistory();
  };

  /** Save an in-memory sheet straight through the cleaner (used by demo data). */
  D.importMatrix = function (fileName, sheetName, rows, category) {
    const res = C.cleanSheet(rows, C.detectHeaderRow(rows, category), C.autoMap(rows[C.detectHeaderRow(rows, category)], category), category,
      { dedupe: SF.categories[category].dedupeDefault, fyStartMonth: S.data.settings.fyStartMonth });
    const importId = U.uid();
    for (const r of res.records) S.data.records[category].push({ ...r, id: U.uid(), importId });
    S.data.imports.unshift({ id: importId, fileName, sheet: sheetName, category, count: res.records.length, at: new Date().toISOString() });
  };
})(typeof window !== 'undefined' ? window : globalThis);
