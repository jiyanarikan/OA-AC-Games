// Bundles index.html + CSS + scripts into one self-contained file,
// dist/society-finance.html, that can be double-clicked or emailed.
// Run with: node tools/build-single.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let html = read('index.html');
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => `<style>\n${read(href)}\n</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  // Keep "</script" inside code from closing the tag early.
  const code = read(src).replace(/<\/script/gi, '<\\/script');
  return `<script>/* ${src} */\n${code}\n</script>`;
});
if (/<(script|link)[^>]+(src|href)="(?!https?:)/.test(html)) throw new Error('Unbundled local reference left in output');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'society-finance.html');
fs.writeFileSync(out, html);
console.log(`wrote ${path.relative(process.cwd(), out)} (${Math.round(html.length / 1024)} KB)`);
