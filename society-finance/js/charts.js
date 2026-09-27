/*
 * Inline SVG charts with hover/keyboard tooltips. Colours come from CSS custom
 * properties (--series-1 etc.) so light/dark themes swap in one place.
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

  function niceStep(range, target) {
    const raw = range / (target || 5);
    const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const f = raw / mag;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  }

  function ticks(min, max, target) {
    const step = niceStep(max - min, target);
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const out = [];
    for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
    return out;
  }

  const shortMoney = (v, sym) => {
    const a = Math.abs(v);
    const body = a >= 10000 ? (a / 1000).toFixed(a % 1000 === 0 ? 0 : 1) + 'k' : a.toLocaleString('en-GB', { maximumFractionDigits: 0 });
    return (v < 0 ? '−' : '') + sym + body;
  };

  function legend(items) {
    return U.el('div', { class: 'legend' }, items.map((it) =>
      U.el('span', { class: 'legend-item' },
        U.el('span', { class: 'key ' + (it.kind || 'line'), style: `--c: var(${it.color})` }), it.label)));
  }

  function tooltip(wrap) {
    const tip = U.el('div', { class: 'tooltip', role: 'status', hidden: true });
    wrap.appendChild(tip);
    return {
      show(x, y, title, rows) {
        U.clear(tip);
        tip.appendChild(U.el('div', { class: 'tip-title' }, title));
        for (const r of rows) {
          tip.appendChild(U.el('div', { class: 'tip-row' },
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

  /**
   * Cost-volume-profit chart: income and total cost against attendance, with
   * the break-even point and the scenario's attendance marked.
   */
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

  /** Rounded-end bar path (4px radius on the end away from the baseline). */
  function barPath(x, w, y0, y1) {
    const up = y1 < y0;
    const h = Math.abs(y1 - y0);
    const r = Math.min(4, h, w / 2);
    if (h < 0.5) return '';
    if (up) return `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 + r} V${y0} Z`;
    return `M${x},${y0} V${y1 - r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 - r} V${y0} Z`;
  }

  /**
   * Grouped bars: categories × series. series: [{ label, color, values[] }]
   */
  CH.groupedBars = function (container, categories, series, sym, ariaLabel) {
    U.clear(container);
    const W = Math.max(300, Math.round(container.clientWidth || 640)), H = 260, m = { l: 58, r: 12, t: 12, b: 34 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const all = series.flatMap((sr) => sr.values).concat(0);
    const yt = ticks(Math.min(...all), Math.max(...all, 1), 5);
    const yMin = yt[0], yMax = yt[yt.length - 1];
    const Y = (v) => m.t + ih - ((v - yMin) / (yMax - yMin)) * ih;
    const band = iw / categories.length;
    const groupW = Math.min(band * 0.64, 36 * series.length + 2 * (series.length - 1));
    const barW = (groupW - 2 * (series.length - 1)) / series.length;

    const wrap = U.el('div', { class: 'chart-wrap' });
    if (series.length > 1) wrap.appendChild(legend(series.map((sr) => ({ label: sr.label, color: sr.color, kind: 'box' }))));
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': ariaLabel });
    for (const v of yt) {
      svg.appendChild(s('line', { x1: m.l, x2: m.l + iw, y1: Y(v), y2: Y(v), class: v === 0 ? 'axis' : 'grid' }));
      svg.appendChild(s('text', { x: m.l - 8, y: Y(v) + 4, class: 'tick', 'text-anchor': 'end' }, shortMoney(v, sym)));
    }
    wrap.appendChild(svg);
    container.appendChild(wrap);
    const tip = tooltip(wrap);

    categories.forEach((cat, ci) => {
      const gx = m.l + band * ci + (band - groupW) / 2;
      svg.appendChild(s('text', { x: m.l + band * ci + band / 2, y: m.t + ih + 20, class: 'tick cat', 'text-anchor': 'middle' }, W < 480 ? cat.replace(/ costs$/, '').replace('Ticket ', '') : cat));
      series.forEach((sr, si) => {
        const v = sr.values[ci];
        const x = gx + si * (barW + 2);
        const g = s('g', { class: 'bar', tabindex: 0, 'aria-label': `${cat}, ${sr.label}: ${U.fmtMoney(v, sym)}` });
        g.appendChild(s('rect', { x: x - 2, y: m.t, width: barW + 4, height: ih, fill: 'transparent' }));
        g.appendChild(s('path', { d: barPath(x, barW, Y(0), Y(v)), style: `fill: var(${sr.color})` }));
        const showTip = () => {
          const scale = svg.getBoundingClientRect().width / W;
          tip.show((x + barW) * scale, Math.min(Y(v), Y(0)) * scale, cat, [{ color: sr.color, value: U.fmtMoney(v, sym), label: sr.label.toLowerCase() }]);
        };
        g.addEventListener('pointerenter', showTip);
        g.addEventListener('focus', showTip);
        g.addEventListener('pointerleave', tip.hide);
        g.addEventListener('blur', tip.hide);
        svg.appendChild(g);
      });
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
