/* Shared helpers: ids, rounding, formatting, safe DOM building. */
(function (root) {
  const SF = (root.SF = root.SF || {});
  const U = (SF.util = {});

  U.uid = () =>
    Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

  U.round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  U.sum = (arr, fn) => arr.reduce((t, x) => t + (fn ? fn(x) : x), 0);

  U.isBlank = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

  /** Lower-case, strip punctuation, collapse spaces - used for fuzzy name matching. */
  U.norm = (s) =>
    String(s == null ? '' : s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  U.fmtMoney = (n, sym, opts) => {
    if (n === null || n === undefined || !isFinite(n)) return '–';
    const o = opts || {};
    const abs = Math.abs(n);
    const digits = o.whole ? 0 : 2;
    const body = abs.toLocaleString('en-GB', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    const sign = n < 0 ? '−' : o.signed && n > 0 ? '+' : '';
    return sign + (sym == null ? '£' : sym) + body;
  };

  U.fmtNum = (n, digits) => {
    if (n === null || n === undefined || !isFinite(n)) return '–';
    return n.toLocaleString('en-GB', { maximumFractionDigits: digits == null ? 0 : digits });
  };

  U.fmtPct = (n, signed) => {
    if (n === null || n === undefined || !isFinite(n)) return '–';
    const v = Math.round(n * 1000) / 10;
    return (signed && v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1) + '%';
  };

  U.fmtDate = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  };

  /** Financial-year label for an ISO date, e.g. "2025/26" when the year starts in August. */
  U.fyLabel = (iso, startMonth) => {
    if (!iso) return null;
    const y = Number(iso.slice(0, 4));
    const m = Number(iso.slice(5, 7));
    const sm = startMonth || 8;
    if (sm === 1) return String(y);
    const start = m >= sm ? y : y - 1;
    return start + '/' + String(start + 1).slice(2);
  };

  /**
   * Tiny DOM builder. Text always goes in via textContent so imported
   * spreadsheet values can never inject markup.
   *   el('td', {class: 'num', dataset: {k: 1}, onclick: fn}, 'text', childNode)
   */
  U.el = (tag, attrs, ...children) => {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (k === 'style') node.style.cssText = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (k === 'value') node.value = v;
        else if (v === true) node.setAttribute(k, '');
        else node.setAttribute(k, v);
      }
    }
    for (const c of children.flat(Infinity)) {
      if (c === null || c === undefined || c === false) continue;
      node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  };

  // Pages build UI with optional parts (`cond ? node : null`). Native append()
  // would print "null" for those, so skip empty values app-wide.
  if (typeof Element !== 'undefined') {
    for (const proto of [Element.prototype, DocumentFragment.prototype]) {
      for (const name of ['append', 'prepend']) {
        const native = proto[name];
        proto[name] = function (...nodes) {
          return native.apply(this, nodes.flat(Infinity).filter((n) => n !== null && n !== undefined && n !== false));
        };
      }
    }
  }

  U.clear = (node) => {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  };

  U.download = (filename, blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 0);
  };

  U.safeFilename = (s) => String(s || 'export').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'export';
})(typeof window !== 'undefined' ? window : globalThis);
