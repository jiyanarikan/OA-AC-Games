// Regenerates the messy example files in /samples from js/demo.js.
// Run with: npm install exceljs && node tools/make-samples.js
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
require('../js/demo.js');

const csvCell = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

(async () => {
  const dir = path.join(__dirname, '..', 'samples');
  for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));
  const byFile = new Map();
  for (const sh of globalThis.SF.demo.sheets()) {
    if (!byFile.has(sh.file)) byFile.set(sh.file, []);
    byFile.get(sh.file).push(sh);
  }
  for (const [file, sheets] of byFile) {
    const out = path.join(dir, file);
    if (file.endsWith('.csv')) {
      fs.writeFileSync(out, sheets[0].rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n');
    } else {
      const wb = new ExcelJS.Workbook();
      for (const sh of sheets) {
        const ws = wb.addWorksheet(sh.sheet);
        sh.rows.forEach((row, i) => row.forEach((v, c) => {
          if (v === null || v === undefined) return;
          ws.getCell(i + 1, c + 1).value = typeof v === 'string' && v.startsWith('=') ? { formula: v.slice(1) } : v;
        }));
        ws.columns.forEach((col) => (col.width = 18));
      }
      await wb.xlsx.writeFile(out);
    }
    console.log('wrote', path.relative(process.cwd(), out));
  }
})();
