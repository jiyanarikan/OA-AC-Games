// Regenerates the messy example workbooks in /samples from js/demo.js.
// Run with: npm install exceljs && node tools/make-samples.js
const path = require('path');
const ExcelJS = require('exceljs');
require('../js/demo.js');

(async () => {
  for (const sh of globalThis.SF.demo.sheets()) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sh.sheet);
    sh.rows.forEach((row, i) => {
      row.forEach((v, c) => {
        if (v === null || v === undefined) return;
        ws.getCell(i + 1, c + 1).value = typeof v === 'string' && v.startsWith('=') ? { formula: v.slice(1) } : v;
      });
    });
    ws.columns.forEach((col) => (col.width = 18));
    const out = path.join(__dirname, '..', 'samples', sh.file);
    await wb.xlsx.writeFile(out);
    console.log('wrote', path.relative(process.cwd(), out));
  }
})();
