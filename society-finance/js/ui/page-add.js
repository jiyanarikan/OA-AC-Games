/*
 * Step 1 - Add data. Drop any number of spreadsheets; each sheet is queued,
 * its type detected, columns matched and cleaned, and the user confirms
 * before it joins the master dataset.
 */
(function (root) {
  const SF = (root.SF = root.SF || {});
  const U = SF.util, C = SF.clean, S = SF.store, K = SF.kit;
  const el = U.el;

  const colLetter = (i) => {
    let s = '';
    for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    return s;
  };

  const Q = { items: [], idx: 0, reading: '', error: '' };

  function prepare(item, category, guessed) {
    item.category = category;
    item.guessed = !!guessed;
    item.headerRow = C.detectHeaderRow(item.rows, category);
    item.mapping = C.autoMap(item.rows[item.headerRow] || [], category);
    item.dedupe = SF.categories[category].dedupeDefault;
    item.skipExisting = true;
    item.showMapping = SF.categories[category].fields.some((f) => f.required && item.mapping[f.key] < 0);
  }

  async function addFiles(files) {
    Q.error = '';
    for (const file of files) {
      Q.reading = `Reading ${file.name}…`;
      SF.app.render();
      try {
        const sheets = await SF.excel.readFile(file);
        const usable = sheets.filter((sh) => sh.rows.some((r) => r.some((v) => !U.isBlank(v))));
        if (!usable.length) throw new Error(`${file.name} has no data in it.`);
        for (const sh of usable) {
          const item = { fileName: file.name, sheetName: sh.name, rows: sh.rows, multiSheet: usable.length > 1, status: 'pending' };
          prepare(item, C.guessCategory(sh.rows, sh.name, file.name), true);
          Q.items.push(item);
        }
      } catch (e) {
        console.error(e);
        Q.error = (Q.error ? Q.error + ' ' : '') + (e.message || String(e));
      }
    }
    Q.reading = '';
    const firstPending = Q.items.findIndex((i) => i.status === 'pending');
    Q.idx = firstPending >= 0 ? firstPending : Q.idx;
    SF.app.render();
  }

  function clean(item) {
    const res = C.cleanSheet(item.rows, item.headerRow, item.mapping, item.category, {
      dedupe: item.dedupe, fyStartMonth: S.data.settings.fyStartMonth,
    });
    res.skipped = 0;
    if (item.skipExisting) {
      const sub = C.subtractExisting(res.records, S.data.records[item.category], item.category);
      res.records = sub.fresh;
      res.skipped = sub.skipped;
    }
    return res;
  }

  function save(item, res) {
    const importId = U.uid();
    for (const r of res.records) S.data.records[item.category].push({ ...r, id: U.uid(), importId });
    S.data.imports.unshift({ id: importId, fileName: item.fileName, sheet: item.sheetName, category: item.category, count: res.records.length, at: new Date().toISOString() });
    item.status = 'saved';
    item.savedCount = res.records.length;
    S.save();
    advance();
  }

  function advance() {
    const next = Q.items.findIndex((i) => i.status === 'pending');
    Q.idx = next;
    SF.app.render();
    document.getElementById('review-card')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  // ---------- rendering ----------

  function checklist() {
    return el('div', { class: 'type-grid' }, SF.categoryKeys.map((k) => {
      const cat = SF.categories[k];
      const n = S.data.records[k].length;
      const files = [...new Set(S.data.imports.filter((i) => i.category === k).map((i) => i.fileName))];
      return el('div', { class: 'type-tile ' + (n ? 'done' : '') },
        el('div', { class: 'type-status', 'aria-hidden': 'true' }, n ? '✓' : ''),
        el('div', null,
          el('h3', null, cat.short, k === 'memberships' ? el('span', { class: 'tag' }, 'Most useful') : null),
          el('p', { class: 'hint' }, cat.hint),
          el('p', { class: 'type-count ' + (n ? '' : 'muted') }, n ? `${U.fmtNum(n)} records from ${files.slice(0, 2).join(', ')}${files.length > 2 ? '…' : ''}` : 'Not added yet')));
    }));
  }

  function dropzone() {
    const input = el('input', { type: 'file', id: 'file-input', multiple: true, accept: '.xlsx,.xlsm,.csv,.xls', class: 'visually-hidden' });
    input.addEventListener('change', () => { if (input.files.length) addFiles([...input.files]); input.value = ''; });
    const zone = el('label', { class: 'dropzone', for: 'file-input' },
      K.icon('upload'),
      el('strong', null, 'Choose spreadsheets'),
      el('span', { class: 'muted' }, ' or drop them here. You can add several at once.'),
      el('div', { class: 'hint' }, 'Excel (.xlsx) or CSV. Title rows, £ signs, mixed date formats, total rows and inconsistent spellings are all fine.'));
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('over');
      if (e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]);
    });
    return el('div', null, input, zone,
      Q.reading ? el('p', { class: 'status', role: 'status' }, Q.reading) : null,
      Q.error ? el('p', { class: 'status bad', role: 'alert' }, Q.error) : null);
  }

  function queueStrip() {
    if (!Q.items.length) return null;
    return el('ol', { class: 'queue' }, Q.items.map((it, i) => el('li', { class: `q-${it.status}${i === Q.idx ? ' current' : ''}` },
      el('span', { class: 'q-icon', 'aria-hidden': 'true' }, it.status === 'saved' ? '✓' : it.status === 'skipped' ? '–' : String(i + 1)),
      el('span', { class: 'q-name' }, it.fileName + (it.multiSheet ? ` · ${it.sheetName}` : '')),
      el('span', { class: 'q-state muted' }, it.status === 'saved' ? `${it.savedCount} saved` : it.status === 'skipped' ? 'skipped' : i === Q.idx ? 'reviewing' : 'waiting'))));
  }

  function reviewCard(item) {
    const cat = SF.categories[item.category];
    const headers = item.rows[item.headerRow] || [];
    const width = Math.max(headers.length, ...item.rows.slice(item.headerRow, item.headerRow + 30).map((r) => r.length));
    const res = clean(item);
    const rep = res.report;
    const mapped = cat.fields.filter((f) => item.mapping[f.key] >= 0);
    const missingReq = cat.fields.filter((f) => f.required && item.mapping[f.key] < 0);
    const pendingLeft = Q.items.filter((i) => i.status === 'pending').length;
    const pos = Q.items.indexOf(item) + 1;
    const c = K.card({
      id: 'review-card', cls: 'review',
      title: `Review ${pos} of ${Q.items.length}: ${item.fileName}${item.multiSheet ? ` (sheet “${item.sheetName}”)` : ''}`,
      desc: 'Check the tool understood this file, then save it. Nothing is added until you press Save.',
    });

    const sample = (col) => {
      for (let r = item.headerRow + 1; r < Math.min(item.rows.length, item.headerRow + 12); r++) {
        const v = (item.rows[r] || [])[col];
        if (!U.isBlank(v)) return v instanceof Date ? C.parseDate(v) : String(v);
      }
      return '';
    };

    // 1. what is it
    const typeRow = el('div', { class: 'review-step' },
      el('div', { class: 'review-num' }, '1'),
      el('div', { class: 'review-main' },
        el('label', { class: 'field' }, 'This file contains',
          el('select', { onchange: (e) => { prepare(item, e.target.value, false); SF.app.render(); } },
            SF.categoryKeys.map((k) => el('option', { value: k, selected: k === item.category }, SF.categories[k].label + (k === item.category && item.guessed ? ' (detected)' : ''))))),
        el('p', { class: 'hint' }, cat.hint)));

    // 2. columns
    const mapTable = el('div', { class: 'table-scroll' }, el('table', { class: 'data map' },
      el('thead', null, el('tr', null, el('th', null, 'We need'), el('th', null, 'Your column'), el('th', null, 'Example value'))),
      el('tbody', null, cat.fields.map((f) => {
        const sel = el('select', { 'aria-label': `Column for ${f.label}`, onchange: (e) => { item.mapping[f.key] = +e.target.value; SF.app.render(); } },
          el('option', { value: -1 }, f.required ? '— choose a column —' : '— not in this file —'),
          Array.from({ length: width }, (_, col) => el('option', { value: col, selected: item.mapping[f.key] === col },
            `${colLetter(col)}: ${U.isBlank(headers[col]) ? '(no heading)' : String(headers[col]).slice(0, 40)}`)));
        return el('tr', null, el('th', { scope: 'row' }, f.label, f.required ? el('span', { class: 'req' }, ' (required)') : null),
          el('td', null, sel), el('td', { class: 'muted sample' }, item.mapping[f.key] >= 0 ? sample(item.mapping[f.key]) : ''));
      }))));
    const colsRow = el('div', { class: 'review-step' },
      el('div', { class: 'review-num' }, '2'),
      el('div', { class: 'review-main' },
        el('p', { class: 'review-line' },
          missingReq.length ? el('strong', { class: 'bad' }, `Choose a column for: ${missingReq.map((f) => f.label).join(', ')}.`)
            : el('span', null, el('strong', null, `Matched ${mapped.length} of ${cat.fields.length} columns`), ` (headings on row ${item.headerRow + 1}): `, mapped.map((f) => f.label).join(', '), '.'),
          ' ',
          el('button', { class: 'btn link small', 'aria-expanded': item.showMapping ? 'true' : 'false', onclick: () => { item.showMapping = !item.showMapping; SF.app.render(); } }, item.showMapping ? 'Hide column matching' : 'Change')),
        item.showMapping ? el('div', null,
          el('label', { class: 'field narrow' }, 'Headings are on row',
            el('input', { type: 'number', min: 1, max: item.rows.length, value: item.headerRow + 1, onchange: (e) => {
              item.headerRow = Math.max(1, Math.min(item.rows.length, +e.target.value || 1)) - 1;
              item.mapping = C.autoMap(item.rows[item.headerRow] || [], item.category);
              SF.app.render();
            } })),
          mapTable) : null));

    // 3. cleaning
    const fixes = Object.entries(rep.fixes);
    const merges = Object.entries(rep.merges).flatMap(([label, ms]) => ms.map((mg) => `${label}: ${mg.from.map((x) => `“${x}”`).join(', ')} → “${mg.to}”`));
    const cleanRow = el('div', { class: 'review-step' },
      el('div', { class: 'review-num' }, '3'),
      el('div', { class: 'review-main' },
        el('div', { class: 'chips' },
          el('span', { class: 'chip good' }, el('strong', null, U.fmtNum(res.records.length)), ' rows ready'),
          fixes.length ? el('span', { class: 'chip' }, el('strong', null, U.fmtNum(U.sum(fixes, (f) => f[1]))), ' fixes made') : null,
          rep.dropped.length ? el('span', { class: 'chip warn' }, el('strong', null, U.fmtNum(rep.dropped.length)), ' rows left out') : null,
          res.skipped ? el('span', { class: 'chip' }, el('strong', null, U.fmtNum(res.skipped)), ' already stored') : null,
          cat.noMoney ? null : el('span', { class: 'chip' }, 'Total ', el('strong', null, K.money(U.sum(res.records, (r) => r.amount || 0))))),
        el('details', { class: 'clean-details' },
          el('summary', null, 'What was cleaned'),
          el('ul', { class: 'report' },
            fixes.map(([msg, n]) => el('li', { class: 'fix' }, `${msg}: `, el('strong', null, U.fmtNum(n)))),
            merges.map((t) => el('li', { class: 'fix' }, t)),
            rep.dropped.map((d) => el('li', { class: 'drop' }, `Row ${d.row}: ${d.reason}`)),
            rep.warnings.map((w) => el('li', { class: 'warn' }, `Row ${w.row}: ${w.message}`)),
            !fixes.length && !merges.length && !rep.dropped.length ? el('li', null, 'Nothing needed fixing.') : null),
          el('div', { class: 'checks' },
            el('label', null, el('input', { type: 'checkbox', checked: item.dedupe, onchange: (e) => { item.dedupe = e.target.checked; SF.app.render(); } }), ' Remove exact duplicate rows in this file'),
            el('label', null, el('input', { type: 'checkbox', checked: item.skipExisting, onchange: (e) => { item.skipExisting = e.target.checked; SF.app.render(); } }), ' Skip rows that are already stored'))),
        preview(cat, res.records)));

    const saveBtn = el('button', { class: 'btn primary', disabled: !res.records.length || missingReq.length > 0, onclick: () => save(item, res) },
      `Save ${U.fmtNum(res.records.length)} rows as ${cat.short}${pendingLeft > 1 ? ' and continue' : ''}`);
    c.body.append(typeRow, colsRow, cleanRow,
      el('div', { class: 'review-actions' },
        el('button', { class: 'btn ghost', onclick: () => { item.status = 'skipped'; advance(); } }, 'Skip this file'),
        saveBtn));
    return c.el;
  }

  function preview(cat, records) {
    if (!records.length) return el('p', { class: 'muted' }, 'No rows to save.');
    const fields = cat.fields.filter((f) => records.some((r) => r[f.key] != null));
    const fmt = (f, v) => v == null ? '' : f.type === 'money' ? K.money(v) : f.type === 'date' ? U.fmtDate(v) : f.type === 'costType' ? (v === 'fixed' ? 'Fixed' : 'Variable') : f.type === 'number' ? U.fmtNum(v, 2) : v;
    return el('details', { class: 'clean-details' },
      el('summary', null, `Preview the cleaned rows (first ${Math.min(8, records.length)})`),
      el('div', { class: 'table-scroll' }, el('table', { class: 'data compact' },
        el('thead', null, el('tr', null, fields.map((f) => el('th', { class: f.type === 'money' || f.type === 'number' ? 'num' : null }, f.label)))),
        el('tbody', null, records.slice(0, 8).map((r) => el('tr', null, fields.map((f) => el('td', { class: f.type === 'money' || f.type === 'number' ? 'num' : null }, fmt(f, r[f.key])))))))));
  }

  function history() {
    if (!S.data.imports.length) return el('p', { class: 'muted' }, 'Nothing added yet.');
    return el('div', { class: 'table-scroll short' }, el('table', { class: 'data compact' },
      el('thead', null, el('tr', null, el('th', null, 'Added'), el('th', null, 'File'), el('th', null, 'Stored as'), el('th', { class: 'num' }, 'Rows'), el('th', null, el('span', { class: 'visually-hidden' }, 'Undo')))),
      el('tbody', null, S.data.imports.map((imp) => el('tr', null,
        el('td', null, new Date(imp.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })),
        el('td', null, imp.fileName, imp.sheet ? el('span', { class: 'muted' }, ` · ${imp.sheet}`) : null),
        el('td', null, SF.categories[imp.category].short),
        el('td', { class: 'num' }, U.fmtNum(imp.count)),
        el('td', null, el('button', { class: 'btn ghost small', onclick: () => {
          if (!confirm(`Remove the ${imp.count} rows added from ${imp.fileName}?`)) return;
          S.data.records[imp.category] = S.data.records[imp.category].filter((r) => r.importId !== imp.id);
          S.data.imports = S.data.imports.filter((x) => x.id !== imp.id);
          S.save();
          SF.app.render();
        } }, 'Undo')))))));
  }

  SF.pages = SF.pages || {};
  SF.pages.add = function (host) {
    const body = K.page(host, {
      step: 1, title: 'Add your data',
      lead: 'Upload the spreadsheets you already keep. Each one is checked, cleaned and added to one master dataset, which every chart, table and report is built from.',
    });
    const up = K.card({ title: 'Upload spreadsheets', desc: 'Drop in as many files as you like: this year’s and last year’s, one type or all of them. You will review each before it is saved.' });
    up.body.append(dropzone(), queueStrip());
    body.append(up.el);

    const item = Q.idx >= 0 ? Q.items[Q.idx] : null;
    if (item && item.status === 'pending') body.append(reviewCard(item));
    else if (Q.items.length && Q.items.every((i) => i.status !== 'pending')) {
      const saved = Q.items.filter((i) => i.status === 'saved');
      const done = K.card({ cls: 'success', title: 'All files reviewed', desc: `${saved.length} saved, ${Q.items.length - saved.length} skipped. They are now part of your master dataset.` });
      done.body.append(el('div', { class: 'row' },
        el('a', { class: 'btn primary', href: '#/data' }, 'Next: check your data', K.icon('arrow')),
        el('button', { class: 'btn ghost', onclick: () => { Q.items = []; Q.idx = 0; SF.app.render(); } }, 'Clear this list')));
      body.append(done.el);
    }

    const types = K.card({ title: 'What you can add', desc: 'None of these are required, but the more you add, the more the analysis can tell you. Attendance sheets unlock per-person figures for free activities like training.' });
    types.body.append(checklist());
    body.append(types.el);

    const hist = K.card({ title: 'Files added so far', desc: 'Undo removes every row that came from that file.' });
    hist.body.append(history());
    body.append(hist.el);

    if (S.data.imports.length) body.append(K.next({ href: '#/data', label: 'Next: check your data' }));
    else body.append(el('p', { class: 'hint center' }, 'No spreadsheets to hand? Open Settings → Load demo data to explore with a sample society.'));
  };
})(typeof window !== 'undefined' ? window : globalThis);
