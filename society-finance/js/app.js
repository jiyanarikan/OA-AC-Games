/* App shell: navigation, settings, backup/restore, toasts. */
(function (root) {
  const SF = (root.SF = root.SF || {});
  const U = SF.util, S = SF.store;
  const el = U.el;

  const VIEWS = ['events', 'data'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  let toastTimer = null;
  function toast(msg, isError) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = 'toast'), msg.length > 90 ? 9000 : 5000);
  }

  function show(view) {
    if (!VIEWS.includes(view)) view = 'events';
    for (const v of VIEWS) {
      document.getElementById('view-' + v).hidden = v !== view;
      const tab = document.querySelector(`[data-view="${v}"]`);
      tab.setAttribute('aria-current', v === view ? 'page' : 'false');
    }
    if (view === 'data') SF.uiData.render();
    else SF.uiEvents.render();
  }

  function renderAll() {
    document.getElementById('society-name').textContent = S.data.settings.societyName || '';
    show(location.hash.slice(1));
  }

  // ---------- settings ----------

  function openSettings() {
    const dlg = document.getElementById('settings');
    const st = S.data.settings;
    const body = U.clear(dlg.querySelector('.dialog-body'));
    const restoreInput = el('input', { type: 'file', accept: '.json,application/json', class: 'visually-hidden', id: 'restore-input',
      onchange: async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          const d = JSON.parse(await f.text());
          if (!d.records || !d.events) throw new Error('not a backup');
          if (!confirm('Replace everything in this browser with the backup?')) return;
          S.replace(d);
          dlg.close();
          renderAll();
          toast('Backup restored.');
        } catch (err) {
          toast('That file is not a Society Finance backup.', true);
        }
      } });

    body.append(
      el('label', { class: 'field' }, 'Society name',
        el('input', { value: st.societyName, placeholder: 'e.g. Hockey Society', oninput: (e) => { st.societyName = e.target.value; S.save(); document.getElementById('society-name').textContent = st.societyName; } })),
      el('div', { class: 'grid-2' },
        el('label', { class: 'field' }, 'Currency symbol',
          el('input', { value: st.currency, maxlength: 3, oninput: (e) => { st.currency = e.target.value || '£'; S.save(); } })),
        el('label', { class: 'field' }, 'Financial year starts in',
          el('select', { onchange: (e) => {
            st.fyStartMonth = +e.target.value;
            for (const k of SF.categoryKeys) for (const r of S.data.records[k]) r.fy = U.fyLabel(r.date, st.fyStartMonth);
            S.save();
          } }, MONTHS.map((m, i) => el('option', { value: i + 1, selected: st.fyStartMonth === i + 1 }, m))))),
      el('h3', null, 'Your data'),
      el('p', { class: 'hint' }, 'Everything is saved in this browser only - nothing is uploaded. Download a backup to keep a copy or pass it to next year’s committee.'),
      el('div', { class: 'row wrap' },
        el('button', { class: 'btn', onclick: () => U.download(`society-finance-backup-${new Date().toISOString().slice(0, 10)}.json`, S.backupBlob()) }, 'Download backup'),
        el('label', { class: 'btn', for: 'restore-input' }, 'Restore from backup…'), restoreInput),
      el('h3', null, 'Try it out'),
      el('div', { class: 'row wrap' },
        el('button', { class: 'btn', onclick: () => { loadDemo(); dlg.close(); } }, 'Load demo data'),
        el('button', { class: 'btn ghost danger', onclick: () => {
          if (!confirm('Delete ALL imported data and events from this browser? Download a backup first if you need it.')) return;
          S.reset();
          dlg.close();
          renderAll();
          toast('All data deleted.');
        } }, 'Delete all data')));
    dlg.showModal();
  }

  function loadDemo() {
    if ((S.data.events.length || SF.categoryKeys.some((k) => S.data.records[k].length)) && !confirm('Add demo data alongside your existing data?')) return;
    for (const sh of SF.demo.sheets()) SF.uiData.importMatrix(sh.file, sh.sheet, sh.rows, sh.category);
    const ev = SF.demo.event(U.uid);
    S.data.events.push(ev);
    SF.uiEvents.select(ev.id);
    S.save();
    renderAll();
    toast('Demo data loaded: 4 messy spreadsheets cleaned and stored, plus a “Winter Ball” event.');
  }

  // ---------- boot ----------

  SF.app = { toast };

  document.addEventListener('DOMContentLoaded', () => {
    S.load();
    S.onSave((err) => {
      if (err) toast('Could not save - browser storage may be full. Download a backup from Settings.', true);
    });
    for (const a of document.querySelectorAll('[data-view]')) {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        history.replaceState(null, '', '#' + a.dataset.view);
        show(a.dataset.view);
      });
    }
    document.getElementById('open-settings').addEventListener('click', openSettings);
    document.querySelector('#settings .close').addEventListener('click', () => document.getElementById('settings').close());
    window.addEventListener('hashchange', () => show(location.hash.slice(1)));
    renderAll();
  });
})(typeof window !== 'undefined' ? window : globalThis);
