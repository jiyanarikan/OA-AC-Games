/*
 * App state, saved to this browser's localStorage. Backup/restore via JSON so
 * a committee can hand the data over at the end of the year.
 */
(function (root) {
  const SF = (root.SF = root.SF || {});
  const KEY = 'society-finance-v1';

  const blank = () => ({
    version: 1,
    settings: { currency: '£', fyStartMonth: 8, societyName: '' },
    records: Object.fromEntries(SF.categoryKeys.map((k) => [k, []])),
    imports: [], // { id, fileName, sheet, category, count, at }
    events: [],
  });

  function upgrade(d) {
    const b = blank();
    const out = { ...b, ...d, settings: { ...b.settings, ...(d.settings || {}) } };
    out.records = { ...b.records, ...(d.records || {}) };
    out.imports = d.imports || [];
    out.events = (d.events || []).map((e) => ({ tickets: [], plannedCosts: [], actualCosts: [], ...e }));
    return out;
  }

  const listeners = [];
  const S = (SF.store = {
    data: blank(),
    onSave(fn) { listeners.push(fn); },
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) S.data = upgrade(JSON.parse(raw));
      } catch (e) {
        console.warn('Could not load saved data', e);
      }
      return S.data;
    },
    save() {
      try {
        localStorage.setItem(KEY, JSON.stringify(S.data));
        listeners.forEach((fn) => fn(null));
      } catch (e) {
        listeners.forEach((fn) => fn(e));
      }
    },
    replace(d) {
      S.data = upgrade(d);
      S.save();
    },
    reset() {
      S.data = blank();
      S.save();
    },
    backupBlob() {
      return new Blob([JSON.stringify({ app: 'society-finance', exportedAt: new Date().toISOString(), ...S.data }, null, 1)], { type: 'application/json' });
    },
    event(id) { return S.data.events.find((e) => e.id === id); },
  });
})(typeof window !== 'undefined' ? window : globalThis);
