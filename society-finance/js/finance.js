/*
 * Event finance maths. Pure functions, no DOM.
 *
 * Event shape:
 *   { id, name, date, linkName, notes,
 *     tickets:      [{ id, name, price, expectedQty, actualQty }],
 *     plannedCosts: [{ id, description, type: 'fixed'|'variable', unitCost, qty, notes }],
 *     actualCosts:  [ same ] }
 *
 * Cost lines: total = unitCost × qty. A blank qty means 1 for a fixed cost and
 * "one per attendee" for a variable cost, so variable costs follow attendance.
 */
(function (root) {
  const SF = (root.SF = root.SF || {});
  const U = SF.util;
  const F = (SF.finance = {});

  const num = (v) => (U.isBlank(v) || !isFinite(Number(v)) ? null : Number(v));

  F.SCENARIOS = { plan: 'Planned', actual: 'Actual' };

  F.attendees = (event, scenario) =>
    U.sum(event.tickets, (t) => num(scenario === 'plan' ? t.expectedQty : t.actualQty) || 0);

  F.lineQty = (line, attendees) => {
    const q = num(line.qty);
    if (q !== null) return q;
    return line.type === 'variable' ? attendees : 1;
  };

  F.lineTotal = (line, attendees) => (num(line.unitCost) || 0) * F.lineQty(line, attendees);

  F.costLines = (event, scenario) => (scenario === 'plan' ? event.plannedCosts : event.actualCosts);

  F.hasActuals = (event) =>
    event.actualCosts.length > 0 || event.tickets.some((t) => num(t.actualQty) !== null);

  /** Headline numbers for one scenario. */
  F.summarise = (event, scenario) => {
    const n = F.attendees(event, scenario);
    const lines = F.costLines(event, scenario);
    const fixed = U.sum(lines.filter((l) => l.type !== 'variable'), (l) => F.lineTotal(l, n));
    const variable = U.sum(lines.filter((l) => l.type === 'variable'), (l) => F.lineTotal(l, n));
    const revenue = U.sum(event.tickets, (t) => (num(t.price) || 0) * (num(scenario === 'plan' ? t.expectedQty : t.actualQty) || 0));
    const totalCost = fixed + variable;
    const net = revenue - totalCost;

    // Per-attendee figures for break-even. With no attendees yet, fall back to
    // the simple average ticket price and the per-head variable unit costs.
    const avgPrice = n > 0 ? revenue / n
      : event.tickets.length ? U.sum(event.tickets, (t) => num(t.price) || 0) / event.tickets.length : 0;
    const varPerHead = n > 0 ? variable / n
      : U.sum(lines.filter((l) => l.type === 'variable' && num(l.qty) === null), (l) => num(l.unitCost) || 0);

    return {
      scenario, attendees: n, revenue, fixed, variable, totalCost, net,
      margin: revenue ? net / revenue : null,
      costPerHead: n ? totalCost / n : null,
      avgPrice, varPerHead,
    };
  };

  /** Break-even analysis on a summary. */
  F.breakEven = (s) => {
    const contribution = s.avgPrice - s.varPerHead; // what each attendee adds towards fixed costs
    const out = { contribution, fixed: s.fixed, attendees: s.attendees, avgPrice: s.avgPrice, varPerHead: s.varPerHead };
    if (s.fixed <= 0 && contribution >= 0) {
      out.possible = true;
      out.units = 0;
    } else if (contribution <= 0) {
      out.possible = false;
    } else {
      out.possible = true;
      out.exact = s.fixed / contribution;
      out.units = Math.ceil(out.exact - 1e-9);
    }
    if (out.possible && s.attendees > 0) {
      out.safety = s.attendees - out.units;
      out.safetyPct = out.safety / s.attendees;
    }
    // Average ticket price needed to break even at this scenario's attendance.
    out.priceAtAttendance = s.attendees > 0 ? s.varPerHead + s.fixed / s.attendees : null;
    // How much fixed cost would have to go for this attendance to break even.
    out.fixedGap = s.attendees > 0 ? Math.max(0, s.fixed - contribution * s.attendees) : null;
    return out;
  };

  /** Profit at a given attendance, holding average price and variable cost per head. */
  F.profitAt = (s, n) => s.avgPrice * n - (s.fixed + s.varPerHead * n);

  /** Planned vs actual, line by line (matched on type + description). */
  F.lineVariance = (event) => {
    const nP = F.attendees(event, 'plan');
    const nA = F.attendees(event, 'actual');
    const key = (l) => l.type + '|' + U.norm(l.description);
    const rows = new Map();
    for (const l of event.plannedCosts) {
      const k = key(l);
      const r = rows.get(k) || { description: l.description || '(unnamed)', type: l.type, planned: 0, actual: 0, inPlan: false, inActual: false };
      r.planned += F.lineTotal(l, nP);
      r.inPlan = true;
      rows.set(k, r);
    }
    for (const l of event.actualCosts) {
      const k = key(l);
      const r = rows.get(k) || { description: l.description || '(unnamed)', type: l.type, planned: 0, actual: 0, inPlan: false, inActual: false };
      r.actual += F.lineTotal(l, nA);
      r.inActual = true;
      rows.set(k, r);
    }
    return [...rows.values()].map((r) => ({ ...r, diff: r.actual - r.planned }));
  };

  /**
   * Plain-English findings. Returns [{ tone: 'good'|'bad'|'info', text }].
   */
  F.findings = (event, sym) => {
    const m = (n, o) => U.fmtMoney(n, sym, o);
    const out = [];
    const p = F.summarise(event, 'plan');
    const pb = F.breakEven(p);

    if (!event.tickets.length && !event.plannedCosts.length) {
      return [{ tone: 'info', text: 'Add ticket types and planned costs to see the analysis.' }];
    }

    // Plan
    if (p.attendees > 0) {
      out.push({
        tone: p.net >= 0 ? 'good' : 'bad',
        text: `The plan expects ${U.fmtNum(p.attendees)} attendees, ${m(p.revenue)} income and ${m(p.totalCost)} costs: a planned ${p.net >= 0 ? 'profit' : 'loss'} of ${m(Math.abs(p.net))}.`,
      });
    }
    if (!pb.possible) {
      out.push({
        tone: 'bad',
        text: `At the planned prices each attendee costs ${m(p.varPerHead)} but pays ${m(p.avgPrice)} on average, so selling more tickets makes the loss bigger. Raise prices above ${m(p.varPerHead)} or cut per-head costs.`,
      });
    } else if (p.attendees > 0 && pb.units > p.attendees) {
      out.push({
        tone: 'bad',
        text: `Break-even needs ${U.fmtNum(pb.units)} attendees but the plan expects ${U.fmtNum(p.attendees)}. To break even at ${U.fmtNum(p.attendees)}, the average ticket would need to be ${m(pb.priceAtAttendance)} (now ${m(p.avgPrice)}), or fixed costs cut by ${m(pb.fixedGap)}.`,
      });
    } else if (p.attendees > 0) {
      out.push({
        tone: 'good',
        text: `Break-even is ${U.fmtNum(pb.units)} attendees, ${U.fmtPct(pb.units / p.attendees)} of expected. Attendance can fall by ${U.fmtNum(pb.safety)} before the event loses money.`,
      });
    }

    if (!F.hasActuals(event)) return out;

    // Actuals vs plan
    const a = F.summarise(event, 'actual');
    const diff = a.net - p.net;
    out.push({
      tone: a.net >= 0 ? 'good' : 'bad',
      text: `Actual result: ${a.net >= 0 ? 'profit' : 'loss'} of ${m(Math.abs(a.net))}, ${m(Math.abs(diff))} ${diff >= 0 ? 'better' : 'worse'} than planned.`,
    });
    if (p.attendees > 0) {
      const d = a.attendees - p.attendees;
      out.push({
        tone: d >= 0 ? 'good' : 'bad',
        text: `${U.fmtNum(a.attendees)} attended against ${U.fmtNum(p.attendees)} expected (${U.fmtPct(d / p.attendees, true)}); ticket income was ${m(a.revenue - p.revenue, { signed: true })} vs plan.`,
      });
    }
    const costDiff = a.totalCost - p.totalCost;
    if (p.totalCost > 0) {
      out.push({
        tone: costDiff <= 0 ? 'good' : 'bad',
        text: `Costs came in at ${m(a.totalCost)}, ${m(Math.abs(costDiff))} ${costDiff <= 0 ? 'under' : 'over'} budget (${U.fmtPct(costDiff / p.totalCost, true)}).`,
      });
    }
    const lv = F.lineVariance(event).filter((r) => Math.abs(r.diff) >= 0.005);
    const over = lv.filter((r) => r.diff > 0).sort((x, y) => y.diff - x.diff)[0];
    const under = lv.filter((r) => r.diff < 0).sort((x, y) => x.diff - y.diff)[0];
    if (over) {
      out.push({
        tone: 'bad',
        text: over.inPlan
          ? `Biggest overspend: ${over.description} (${m(over.actual)} vs ${m(over.planned)} planned, ${m(over.diff, { signed: true })}).`
          : `Unplanned cost: ${over.description} (${m(over.actual)}). Budget for it next time.`,
      });
    }
    if (under) {
      out.push({
        tone: 'good',
        text: under.inActual
          ? `Biggest saving: ${under.description} (${m(under.actual)} vs ${m(under.planned)} planned).`
          : `${under.description} was planned (${m(under.planned)}) but not spent.`,
      });
    }
    if (a.attendees > 0) {
      const ab = F.breakEven(a);
      out.push({
        tone: 'info',
        text: `For a repeat with ${U.fmtNum(a.attendees)} attendees and these costs, tickets would need to average ${m(ab.priceAtAttendance)} to break even (this time they averaged ${m(a.avgPrice)}).`,
      });
    }
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
