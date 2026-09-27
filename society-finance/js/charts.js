/*
 * Inline SVG charts with hover + keyboard tooltips. Charts are drawn at the
 * container's real pixel width; colours come from CSS custom properties so
 * light/dark themes swap in one place. Every chart sits next to a table view.
 */
(function (root) {
  const SF = (root.SF = root.SF || {});
  const U = SF.util;
  const CH = (SF.charts = {});
  const NS = 'http://www.w3.org/2000/svg';

  function s(tag, attrs, text) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v !== null && v !== undefined) n.setAttribute(k, v);
    if (text !== undefined) n.textContent = text;
    return n;
  }
  CH.svgEl = s;

  function niceStep(range, target) {
    const raw = range / (target || 5);
    const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const f = raw / mag;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  }

  function ticks(min, max, target) {
    if (min === max) max = min + 1;
    const step = niceStep(max - min, target);
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const out = [];
    for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
    return out;
  }
  CH.ticks = ticks;

  const shortMoney = (v, sym) => {
    const a = Math.abs(v);
    const body = a >= 10000 ? (a / 1000).toFixed(a % 1000 === 0 ? 0 : 1) + 'k' : a.toLocaleString('en-GB', { maximumFractionDigits: a < 10 && a % 1 ? 2 : 0 });
    return (v < 0 ? '−' : '') + sym + body;
  };
  const formatter = (format, sym) => ({
    axis: format === 'money' ? (v) => shortMoney(v, sym) : format === 'pct' ? (v) => U.fmtPct(v) : (v) => U.fmtNum(v, 1),
    full: format === 'money' ? (v) => U.fmtMoney(v, sym) : format === 'pct' ? (v) => U.fmtPct(v) : (v) => U.fmtNum(v, 1),
  });

  const widthOf = (container) => Math.max(300, Math.round(container.clientWidth || 640));

  function legend(items) {
    return U.el('div', { class: 'legend' }, items.map((it) =>
      U.el('span', { class: 'legend-item' },
        U.el('span', { class: 'key ' + (it.kind || 'line'), style: `--c: var(${it.color})` }), it.label)));
  }
  CH.legend = legend;

  function tooltip(wrap) {
    const tip = U.el('div', { class: 'tooltip', role: 'status', hidden: true });
    wrap.appendChild(tip);
    return {
      show(x, y, title, rows) {
        U.clear(tip);
        tip.appendChild(U.el('div', { class: 'tip-title' }, title));
        for (const r of rows) {
          tip.appendChild(U.el('div', { class: 'tip-row' + (r.total ? ' total' : '') },
            r.color ? U.el('span', { class: 'key line', style: `--c: var(${r.color})` }) : U.el('span', { class: 'key none' }),
            U.el('strong', null, r.value), U.el('span', { class: 'muted' }, r.label)));
        }
        tip.hidden = false;
        const W = wrap.clientWidth;
        const tw = tip.offsetWidth;
        let left = x + 14;
        if (left + tw > W - 4) left = Math.max(4, x - tw - 14);
        tip.style.left = left + 'px';
        tip.style.top = Math.max(0, y - 10) + 'px';
      },
      hide() { tip.hidden = true; },
    };
  }
  CH.tooltip = tooltip;

  /** Rounded-end bar path (4px radius on the end away from the baseline). */
  function barPath(x, w, y0, y1, round) {
    const up = y1 < y0;
    const h = Math.abs(y1 - y0);
    if (h < 0.5 || w <= 0) return '';
    const r = round === false ? 0 : Math.min(4, h, w / 2);
    if (up) return `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 + r} V${y0} Z`;
    return `M${x},${y0} V${y1 - r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 - r} V${y0} Z`;
  }
  function hbarPath(x0, x1, y, h) {
    const right = x1 > x0;
    const w = Math.abs(x1 - x0);
    if (w < 0.5) return '';
    const r = Math.min(4, w, h / 2);
    if (right) return `M${x0},${y} H${x1 - r} Q${x1},${y} ${x1},${y + r} V${y + h - r} Q${x1},${y + h} ${x1 - r},${y + h} H${x0} Z`;
    return `M${x0},${y} H${x1 + r} Q${x1},${y} ${x1},${y + r} V${y + h - r} Q${x1},${y + h} ${x1 + r},${y + h} H${x0} Z`;
  }

  function frame(container, ariaLabel, legendItems) {
    U.clear(container);
    const wrap = U.el('div', { class: 'chart-wrap' });
    if (legendItems && legendItems.length) wrap.appendChild(legend(legendItems));
    container.appendChild(wrap);
    return wrap;
  }

  function xLabels(svg, labels, X, y, maxLabels, band) {
    const every = Math.max(1, Math.ceil(labels.length / maxLabels));
    labels.forEach((l, i) => {
      if (i % every) return;
      svg.appendChild(s('text', { x: X(i) + band / 2, y, class: 'tick cat', 'text-anchor': 'middle' }, l));
    });
  }

  /**
   * Vertical bars over categories (usually time periods).
   * opts: { labels, series: [{label, color, values}], stacked, format, sym, height, aria, totalLabel }
   */
  CH.bars = function (container, opts) {
    const W = widthOf(container), H = opts.height || 280;
    const m = { l: 60, r: 12, t: 10, b: 34 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const f = formatter(opts.format || 'money', opts.sym || '£');
    const n = opts.labels.length;
    const series = opts.series;
    let lo = 0, hi = 0;
    for (let i = 0; i < n; i++) {
      if (opts.stacked) {
        let pos = 0, neg = 0;
        series.forEach((sr) => { const v = sr.values[i] || 0; if (v >= 0) pos += v; else neg += v; });
        hi = Math.max(hi, pos); lo = Math.min(lo, neg);
      } else series.forEach((sr) => { hi = Math.max(hi, sr.values[i] || 0); lo = Math.min(lo, sr.values[i] || 0); });
    }
    const yt = ticks(lo, hi || 1, 5);
    const yMin = yt[0], yMax = yt[yt.length - 1];
    const Y = (v) => m.t + ih - ((v - yMin) / (yMax - yMin)) * ih;
    const band = iw / Math.max(1, n);
    const X = (i) => m.l + band * i;
    const gap = n > 30 ? 1 : 2;
    const groupW = Math.max(2, Math.min(band * (n > 20 ? 0.8 : 0.66), opts.stacked ? 56 : 30 * series.length));
    const barW = opts.stacked ? groupW : Math.max(1, (groupW - gap * (series.length - 1)) / series.length);

    const wrap = frame(container, opts.aria, series.length > 1 ? series.map((sr) => ({ label: sr.label, color: sr.color, kind: 'box' })) : null);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart', role: 'img', 'aria-label': opts.aria || '' });
    for (const v of yt) {
      svg.appendChild(s('line', { x1: m.l, x2: m.l + iw, y1: Y(v), y2: Y(v), class: v === 0 ? 'axis' : 'grid' }));
      svg.appendChild(s('text', { x: m.l - 8, y: Y(v) + 4, class: 'tick', 'text-anchor': 'end' }, f.axis(v)));
    }
    xLabels(svg, opts.labels, X, m.t + ih + 20, Math.max(2, Math.floor(iw / 72)), band);
    wrap.appendChild(svg);
    const tip = tooltip(wrap);

    for (let i = 0; i < n; i++) {
      const gx = X(i) + (band - groupW) / 2;
      const g = s('g', { class: 'bar', tabindex: 0, 'aria-label': `${opts.labels[i]}: ` + series.map((sr) => `${sr.label} ${f.full(sr.values[i] || 0)}`).join(', ') });
      g.appendChild(s('rect', { x: X(i), y: m.t, width: band, height: ih, fill: 'transparent' }));
      let pos = 0, neg = 0;
      series.forEach((sr, si) => {
        const v = sr.values[i] || 0;
        if (!v) return;
        let x = gx, y0, y1;
        if (opts.stacked) {
          if (v >= 0) { y0 = Y(pos); pos += v; y1 = Y(pos); } else { y0 = Y(neg); neg += v; y1 = Y(neg); }
          // 2px surface gap between stacked segments
          if (si > 0) y0 += v >= 0 ? -1 : 1;
        } else { x = gx + si * (barW + gap); y0 = Y(0); y1 = Y(v); }
        const topMost = opts.stacked ? series.slice(si + 1).every((o) => !(o.values[i]) || Math.sign(o.values[i]) !== Math.sign(v)) : true;
        g.appendChild(s('path', { d: barPath(x, barW, y0, y1, topMost), style: `fill: var(${sr.color})` }));
      });
      const showTip = () => {
        const rows = series.map((sr) => ({ color: sr.color, value: f.full(sr.values[i] || 0), label: sr.label }));
        if (opts.stacked && series.length > 1) rows.push({ value: f.full(U.sum(series, (sr) => sr.values[i] || 0)), label: opts.totalLabel || 'total', total: true });
        const sc = svg.getBoundingClientRect().width / W;
        tip.show((X(i) + band / 2) * sc, Y(Math.max(pos, 0)) * sc, opts.labels[i], rows);
      };
      g.addEventListener('pointerenter', showTip);
      g.addEventListener('focus', showTip);
      g.addEventListener('pointerleave', tip.hide);
      g.addEventListener('blur', tip.hide);
      if (opts.onClick) { g.style.cursor = 'pointer'; g.addEventListener('click', () => opts.onClick(i)); }
      svg.appendChild(g);
    }
  };

  /**
   * Lines over categories with a crosshair tooltip.
   * opts: { labels, series: [{label, color, values, dashed}], format, sym, height, aria, zero }
   */
  CH.lines = function (container, opts) {
    const W = widthOf(container), H = opts.height || 260;
    const m = { l: 60, r: 16, t: 12, b: 34 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const f = formatter(opts.format || 'money', opts.sym || '£');
    const n = opts.labels.length;
    const all = opts.series.flatMap((sr) => sr.values).filter((v) => v != null);
    const yt = ticks(Math.min(0, ...all), Math.max(1, ...all), 5);
    const yMin = yt[0], yMax = yt[yt.length - 1];
    const Y = (v) => m.t + ih - ((v - yMin) / (yMax - yMin)) * ih;
    const X = (i) => m.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);

    const wrap = frame(container, opts.aria, opts.series.length > 1 ? opts.series.map((sr) => ({ label: sr.label, color: sr.color })) : null);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart', role: 'img', tabindex: 0,
      'aria-label': (opts.aria || '') + ' Use the arrow keys to read values.' });
    for (const v of yt) {
      svg.appendChild(s('line', { x1: m.l, x2: m.l + iw, y1: Y(v), y2: Y(v), class: v === 0 ? 'axis' : 'grid' }));
      svg.appendChild(s('text', { x: m.l - 8, y: Y(v) + 4, class: 'tick', 'text-anchor': 'end' }, f.axis(v)));
    }
    const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 72))));
    opts.labels.forEach((l, i) => { if (i % every === 0) svg.appendChild(s('text', { x: X(i), y: m.t + ih + 20, class: 'tick cat', 'text-anchor': 'middle' }, l)); });
    for (const sr of opts.series) {
      const d = sr.values.map((v, i) => (v == null ? null : `${X(i)},${Y(v)}`)).filter(Boolean).join(' L');
      if (d) svg.appendChild(s('path', { d: 'M' + d, class: 'series-line', style: `stroke: var(${sr.color})`, 'stroke-dasharray': sr.dashed ? '5 5' : null }));
      if (n <= 16) sr.values.forEach((v, i) => { if (v != null) svg.appendChild(s('circle', { cx: X(i), cy: Y(v), r: 3, class: 'point', style: `fill: var(${sr.color})` })); });
    }
    const cross = s('line', { y1: m.t, y2: m.t + ih, class: 'crosshair', visibility: 'hidden' });
    const dots = opts.series.map((sr) => s('circle', { r: 4.5, class: 'hover-dot', style: `fill: var(${sr.color})`, visibility: 'hidden' }));
    svg.append(cross, ...dots);
    const hit = s('rect', { x: m.l - 10, y: m.t, width: iw + 20, height: ih, fill: 'transparent' });
    svg.appendChild(hit);
    wrap.appendChild(svg);
    const tip = tooltip(wrap);
    let cur = n - 1;
    function show(i) {
      cur = Math.max(0, Math.min(n - 1, i));
      const x = X(cur);
      cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('visibility', 'visible');
      opts.series.forEach((sr, k) => {
        const v = sr.values[cur];
        if (v == null) { dots[k].setAttribute('visibility', 'hidden'); return; }
        dots[k].setAttribute('cx', x); dots[k].setAttribute('cy', Y(v)); dots[k].setAttribute('visibility', 'visible');
      });
      const sc = svg.getBoundingClientRect().width / W;
      const top = Math.min(...opts.series.map((sr) => (sr.values[cur] == null ? Infinity : Y(sr.values[cur]))));
      tip.show(x * sc, (isFinite(top) ? top : m.t) * sc, opts.labels[cur], opts.series.map((sr) => ({ color: sr.color, value: sr.values[cur] == null ? '–' : f.full(sr.values[cur]), label: sr.label })));
    }
    const hide = () => { cross.setAttribute('visibility', 'hidden'); dots.forEach((d) => d.setAttribute('visibility', 'hidden')); tip.hide(); };
    hit.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect();
      const vx = ((e.clientX - r.left) / r.width) * W;
      show(n <= 1 ? 0 : Math.round(((vx - m.l) / iw) * (n - 1)));
    });
    hit.addEventListener('pointerleave', hide);
    svg.addEventListener('focus', () => show(cur));
    svg.addEventListener('blur', hide);
    svg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { show(cur + 1); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { show(cur - 1); e.preventDefault(); }
    });
  };

  /**
   * Horizontal ranking bars. rows: [{ label, value, color?, sub?, onClick? }]
   * Negative values extend left of zero (diverging) and use --neg.
   */
  CH.hbars = function (container, opts) {
    const rows = opts.rows;
    const W = widthOf(container);
    const rowH = 30, m = { l: Math.min(200, Math.max(110, W * 0.32)), r: 70, t: 6, b: 24 };
    const H = m.t + m.b + rows.length * rowH;
    const iw = W - m.l - m.r;
    const f = formatter(opts.format || 'money', opts.sym || '£');
    const vals = rows.map((r) => r.value);
    // headroom so value labels at the bar ends never run into the row labels
    const xt = ticks(Math.min(0, ...vals) * 1.2, Math.max(0, ...vals, 0.0001) * 1.12, Math.max(2, Math.floor(iw / 90)));
    const xMin = xt[0], xMax = xt[xt.length - 1];
    const X = (v) => m.l + ((v - xMin) / (xMax - xMin)) * iw;
    const wrap = frame(container, opts.aria);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart', role: 'img', 'aria-label': opts.aria || '' });
    for (const v of xt) {
      svg.appendChild(s('line', { x1: X(v), x2: X(v), y1: m.t, y2: H - m.b, class: v === 0 ? 'axis' : 'grid' }));
      svg.appendChild(s('text', { x: X(v), y: H - 6, class: 'tick', 'text-anchor': 'middle' }, f.axis(v)));
    }
    wrap.appendChild(svg);
    const tip = tooltip(wrap);
    const maxChars = Math.floor(m.l / 7.2);
    rows.forEach((r, i) => {
      const y = m.t + i * rowH;
      const g = s('g', { class: 'bar', tabindex: 0, 'aria-label': `${r.label}: ${f.full(r.value)}` });
      g.appendChild(s('rect', { x: 0, y, width: W, height: rowH, fill: 'transparent' }));
      const label = r.label.length > maxChars ? r.label.slice(0, maxChars - 1) + '…' : r.label;
      g.appendChild(s('text', { x: m.l - 10, y: y + rowH / 2 + 4, class: 'row-label', 'text-anchor': 'end' }, label));
      const color = r.color || (r.value < 0 ? '--neg' : opts.color || '--pos');
      g.appendChild(s('path', { d: hbarPath(X(0), X(r.value), y + 7, rowH - 14), style: `fill: var(${color})` }));
      const vx = r.value < 0 ? X(r.value) - 6 : X(r.value) + 6;
      g.appendChild(s('text', { x: vx, y: y + rowH / 2 + 4, class: 'value-label', 'text-anchor': r.value < 0 ? 'end' : 'start' }, f.axis(r.value)));
      const showTip = () => {
        const sc = svg.getBoundingClientRect().width / W;
        tip.show(X(Math.max(0, r.value)) * sc, y * sc, r.label, [{ color, value: f.full(r.value), label: opts.valueLabel || '' }].concat(r.sub ? [{ value: r.sub, label: '' }] : []));
      };
      g.addEventListener('pointerenter', showTip);
      g.addEventListener('focus', showTip);
      g.addEventListener('pointerleave', tip.hide);
      g.addEventListener('blur', tip.hide);
      if (r.onClick) { g.style.cursor = 'pointer'; g.addEventListener('click', r.onClick); g.addEventListener('keydown', (e) => { if (e.key === 'Enter') r.onClick(); }); }
      svg.appendChild(g);
    });
  };

  /**
   * Scatter with quadrant guides. points: [{ label, x, y, color?, onClick? }]
   * opts: { xLabel, yLabel, fmtX, fmtY, xMid, quadrants: [tl, tr, bl, br] }
   */
  CH.scatter = function (container, opts) {
    const W = widthOf(container), H = opts.height || 320;
    const m = { l: 64, r: 20, t: 16, b: 44 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const pts = opts.points;
    const xt = ticks(0, Math.max(1, ...pts.map((p) => p.x)) * 1.08, 5);
    const yLo = Math.min(0, ...pts.map((p) => p.y)), yHi = Math.max(0, ...pts.map((p) => p.y));
    const pad = (yHi - yLo || 1) * 0.18; // room for the quadrant labels
    const yt = ticks(yLo < 0 ? yLo - pad : 0, yHi + pad, 5);
    const X = (v) => m.l + (v / xt[xt.length - 1]) * iw;
    const Y = (v) => m.t + ih - ((v - yt[0]) / (yt[yt.length - 1] - yt[0])) * ih;
    const wrap = frame(container, opts.aria);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart', role: 'img', 'aria-label': opts.aria || '' });
    for (const v of yt) {
      svg.appendChild(s('line', { x1: m.l, x2: m.l + iw, y1: Y(v), y2: Y(v), class: v === 0 ? 'axis' : 'grid' }));
      svg.appendChild(s('text', { x: m.l - 8, y: Y(v) + 4, class: 'tick', 'text-anchor': 'end' }, opts.fmtY(v, true)));
    }
    for (const v of xt) svg.appendChild(s('text', { x: X(v), y: m.t + ih + 18, class: 'tick', 'text-anchor': 'middle' }, opts.fmtX(v, true)));
    svg.appendChild(s('text', { x: m.l + iw / 2, y: H - 4, class: 'axis-title', 'text-anchor': 'middle' }, opts.xLabel));
    svg.appendChild(s('text', { x: 14, y: m.t + ih / 2, class: 'axis-title', 'text-anchor': 'middle', transform: `rotate(-90 14 ${m.t + ih / 2})` }, opts.yLabel));
    if (opts.xMid != null) svg.appendChild(s('line', { x1: X(opts.xMid), x2: X(opts.xMid), y1: m.t, y2: m.t + ih, class: 'marker' }));
    if (opts.quadrants) {
      const q = opts.quadrants;
      svg.appendChild(s('text', { x: m.l + 6, y: m.t + 12, class: 'quadrant' }, q[0]));
      svg.appendChild(s('text', { x: m.l + iw - 6, y: m.t + 12, class: 'quadrant', 'text-anchor': 'end' }, q[1]));
      svg.appendChild(s('text', { x: m.l + 6, y: m.t + ih - 6, class: 'quadrant' }, q[2]));
      svg.appendChild(s('text', { x: m.l + iw - 6, y: m.t + ih - 6, class: 'quadrant', 'text-anchor': 'end' }, q[3]));
    }
    wrap.appendChild(svg);
    const tip = tooltip(wrap);
    const placed = [];
    pts.forEach((p) => {
      const cx = X(p.x), cy = Y(p.y);
      const g = s('g', { class: 'dot', tabindex: 0, 'aria-label': `${p.label}: ${opts.fmtX(p.x)} ${opts.xLabel.toLowerCase()}, ${opts.fmtY(p.y)} ${opts.yLabel.toLowerCase()}` });
      g.appendChild(s('circle', { cx, cy, r: 14, fill: 'transparent' }));
      g.appendChild(s('circle', { cx, cy, r: 5.5, class: 'scatter-dot', style: `fill: var(${p.color || '--series-1'})` }));
      // direct label unless it would collide with one already placed
      const lx = cx + 9, ly = cy + 4;
      if (!placed.some((q) => Math.abs(q.y - ly) < 13 && Math.abs(q.x - lx) < 110) && lx < W - 40) {
        const text = p.label.length > 18 ? p.label.slice(0, 17) + '…' : p.label;
        g.appendChild(s('text', { x: lx, y: ly, class: 'point-label', 'text-anchor': lx > W - 130 ? 'end' : 'start', dx: lx > W - 130 ? -18 : 0 }, text));
        placed.push({ x: lx, y: ly });
      }
      const showTip = () => {
        const sc = svg.getBoundingClientRect().width / W;
        tip.show(cx * sc, cy * sc, p.label, [{ value: opts.fmtX(p.x), label: opts.xLabel.toLowerCase() }, { value: opts.fmtY(p.y), label: opts.yLabel.toLowerCase() }].concat(p.sub ? [{ value: p.sub, label: '' }] : []));
      };
      g.addEventListener('pointerenter', showTip);
      g.addEventListener('focus', showTip);
      g.addEventListener('pointerleave', tip.hide);
      g.addEventListener('blur', tip.hide);
      if (p.onClick) { g.style.cursor = 'pointer'; g.addEventListener('click', p.onClick); g.addEventListener('keydown', (e) => { if (e.key === 'Enter') p.onClick(); }); }
      svg.appendChild(g);
    });
  };

  /**
   * Event timeline: one row per event, a mark per session (recurring) or a
   * diamond on the event date (one-off). Marks are coloured by net result.
   * rows: [{ label, kind, marks: [{ date, net, tip }], onClick }]
   */
  CH.timeline = function (container, opts) {
    const M = SF.master;
    const W = widthOf(container);
    const rowH = 28, m = { l: Math.min(190, Math.max(110, W * 0.28)), r: 16, t: 24, b: 8 };
    const H = m.t + m.b + opts.rows.length * rowH;
    const iw = W - m.l - m.r;
    const a = M.dayNum(opts.from), b = Math.max(M.dayNum(opts.to), a + 1);
    const X = (iso) => m.l + ((M.dayNum(iso) - a) / (b - a)) * iw;
    const wrap = frame(container, opts.aria, [
      { label: 'Session / event made money', color: '--pos', kind: 'dot' },
      { label: 'Session / event cost money', color: '--neg', kind: 'dot' },
    ]);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart timeline', role: 'img', 'aria-label': opts.aria || '' });
    // month gridlines
    const months = M.periodRange(opts.from, opts.to, 'month', 8);
    const every = Math.max(1, Math.ceil(months.length / Math.floor(iw / 60)));
    months.forEach((p, i) => {
      const iso = p.key + '-01';
      if (iso < opts.from) return;
      const x = X(iso);
      svg.appendChild(s('line', { x1: x, x2: x, y1: m.t - 4, y2: H - m.b, class: 'grid' }));
      if (i % every === 0) svg.appendChild(s('text', { x: x + 3, y: m.t - 10, class: 'tick' }, p.label));
    });
    wrap.appendChild(svg);
    const tip = tooltip(wrap);
    const maxChars = Math.floor(m.l / 7.2);
    opts.rows.forEach((r, i) => {
      const y = m.t + i * rowH + rowH / 2;
      const label = r.label.length > maxChars ? r.label.slice(0, maxChars - 1) + '…' : r.label;
      const lab = s('text', { x: m.l - 10, y: y + 4, class: 'row-label' + (r.onClick ? ' link' : ''), 'text-anchor': 'end' }, label);
      if (r.onClick) { lab.style.cursor = 'pointer'; lab.addEventListener('click', r.onClick); }
      svg.appendChild(lab);
      svg.appendChild(s('line', { x1: m.l, x2: m.l + iw, y1: y, y2: y, class: 'row-rule' }));
      if (r.kind === 'recurring' && r.marks.length > 1) {
        svg.appendChild(s('line', { x1: X(r.marks[0].date), x2: X(r.marks[r.marks.length - 1].date), y1: y, y2: y, class: 'run-line' }));
      }
      for (const mk of r.marks) {
        const x = X(mk.date);
        const g = s('g', { class: 'mark', tabindex: 0, 'aria-label': `${r.label}, ${mk.tip.join(', ')}` });
        g.appendChild(s('rect', { x: x - 8, y: y - 12, width: 16, height: 24, fill: 'transparent' }));
        const color = mk.net == null ? '--muted-mark' : mk.net >= 0 ? '--pos' : '--neg';
        if (r.kind === 'recurring') g.appendChild(s('circle', { cx: x, cy: y, r: 4.5, class: 'tl-dot', style: `fill: var(${color})` }));
        else g.appendChild(s('path', { d: `M${x},${y - 8} L${x + 8},${y} L${x},${y + 8} L${x - 8},${y} Z`, class: 'tl-dot', style: `fill: var(${color})` }));
        const showTip = () => {
          const sc = svg.getBoundingClientRect().width / W;
          tip.show(x * sc, (y - 10) * sc, r.label, mk.tip.map((t) => ({ value: t, label: '' })));
        };
        g.addEventListener('pointerenter', showTip);
        g.addEventListener('focus', showTip);
        g.addEventListener('pointerleave', tip.hide);
        g.addEventListener('blur', tip.hide);
        svg.appendChild(g);
      }
    });
  };

  CH.breakEven = function (container, sum, be, sym) {
    U.clear(container);
    const W = Math.max(300, Math.round(container.clientWidth || 640)), H = 300, m = { l: 58, r: 92, t: 22, b: 40 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const rev = (n) => sum.avgPrice * n;
    const cost = (n) => sum.fixed + sum.varPerHead * n;

    const xMaxRaw = Math.max(10, sum.attendees * 1.4, be.possible && be.exact ? be.exact * 1.3 : 0);
    const xt = ticks(0, xMaxRaw, W < 480 ? 4 : 6);
    const xMax = xt[xt.length - 1];
    const yt = ticks(0, Math.max(rev(xMax), cost(xMax), 1), 5);
    const yMax = yt[yt.length - 1];
    const X = (n) => m.l + (n / xMax) * iw;
    const Y = (v) => m.t + ih - (v / yMax) * ih;

    const wrap = U.el('div', { class: 'chart-wrap' });
    wrap.appendChild(legend([{ label: 'Ticket income', color: '--series-1' }, { label: 'Total cost', color: '--series-2' }]));
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', tabindex: 0,
      'aria-label': `Break-even chart. Income and total cost by number of attendees. ${be.possible ? 'Break-even at ' + be.units + ' attendees.' : 'No break-even point at these prices.'} Use left and right arrow keys to read values.` });

    for (const v of yt) {
      svg.appendChild(s('line', { x1: m.l, x2: m.l + iw, y1: Y(v), y2: Y(v), class: v === 0 ? 'axis' : 'grid' }));
      svg.appendChild(s('text', { x: m.l - 8, y: Y(v) + 4, class: 'tick', 'text-anchor': 'end' }, shortMoney(v, sym)));
    }
    for (const v of xt) svg.appendChild(s('text', { x: X(v), y: m.t + ih + 18, class: 'tick', 'text-anchor': 'middle' }, U.fmtNum(v)));
    svg.appendChild(s('text', { x: m.l + iw / 2, y: H - 4, class: 'axis-title', 'text-anchor': 'middle' }, 'Attendees'));

    // attendance marker
    if (sum.attendees > 0) {
      const ax = X(sum.attendees);
      svg.appendChild(s('line', { x1: ax, x2: ax, y1: m.t, y2: m.t + ih, class: 'marker' }));
      svg.appendChild(s('text', { x: ax, y: m.t - 8, class: 'marker-label', 'text-anchor': 'middle' },
        `${sum.scenario === 'plan' ? 'Expected' : 'Actual'}: ${U.fmtNum(sum.attendees)}`));
    }

    svg.appendChild(s('line', { x1: X(0), y1: Y(rev(0)), x2: X(xMax), y2: Y(rev(xMax)), class: 'series-line', style: 'stroke: var(--series-1)' }));
    svg.appendChild(s('line', { x1: X(0), y1: Y(cost(0)), x2: X(xMax), y2: Y(cost(xMax)), class: 'series-line', style: 'stroke: var(--series-2)' }));

    // direct end labels, nudged apart
    let yr = Y(rev(xMax)), yc = Y(cost(xMax));
    if (Math.abs(yr - yc) < 14) {
      const mid = (yr + yc) / 2, up = yr <= yc ? -1 : 1;
      yr = mid + up * 7; yc = mid - up * 7;
    }
    svg.appendChild(s('text', { x: m.l + iw + 8, y: yr + 4, class: 'end-label' }, 'Income'));
    svg.appendChild(s('text', { x: m.l + iw + 8, y: yc + 4, class: 'end-label' }, 'Total cost'));

    if (be.possible && be.exact !== undefined && be.exact <= xMax) {
      const bx = X(be.exact), by = Y(rev(be.exact));
      svg.appendChild(s('circle', { cx: bx, cy: by, r: 5, class: 'be-dot' }));
      svg.appendChild(s('text', { x: bx + 9, y: by + 18, class: 'be-label' }, `Break-even: ${U.fmtNum(be.units)}`));
    }

    // crosshair layer
    const cross = s('line', { y1: m.t, y2: m.t + ih, class: 'crosshair', visibility: 'hidden' });
    const d1 = s('circle', { r: 4, class: 'hover-dot', style: 'fill: var(--series-1)', visibility: 'hidden' });
    const d2 = s('circle', { r: 4, class: 'hover-dot', style: 'fill: var(--series-2)', visibility: 'hidden' });
    svg.append(cross, d1, d2);
    const hit = s('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent' });
    svg.appendChild(hit);
    wrap.appendChild(svg);
    container.appendChild(wrap);
    const tip = tooltip(wrap);

    let cur = Math.round(sum.attendees || xMax / 2);
    function show(n) {
      cur = Math.max(0, Math.min(xMax, n));
      const x = X(cur);
      for (const [el, y] of [[d1, Y(rev(cur))], [d2, Y(cost(cur))]]) { el.setAttribute('cx', x); el.setAttribute('cy', y); el.setAttribute('visibility', 'visible'); }
      cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('visibility', 'visible');
      const scale = svg.getBoundingClientRect().width / W;
      const p = rev(cur) - cost(cur);
      tip.show(x * scale, Y(Math.max(rev(cur), cost(cur))) * scale, `${U.fmtNum(cur)} attendees`, [
        { color: '--series-1', value: U.fmtMoney(rev(cur), sym), label: 'income' },
        { color: '--series-2', value: U.fmtMoney(cost(cur), sym), label: 'total cost' },
        { value: U.fmtMoney(p, sym, { signed: true }), label: p >= 0 ? 'profit' : 'loss' },
      ]);
    }
    function hide() { for (const el of [cross, d1, d2]) el.setAttribute('visibility', 'hidden'); tip.hide(); }
    hit.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect();
      const vx = ((e.clientX - r.left) / r.width) * W;
      show(Math.round(((vx - m.l) / iw) * xMax));
    });
    hit.addEventListener('pointerleave', hide);
    svg.addEventListener('focus', () => show(cur));
    svg.addEventListener('blur', hide);
    svg.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowRight') { show(cur + step); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { show(cur - step); e.preventDefault(); }
    });
  };

  /** Planned vs actual grouped bars used by the event planner. */
  CH.groupedBars = function (container, categories, series, sym, ariaLabel) {
    CH.bars(container, { labels: categories, series, sym, format: 'money', aria: ariaLabel, height: 250 });
  };
})(typeof window !== 'undefined' ? window : globalThis);
