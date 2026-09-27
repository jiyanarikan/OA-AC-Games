/*
 * Reading .xlsx / .csv into plain row arrays, and writing workbooks.
 * Uses the bundled ExcelJS (lib/exceljs.min.js) so it works offline.
 */
(function (root) {
  const SF = (root.SF = root.SF || {});
  const X = (SF.excel = {});

  /** ExcelJS cell value -> plain JS value (string | number | Date | boolean | null). */
  function plain(v) {
    if (v === null || v === undefined) return null;
    if (v instanceof Date || typeof v !== 'object') return v;
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if ('result' in v) return plain(v.result);
    if ('formula' in v || 'sharedFormula' in v) return null;
    if ('text' in v) return plain(v.text);
    if ('error' in v) return null;
    return String(v);
  }

  /** Simple RFC4180-ish CSV parser with delimiter sniffing. */
  X.parseCSV = function (text) {
    text = text.replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const delim = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
        } else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    // Cells stay as text (keeps leading zeros in IDs); the cleaner parses numbers.
    return rows.map((r) => r.map((c) => (c.trim() === '' ? null : c)));
  };

  /**
   * Read a File. Resolves to [{ name, rows }] - one entry per worksheet.
   */
  X.readFile = async function (file) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.csv') || name.endsWith('.txt')) {
      return [{ name: file.name.replace(/\.[^.]+$/, ''), rows: X.parseCSV(await file.text()) }];
    }
    if (name.endsWith('.xls')) {
      throw new Error('This is an old-style .xls file. Open it in Excel or Google Sheets and save it as .xlsx (or .csv), then upload again.');
    }
    if (!root.ExcelJS) throw new Error('The Excel reader did not load (lib/exceljs.min.js is missing).');
    const wb = new root.ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const sheets = [];
    wb.eachSheet((ws) => {
      const rows = [];
      ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
        const vals = [];
        row.eachCell({ includeEmpty: true }, (cell, col) => { vals[col - 1] = plain(cell.value); });
        for (let i = 0; i < vals.length; i++) if (vals[i] === undefined) vals[i] = null;
        rows[rowNumber - 1] = vals;
      });
      for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
      sheets.push({ name: ws.name, rows });
    });
    return sheets;
  };

  // ---------- writing ----------

  const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF6' } };

  X.moneyFmt = (sym) => `"${sym}"#,##0.00;[Red]-"${sym}"#,##0.00`;

  /**
   * Add a styled table to a worksheet.
   *   columns: [{ header, key, width, money, pct }]
   *   rows:    array of objects; a value may be { formula, result }
   */
  X.addTable = function (ws, startRow, columns, rows, sym, title) {
    let r = startRow;
    if (title) {
      ws.getCell(r, 1).value = title;
      ws.getCell(r, 1).font = { bold: true, size: 12 };
      r++;
    }
    const head = ws.getRow(r);
    columns.forEach((c, i) => {
      const cell = head.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true };
      cell.fill = HEAD_FILL;
      cell.border = { bottom: { style: 'thin' } };
      if (c.width) ws.getColumn(i + 1).width = Math.max(ws.getColumn(i + 1).width || 0, c.width);
    });
    r++;
    for (const obj of rows) {
      const row = ws.getRow(r);
      columns.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        const v = obj[c.key];
        cell.value = v === undefined ? null : v;
        if (c.money) cell.numFmt = X.moneyFmt(sym);
        if (c.pct) cell.numFmt = '0.0%';
        if (obj._bold) cell.font = { bold: true };
      });
      r++;
    }
    return r; // next free row
  };

  X.newWorkbook = function () {
    const wb = new root.ExcelJS.Workbook();
    wb.creator = 'Society Finance';
    wb.created = new Date();
    return wb;
  };

  X.saveWorkbook = async function (wb, filename) {
    const buf = await wb.xlsx.writeBuffer();
    SF.util.download(filename, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  };
})(typeof window !== 'undefined' ? window : globalThis);
