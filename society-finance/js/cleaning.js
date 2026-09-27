/*
 * Cleaning engine: turns a raw sheet (array of rows) into tidy records for a
 * category, with a report of every change made. No DOM - also runs under Node
 * for the tests in /tests.
 */
(function (root) {
  const SF = (root.SF = root.SF || {});
  const U = SF.util;
  const C = (SF.clean = {});

  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

  const pad = (n) => String(n).padStart(2, '0');

  function isoFromParts(y, m, d) {
    if (y < 100) y += 2000;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCMonth() !== m - 1) return null; // 31 Feb etc.
    return y + '-' + pad(m) + '-' + pad(d);
  }

  /** Any cell value -> 'YYYY-MM-DD' or null. UK day-first for ambiguous dd/mm. */
  C.parseDate = function (v) {
    if (U.isBlank(v)) return null;
    if (v instanceof Date) {
      if (isNaN(v)) return null;
      return isoFromParts(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
    }
    if (typeof v === 'number') {
      // Excel serial day (1900 system). 20000 ~ 1954, 80000 ~ 2119.
      if (v > 20000 && v < 80000) {
        const dt = new Date(Math.round((v - 25569) * 86400000));
        return isoFromParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
      }
      return null;
    }
    const s = String(v).trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1').replace(/,/g, ' ');
    let m;
    if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return isoFromParts(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/))) {
      let d = +m[1], mo = +m[2];
      if (mo > 12 && d <= 12) [d, mo] = [mo, d]; // clearly US-style
      return isoFromParts(+m[3], mo, d);
    }
    if ((m = s.match(/^(\d{1,2})[\s-]+([a-z]{3,9})\.?[\s-]+(\d{2}|\d{4})\b/))) {
      const mo = MONTHS[m[2].slice(0, 4)] || MONTHS[m[2].slice(0, 3)];
      return mo ? isoFromParts(+m[3], mo, +m[1]) : null;
    }
    if ((m = s.match(/^(?:[a-z]+\s+)?([a-z]{3,9})\.?\s+(\d{1,2})\s+(\d{4})\b/))) {
      const mo = MONTHS[m[1].slice(0, 4)] || MONTHS[m[1].slice(0, 3)];
      return mo ? isoFromParts(+m[3], mo, +m[2]) : null;
    }
    if ((m = s.match(/^[a-z]+\s+(\d{1,2})\s+([a-z]{3,9})\s+(\d{4})\b/))) {
      // "Sat 12 Oct 2025"
      const mo = MONTHS[m[2].slice(0, 4)] || MONTHS[m[2].slice(0, 3)];
      return mo ? isoFromParts(+m[3], mo, +m[1]) : null;
    }
    return null;
  };

  /** '£1,234.50', '(20.00)', '-£5', 'free', '–' -> number; undefined if unreadable. */
  C.parseMoney = function (v) {
    if (U.isBlank(v)) return null;
    if (typeof v === 'number') return isFinite(v) ? v : undefined;
    let s = String(v).trim().toLowerCase();
    if (/^[-–—]+$/.test(s)) return 0;
    if (/^(free|n\/?a|nil|none)$/.test(s)) return 0;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/gbp|eur|usd|[£$€\s,]/g, '');
    if (/^[-–]/.test(s)) { neg = !neg; s = s.slice(1); }
    if (/-$/.test(s)) { neg = !neg; s = s.slice(0, -1); }
    if (!/^\d+(\.\d+)?$|^\.\d+$/.test(s)) return undefined;
    const n = Number(s);
    return neg ? -n : n;
  };

  C.parseNumber = function (v) {
    if (U.isBlank(v)) return null;
    if (typeof v === 'number') return isFinite(v) ? v : undefined;
    const s = String(v).trim().replace(/,/g, '');
    return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : undefined;
  };

  C.parseText = function (v) {
    if (U.isBlank(v)) return null;
    if (v instanceof Date) return C.parseDate(v);
    return String(v).replace(/\s+/g, ' ').trim();
  };

  C.parseCostType = function (v) {
    if (U.isBlank(v)) return null;
    const s = String(v).trim().toLowerCase();
    if (/^(f|fixed|fix|one[- ]?off|lump)/.test(s)) return 'fixed';
    if (/^(v|var|variable|per[- ]?(head|person|attendee|ticket))/.test(s)) return 'variable';
    return undefined;
  };

  const PARSERS = { date: C.parseDate, money: C.parseMoney, number: C.parseNumber, text: C.parseText, costType: C.parseCostType };

  const cellText = (v) => (v instanceof Date ? C.parseDate(v) || '' : U.isBlank(v) ? '' : String(v).trim());

  /** Score how well a header cell matches a field's synonyms (0 = no match). */
  function matchScore(header, field) {
    const h = U.norm(header);
    if (!h) return 0;
    let best = 0;
    field.syn.forEach((syn, i) => {
      const bonus = (field.syn.length - i) / (field.syn.length * 10); // earlier synonyms win ties
      let s = 0;
      if (h === syn) s = 3;
      else if ((' ' + h + ' ').includes(' ' + syn + ' ')) s = 2;
      else if (h.length >= 3 && (' ' + syn + ' ').includes(' ' + h + ' ')) s = 1;
      if (s) best = Math.max(best, s + bonus);
    });
    return best;
  }

  /** Guess which row holds the column headings (skips title rows, blank rows). */
  C.detectHeaderRow = function (matrix, category) {
    const fields = SF.categories[category].fields;
    let bestRow = -1, bestScore = 0;
    const limit = Math.min(matrix.length, 20);
    for (let r = 0; r < limit; r++) {
      const row = matrix[r] || [];
      const texts = row.filter((v) => typeof v === 'string' && v.trim());
      if (texts.length < 2) continue;
      let score = 0;
      for (const f of fields) {
        if (row.some((v) => typeof v === 'string' && matchScore(v, f) > 0)) score += 1;
      }
      score += texts.length / 100;
      if (score > bestScore) { bestScore = score; bestRow = r; }
    }
    if (bestRow >= 0) return bestRow;
    return Math.max(0, matrix.findIndex((row) => row && row.some((v) => !U.isBlank(v))));
  };

  /** Map each category field to a column index (or -1). Greedy, one column per field. */
  C.autoMap = function (headers, category) {
    const fields = SF.categories[category].fields;
    const cands = [];
    fields.forEach((f) => headers.forEach((h, col) => {
      const s = matchScore(cellText(h), f);
      if (s > 0) cands.push({ key: f.key, col, s });
    }));
    cands.sort((a, b) => b.s - a.s);
    const mapping = {}, usedCols = new Set();
    fields.forEach((f) => (mapping[f.key] = -1));
    for (const c of cands) {
      if (mapping[c.key] !== -1 || usedCols.has(c.col)) continue;
      mapping[c.key] = c.col;
      usedCols.add(c.col);
    }
    return mapping;
  };

  /** Pick the category whose fields best match these headings / names. */
  C.guessCategory = function (matrix, sheetName, fileName) {
    const hint = U.norm(sheetName + ' ' + fileName);
    let best = SF.categoryKeys[0], bestScore = -1;
    for (const key of SF.categoryKeys) {
      const cat = SF.categories[key];
      const hr = C.detectHeaderRow(matrix, key);
      const mapping = C.autoMap(matrix[hr] || [], key);
      let score = 0;
      cat.fields.forEach((f) => { if (mapping[f.key] >= 0) score += f.required ? 1.5 : 1; });
      // distinctive fields
      if (key === 'externalHires' && (mapping.hours >= 0 || mapping.rate >= 0)) score += 1.5;
      if (key === 'ticketSales' && mapping.ticketType >= 0) score += 1;
      if (key === 'eventCosts' && mapping.costType >= 0) score += 1;
      if (key === 'memberships' && mapping.type >= 0 && /member/.test(U.norm((matrix[hr] || []).join(' ')))) score += 1;
      if (cat.keywords.some((k) => hint.includes(k))) score += 3;
      if (score > bestScore) { bestScore = score; best = key; }
    }
    return best;
  };

  const TOTAL_RE = /^(grand\s+)?(sub\s*)?totals?\b|^balance\b|^carried forward/i;

  /**
   * Merge spelling variants of a text field. The most common spelling wins
   * (ties: first seen); an all-lower-case winner is Title Cased.
   */
  function canonicalise(records, key) {
    const groups = new Map();
    for (const r of records) {
      const v = r[key];
      if (v == null) continue;
      const k = v.toLowerCase();
      if (!groups.has(k)) groups.set(k, new Map());
      const g = groups.get(k);
      g.set(v, (g.get(v) || 0) + 1);
    }
    const merges = [];
    const pick = new Map();
    for (const [k, variants] of groups) {
      // Prefer a normally-cased spelling ("Standard") over ALL CAPS or all lower.
      const shouty = (v) => /[a-z]/i.test(v) && (v === v.toUpperCase() || v === v.toLowerCase());
      let winner = null, n = -1;
      for (const [v, c] of variants) if (!shouty(v) && c > n) { winner = v; n = c; }
      if (winner === null) for (const [v, c] of variants) if (c > n) { winner = v; n = c; }
      if (winner === winner.toUpperCase() && /[A-Z]{2}/.test(winner) && winner.length > 3) winner = winner.toLowerCase();
      if (winner === winner.toLowerCase() && /[a-z]/.test(winner)) winner = winner.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
      pick.set(k, winner);
      const others = [...variants.keys()].filter((v) => v !== winner);
      if (others.length) merges.push({ to: winner, from: others });
    }
    let changed = 0;
    for (const r of records) {
      if (r[key] == null) continue;
      const w = pick.get(r[key].toLowerCase());
      if (w !== r[key]) { r[key] = w; changed++; }
    }
    return { merges, changed };
  }

  /** A stable signature of a record's data fields, for duplicate detection. */
  C.signature = function (r, category) {
    return JSON.stringify(SF.categories[category].fields.map((f) => (r[f.key] == null ? null : r[f.key])));
  };

  /**
   * Clean a sheet.
   *   matrix     - array of rows (arrays of raw cell values)
   *   headerRow  - index of the heading row
   *   mapping    - { fieldKey: columnIndex | -1 }
   *   opts       - { dedupe: bool, fyStartMonth: 1-12 }
   * Returns { records, report }.
   */
  C.cleanSheet = function (matrix, headerRow, mapping, category, opts) {
    const cat = SF.categories[category];
    const o = opts || {};
    const report = {
      rowsRead: 0,
      kept: 0,
      blankRows: 0,
      dropped: [],   // { row, reason }
      fixes: {},     // description -> count
      warnings: [],  // { row, message }
      merges: {},    // fieldLabel -> [{to, from}]
    };
    const fix = (msg, n) => (report.fixes[msg] = (report.fixes[msg] || 0) + (n == null ? 1 : n));
    const records = [];

    for (let r = headerRow + 1; r < matrix.length; r++) {
      const row = matrix[r] || [];
      const excelRow = r + 1;
      if (row.every((v) => U.isBlank(v))) { report.blankRows++; continue; }
      report.rowsRead++;

      const firstText = row.find((v) => typeof v === 'string' && v.trim());
      if (firstText && TOTAL_RE.test(firstText.trim())) {
        report.dropped.push({ row: excelRow, reason: 'Looks like a total / summary row' });
        continue;
      }

      const rec = {};
      let dropReason = null;
      for (const f of cat.fields) {
        const col = mapping[f.key];
        const raw = col >= 0 ? row[col] : null;
        const val = PARSERS[f.type](raw);
        if (val === undefined) {
          const shown = cellText(raw);
          if (f.required) { dropReason = `Couldn't read ${f.label.toLowerCase()} "${shown}"`; break; }
          report.warnings.push({ row: excelRow, message: `Ignored unreadable ${f.label.toLowerCase()} "${shown}"` });
          rec[f.key] = null;
          continue;
        }
        rec[f.key] = val;
        if (val !== null) {
          if (f.type === 'money' && typeof raw === 'string') fix('Amounts converted from text (e.g. "£1,200.00")');
          if (f.type === 'number' && typeof raw === 'string') fix('Numbers converted from text');
          if (f.type === 'date' && !(raw instanceof Date)) fix('Dates standardised to one format');
          if (f.type === 'text' && typeof raw === 'string' && raw !== val) fix('Extra spaces trimmed');
          if (f.type === 'costType' && raw !== val) fix('Fixed / variable labels standardised');
        }
      }
      if (dropReason) { report.dropped.push({ row: excelRow, reason: dropReason }); continue; }
      if (cat.derive) cat.derive(rec, fix);
      const missing = cat.fields.find((f) => f.required && rec[f.key] == null);
      if (missing) { report.dropped.push({ row: excelRow, reason: `No ${missing.label.toLowerCase()}` }); continue; }
      rec._row = excelRow;
      records.push(rec);
    }

    for (const f of cat.fields) {
      if (!f.canonical) continue;
      const { merges, changed } = canonicalise(records, f.key);
      if (merges.length) report.merges[f.label] = merges;
      if (changed) fix(`${f.label} spellings merged (rows changed)`, changed);
    }

    let out = records;
    if (o.dedupe) {
      const seen = new Map();
      out = [];
      for (const r of records) {
        const sig = C.signature(r, category);
        if (seen.has(sig)) report.dropped.push({ row: r._row, reason: `Exact duplicate of row ${seen.get(sig)}` });
        else { seen.set(sig, r._row); out.push(r); }
      }
    }

    for (const r of out) r.fy = U.fyLabel(r.date, o.fyStartMonth);
    report.dropped.sort((a, b) => a.row - b.row);
    report.kept = out.length;
    return { records: out, report };
  };

  /**
   * Remove rows already stored (multiset: if a row is stored twice and appears
   * three times in the new batch, one is new). Returns { fresh, skipped }.
   */
  C.subtractExisting = function (incoming, existing, category) {
    const counts = new Map();
    for (const r of existing) {
      const s = C.signature(r, category);
      counts.set(s, (counts.get(s) || 0) + 1);
    }
    const fresh = [];
    let skipped = 0;
    for (const r of incoming) {
      const s = C.signature(r, category);
      const n = counts.get(s) || 0;
      if (n > 0) { counts.set(s, n - 1); skipped++; } else fresh.push(r);
    }
    return { fresh, skipped };
  };
})(typeof window !== 'undefined' ? window : globalThis);
