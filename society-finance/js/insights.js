/*
 * Automatic insights, written for a student society: the aim is the best
 * possible experience for members with finances that are sustainable, not
 * maximum profit. Each event is judged against its purpose (fundraiser,
 * break even, or member benefit) and gets concrete pricing, frequency, cost
 * and reach suggestions. Pure - no DOM.
 */
(function (root) {
  const SF = (root.SF = root.SF || {});
  const U = SF.util, M = SF.master;
  const I = (SF.insights = {});

  I.RATINGS = {
    strong: { label: 'Working well', tone: 'good' },
    ok: { label: 'Okay', tone: 'info' },
    review: { label: 'Needs attention', tone: 'bad' },
    nodata: { label: 'Not enough data', tone: 'info' },
  };

  const isMemberTier = (n) => /\bmember/i.test(n) && !/non|guest|public/i.test(n);
  const isNonMemberTier = (n) => /non[- ]?member|guest|public|external/i.test(n);

  /** First-third vs last-third average attendance for a recurring event. */
  I.trend = function (ev) {
    if (ev.kind !== 'recurring' || !ev.sessions || ev.sessions.length < 4) return null;
    const n = ev.sessions.length, k = Math.max(1, Math.floor(n / 3));
    const avg = (arr) => U.sum(arr, (s) => s.attendees) / arr.length;
    const first = avg(ev.sessions.slice(0, k)), last = avg(ev.sessions.slice(n - k));
    return { first, last, change: first ? (last - first) / first : null };
  };

  /** Context shared by all event ratings (society-wide medians etc). */
  I.context = function (model, sym) {
    const withAtt = model.events.filter((e) => e.attendees > 0);
    const s = M.summary(model);
    // Compare like with like: one-off events with one-off events, sessions with sessions.
    const byKind = (kind, fn) => M.median(withAtt.filter((e) => e.kind === kind).map(fn).filter((v) => v != null));
    return {
      sym,
      members: s.members,
      avgFee: s.avgFee,
      medianCostPerAttendee: { oneoff: byKind('oneoff', (e) => e.costPerAttendee), recurring: byKind('recurring', (e) => e.costPerAttendee) },
      medianAttendees: { oneoff: byKind('oneoff', (e) => e.attendees), recurring: byKind('recurring', (e) => e.perSession.attendees) },
    };
  };

  /**
   * Rate one event. Returns
   *   { rating, label, tone, headline, points: [{tone,text}], recs: [{area,text}] }
   */
  I.rateEvent = function (ev, ctx) {
    const m = (n, o) => U.fmtMoney(n, ctx.sym, o);
    const A = ev.attendees, N = ev.net, C = ev.costs, Inc = ev.income;
    const perHead = A ? -N / A : null; // positive = society pays per attendance
    const margin = Inc ? N / Inc : null;
    const tr = I.trend(ev);
    const recs = [];
    const points = [];
    let rating;

    // ----- headline & rating against the event's purpose -----
    let headline;
    const visits = ev.kind === 'recurring' ? 'attendance' : 'attendee';
    if (ev.goal === 'fundraiser') {
      rating = N > 0 && margin >= 0.2 ? 'strong' : N >= 0 ? 'ok' : 'review';
      headline = N >= 0 ? `Raised ${m(N)} for the society${margin != null ? ` (${U.fmtPct(margin)} of its income)` : ''}.`
        : `Lost ${m(-N)}, although it is meant to raise money.`;
    } else if (ev.goal === 'service') {
      if (!A) {
        rating = C || Inc ? 'ok' : 'nodata';
        headline = N < 0 ? `Cost the society ${m(-N)}. Add attendance or ticket data to judge its value per person.` : `Surplus of ${m(N)}.`;
      } else {
        const falling = tr && tr.change != null && tr.change <= -0.3;
        rating = perHead <= 5 && !falling ? 'strong' : perHead <= 10 ? 'ok' : 'review';
        if (tr && tr.change != null && tr.change <= -0.45) rating = 'review';
        headline = N < 0
          ? `A member benefit that cost the society ${m(-N)}: ${m(perHead)} per ${visits} across ${U.fmtNum(A)} ${ev.kind === 'recurring' ? 'attendances' : 'attendees'}.`
          : `A member benefit that also paid for itself (surplus ${m(N)}).`;
      }
    } else {
      const tolerance = Math.max(25, 0.05 * C);
      if (!C && !Inc) rating = 'nodata';
      else if (N >= -tolerance) rating = 'strong';
      else if ((perHead != null && perHead <= 3) || -N <= 0.15 * C) rating = 'ok';
      else rating = 'review';
      headline = N >= 0 ? `Paid for itself with a ${m(N)} surplus.`
        : `Ran at a loss of ${m(-N)}${perHead != null ? ` (${m(perHead)} per ${visits})` : ''}.`;
    }

    // ----- pricing -----
    if (ev.ticketsSold > 0) {
      const p = ev.avgPrice;
      const needed = (C - ev.otherIncome) / ev.ticketsSold;
      if (ev.goal !== 'service' && N < 0) {
        let t = `To break even at this attendance, the average ticket needs to be ${m(needed)} instead of ${m(p)} (${m(needed - p, { signed: true })} per ticket).`;
        const nm = ev.tiers.find((x) => isNonMemberTier(x.name));
        if (nm && nm.qty) {
          const rise = -N / nm.qty;
          if (rise <= nm.avgPrice * 0.6) t += ` Or keep the member price and raise the ${nm.name} price by ${m(rise)}.`;
        }
        recs.push({ area: 'Pricing', text: t });
      }
      if (ev.goal !== 'fundraiser' && N > 0 && margin > 0.25) {
        recs.push({ area: 'Pricing', text: `It made a ${m(N)} surplus. You could cut tickets by up to ${m(N / ev.ticketsSold)} each and still break even, making it cheaper for members, or keep the price and use the surplus to subsidise other activities.` });
      }
      const mt = ev.tiers.find((x) => isMemberTier(x.name));
      const nmt = ev.tiers.find((x) => isNonMemberTier(x.name));
      if (mt && nmt) {
        const gap = nmt.avgPrice - mt.avgPrice;
        const memberShare = mt.qty / (mt.qty + nmt.qty);
        if (gap < Math.max(1, 0.15 * mt.avgPrice)) {
          recs.push({ area: 'Pricing', text: `Non-members pay only ${m(gap)} more than members. A bigger member discount makes membership better value and can pull in sign-ups.` });
        }
        points.push({ tone: 'info', text: `${U.fmtPct(memberShare)} of tickets went to members (${mt.name} ${m(mt.avgPrice)}, ${nmt.name} ${m(nmt.avgPrice)}).` });
        if (memberShare < 0.5) recs.push({ area: 'Reach', text: `Most buyers were not members. This event is a good moment to promote membership, e.g. by including a discounted membership with the ticket.` });
      } else if (ev.tiers.length > 1) {
        points.push({ tone: 'info', text: 'Ticket mix: ' + ev.tiers.map((t) => `${t.name} ${U.fmtNum(t.qty)} × ${m(t.avgPrice)}`).join(', ') + '.' });
      }
    }

    // ----- pricing for subsidised member activities -----
    if (ev.goal === 'service' && A && perHead != null && perHead > 2) {
      const guestCount = U.sum(ev.att.filter((a) => a.member && /guest|non|visitor/i.test(a.member)), (a) => a.count || 1);
      if (guestCount >= 5) {
        recs.push({ area: 'Pricing', text: `Guests (non-members) made up ${U.fmtPct(guestCount / A)} of attendances. Charging guests ${m(3)} a session would raise about ${m(guestCount * 3)} and gives regulars a reason to join.` });
      }
      recs.push({ area: 'Pricing', text: `Each attendance costs the society ${m(perHead)}. A ${m(1)} session fee would recover about ${m(A)} (${U.fmtPct(A / -N)} of the cost), and ${m(Math.ceil(perHead * 2) / 2)} would cover it fully. Only do this if it won’t put people off: many societies keep training free as the main reason to join.` });
    }

    // ----- capacity -----
    if (ev.capacity && A) {
      const perSession = ev.perSession.attendees;
      const util = perSession / ev.capacity;
      if (util >= 0.95) {
        recs.push({ area: 'Pricing', text: `At or over capacity (${U.fmtNum(perSession, 1)} of ${U.fmtNum(ev.capacity)}). Demand is higher than space: consider a bigger venue, an extra ${ev.kind === 'recurring' ? 'session' : 'date'}, or a small price rise (10% would add about ${m(ev.ticketIncome * 0.1)}).` });
      } else if (util <= 0.5) {
        recs.push({ area: 'Costs', text: `Only ${U.fmtPct(util)} of capacity was used. A smaller or cheaper space, or more promotion, would lower the cost per person.` });
      }
    }

    // ----- sales timing (one-off) -----
    if (ev.kind === 'oneoff' && ev.salesCurve && ev.salesCurve.length > 1 && ev.ticketsSold) {
      let late = 0;
      ev.salesCurve.forEach((pt, i) => {
        if (pt.daysBefore != null && pt.daysBefore <= 7) late += pt.cumulative - (i ? ev.salesCurve[i - 1].cumulative : 0);
      });
      const lateShare = late / ev.ticketsSold;
      const firstBefore = ev.salesCurve[0].daysBefore;
      if (lateShare >= 0.5) {
        recs.push({ area: 'Timing', text: `${U.fmtPct(lateShare)} of tickets sold in the final week. An early-bird price or a booking deadline would give you numbers sooner, which helps when confirming venues and catering.` });
      } else if (firstBefore != null && firstBefore >= 28 && lateShare < 0.2) {
        points.push({ tone: 'good', text: `Tickets sold early (${U.fmtPct(1 - lateShare)} before the last week), a sign of strong demand.` });
      }
    }

    // ----- frequency (recurring) -----
    if (ev.kind === 'recurring' && ev.sessions) {
      const perSessionCost = ev.perSession.costs;
      if (tr && tr.change != null && tr.change <= -0.25 && ev.sessionCount >= 6) {
        const saving = (ev.sessionCount / 2) * perSessionCost;
        const lower = ev.frequency === 'Weekly' ? 'fortnightly' : 'less often';
        recs.push({ area: 'Frequency', text: `Attendance fell ${U.fmtPct(-tr.change)} from the first sessions to the last (${U.fmtNum(tr.first, 1)} → ${U.fmtNum(tr.last, 1)} per session). Running it ${lower} would save about ${m(saving)} over the same period, and people may concentrate into fewer, busier sessions. Check whether exams or timing clashes caused the drop first.` });
      } else if (tr && tr.change != null && tr.change >= 0.2) {
        recs.push({ area: 'Frequency', text: `Attendance grew ${U.fmtPct(tr.change)} (${U.fmtNum(tr.first, 1)} → ${U.fmtNum(tr.last, 1)} per session). If sessions are getting crowded, consider adding a session or a bigger space.` });
      }
      const avg = ev.perSession.attendees;
      if (avg > 0) {
        const thin = ev.sessions.filter((s) => s.attendees < avg * 0.5);
        if (thin.length >= 2) {
          points.push({ tone: 'bad', text: `${thin.length} of ${ev.sessionCount} sessions had under half the usual turnout (${thin.slice(0, 3).map((s) => U.fmtDate(s.date)).join(', ')}${thin.length > 3 ? '…' : ''}). These often line up with deadlines or holidays and are worth skipping.` });
        }
      }
      if (ev.ticketsSold > 0 && ev.avgPrice > 0) {
        const bePerSession = perSessionCost / ev.avgPrice;
        const below = ev.sessions.filter((s) => s.attendees < bePerSession).length;
        if (below && ev.goal !== 'service') points.push({ tone: 'info', text: `A session needs about ${U.fmtNum(Math.ceil(bePerSession))} paying people to cover its ${m(perSessionCost)} cost; ${below} of ${ev.sessionCount} sessions fell short.` });
      }
      points.push({ tone: 'info', text: `${ev.frequency}, ${ev.sessionCount} sessions: on average ${U.fmtNum(avg, 1)} people, ${m(perSessionCost)} cost and ${m(ev.perSession.income)} income per session.` });
    } else if (ev.kind === 'oneoff') {
      if (rating === 'strong' && ev.goal !== 'service' && A && ctx.medianAttendees.oneoff && A >= ctx.medianAttendees.oneoff) {
        recs.push({ area: 'Frequency', text: 'Popular and pays for itself. Consider running it more than once a year, e.g. once a term.' });
      } else if (rating === 'review' && A && ctx.medianAttendees.oneoff && A < ctx.medianAttendees.oneoff) {
        recs.push({ area: 'Frequency', text: 'Low turnout and a loss. Consider combining it with another event, a cheaper format, or running it less often.' });
      }
    }

    // ----- costs -----
    if (ev.costLines.length >= 2 && C > 0) {
      const top = ev.costLines[0];
      const share = top.amount / C;
      if (share >= 0.4) {
        const tip = top.stream === 'hires'
          ? 'Compare rates with other coaches, or share sessions (and the cost) with another club or society.'
          : /venue|room|hall|hire|pitch|court|space/i.test(top.name)
            ? 'Get two more quotes, or ask the Students’ Union about university rooms that societies can often book free or cheaply.'
            : top.costType === 'variable'
              ? 'It grows with turnout, so bulk-buying, a cheaper supplier or a sponsor covering it would make the biggest difference.'
              : 'Get two more quotes before booking next time, or ask a sponsor to cover it.';
        recs.push({ area: 'Costs', text: `${top.name} is ${U.fmtPct(share)} of this event's costs (${m(top.amount)}), so it's where savings count most. ${tip}` });
      }
    }
    const typical = ctx.medianCostPerAttendee[ev.kind];
    if (ev.costPerAttendee != null && typical && ev.costPerAttendee > typical * 1.5 && C > 100) {
      points.push({ tone: 'bad', text: `Costs ${m(ev.costPerAttendee)} per ${visits}, well above the society's typical ${m(typical)} for ${ev.kind === 'recurring' ? 'regular sessions' : 'one-off events'}.` });
    }
    if (ev.hireCosts > 0 && A) {
      points.push({ tone: 'info', text: `Coaching / hired help cost ${m(ev.hireCosts)} in total: ${m(ev.hireCosts / A)} per ${visits}.` });
    }

    // ----- reach -----
    if (ctx.members && A) {
      const reach = (ev.kind === 'recurring' ? ev.perSession.attendees : A) / ctx.members;
      points.push({ tone: 'info', text: ev.kind === 'recurring'
        ? `A typical session reaches ${U.fmtPct(Math.min(reach, 9.99))} of the society's ${U.fmtNum(ctx.members)} members.`
        : `${U.fmtNum(A)} people came, the equivalent of ${U.fmtPct(Math.min(reach, 9.99))} of the membership.` });
    }

    if (!A && (ev.ticketsSold === 0)) points.push({ tone: 'info', text: 'No attendance or ticket numbers for this event, so per-person figures are missing. Upload a sign-in sheet to see value per person.' });

    const r = I.RATINGS[rating];
    return { rating, label: r.label, tone: r.tone, headline, points, recs };
  };

  /** Membership fee needed to cover costs: (costs − other income) × (1 + buffer) ÷ members. */
  I.membershipFee = ({ costsToCover, otherIncome, members, buffer }) => {
    if (!members) return null;
    return Math.max(0, (costsToCover - (otherIncome || 0)) * (1 + (buffer || 0))) / members;
  };

  /**
   * Society-wide insights for a model (usually one financial year).
   * opts: { sym, openingBalance, allModel }
   * Returns [{ tone, title, text }]
   */
  I.society = function (model, opts) {
    const sym = opts.sym;
    const m = (n, o) => U.fmtMoney(n, sym, o);
    const s = M.summary(model);
    const out = [];
    if (!model.tx.length) return out;

    // 1. Overall result
    if (s.net >= 0) {
      const share = s.income ? s.net / s.income : 0;
      out.push({
        tone: share > 0.15 ? 'info' : 'good', title: 'Overall result',
        text: `Income ${m(s.income)}, spending ${m(s.spending)}: a surplus of ${m(s.net)}.` + (share > 0.15
          ? ` That's ${U.fmtPct(share)} of income. Unless you are saving for something (kit, a tour, a reserve), members could get more back through cheaper tickets or more subsidised sessions.`
          : ' A small surplus like this keeps the society safe without charging members more than needed.'),
      });
    } else {
      out.push({ tone: 'bad', title: 'Overall result', text: `Income ${m(s.income)}, spending ${m(s.spending)}: a deficit of ${m(-s.net)}. Check your reserves can cover it, and see the event ratings below for where money is going.` });
    }

    // 2. Membership value and fee
    if (s.members && s.avgFee) {
      const benefit = s.memberBenefit / s.members;
      out.push({
        tone: 'info', title: 'What members get for their fee',
        text: `${U.fmtNum(s.members)} members paid ${m(s.avgFee)} on average. Member benefits (subsidised activities plus general costs such as kit and insurance) came to ${m(benefit)} per member, ${benefit >= s.avgFee ? `${(benefit / s.avgFee).toFixed(1)}× what they paid` : `${U.fmtPct(benefit / s.avgFee)} of what they paid`}.`,
      });
      const needed = I.membershipFee({ costsToCover: s.spending - s.byStream.tickets, otherIncome: s.byStream.otherIncome, members: s.members, buffer: 0 });
      if (needed != null) {
        const diff = needed - s.avgFee;
        out.push({
          tone: Math.abs(diff) < 2 ? 'good' : diff > 0 ? 'bad' : 'info', title: 'Membership price check',
          text: Math.abs(diff) < 2
            ? `The current average fee (${m(s.avgFee)}) is about right: memberships cover what tickets and sponsorship don't.`
            : diff > 0
              ? `To break even overall with ${U.fmtNum(s.members)} members, the average fee would need to be ${m(needed)} (now ${m(s.avgFee)}). Alternatives: more sponsorship, or trimming the most subsidised activities. Try options in Plan → Membership price.`
              : `Memberships bring in more than needed to break even (the break-even fee is ${m(needed)}, now ${m(s.avgFee)}). You could lower the fee, add a cheaper tier, or fund more for members.`,
        });
      }
    }

    // 3. When people join
    const mem = model.tx.filter((t) => t.stream === 'memberships' && t.date);
    if (mem.length >= 10) {
      const early = mem.filter((t) => ['08', '09', '10'].includes(t.date.slice(5, 7))).length / mem.length;
      const late = mem.filter((t) => ['01', '02', '03', '04', '05', '06', '07'].includes(t.date.slice(5, 7))).length;
      out.push({
        tone: 'info', title: 'When people join',
        text: `${U.fmtPct(early)} of memberships were bought in Aug–Oct, so the Freshers' Fair drives the year.` + (late < mem.length * 0.15
          ? ` Only ${U.fmtNum(late)} joined after Christmas; a cheaper second-semester membership could bring in more.` : ''),
      });
    }

    // 4. Where income comes from
    if (s.income > 0) {
      const parts = M.STREAMS.filter((x) => x.kind === 'income' && s.byStream[x.key] > 0)
        .map((x) => `${x.label.toLowerCase()} ${U.fmtPct(s.byStream[x.key] / s.income)}`);
      let text = `Income came from ${parts.join(', ')}.`;
      const ticketEvents = model.events.filter((e) => e.ticketIncome > 0).sort((a, b) => b.ticketIncome - a.ticketIncome);
      if (ticketEvents.length >= 2 && s.byStream.tickets > 0) {
        const topShare = ticketEvents[0].ticketIncome / s.byStream.tickets;
        if (topShare >= 0.4) text += ` ${ticketEvents[0].name} alone brought ${U.fmtPct(topShare)} of ticket income, so a lot depends on one event going well.`;
      }
      if (!s.byStream.otherIncome) text += ' There is no sponsorship or grant income recorded. Students’ Union grants and local sponsors are worth applying for.';
      out.push({ tone: 'info', title: 'Where the money comes from', text });
    }

    // 5. Best and worst value events
    const rated = model.events.filter((e) => e.attendees > 0);
    if (rated.length >= 2) {
      const byValue = [...rated].sort((a, b) => b.netPerAttendee - a.netPerAttendee);
      const best = byValue[0], worst = byValue[byValue.length - 1];
      out.push({
        tone: 'info', title: 'Events: best and worst value',
        text: `Best: ${best.name} (${m(best.netPerAttendee, { signed: true })} per ${best.kind === 'recurring' ? 'attendance' : 'attendee'}). Most subsidised: ${worst.name} (${m(worst.netPerAttendee, { signed: true })}). Subsidies are fine when intended; check each event's purpose in the Events analysis.`,
      });
    }

    // 6. Cash low point
    if (opts.openingBalance != null && opts.openingBalance !== '') {
      const b = M.balanceSeries(model, 'month', opts.openingBalance, ...Object.values(M.window(model)));
      if (b.balance.length) {
        let lo = 0;
        b.balance.forEach((v, i) => { if (v < b.balance[lo]) lo = i; });
        out.push({
          tone: b.balance[lo] < 0 ? 'bad' : 'info', title: 'Cash low point',
          text: `The bank balance was lowest in ${b.periods[lo].label} at ${m(b.balance[lo])}.` + (b.balance[lo] < 0
            ? ' It went overdrawn, so bring income forward (earlier ticket sales, membership) or delay big payments.'
            : ' Keep an eye on this month next year when booking big deposits.'),
        });
      }
    }

    // 7. Year on year
    if (opts.allModel && model.fy !== 'all') {
      const i = opts.allModel.fys.indexOf(model.fy);
      if (i > 0) {
        const prevFy = opts.allModel.fys[i - 1];
        const prev = M.summary(M.build(opts.data, prevFy));
        const ch = (a, b) => (b ? U.fmtPct((a - b) / b, true) : 'n/a');
        out.push({
          tone: 'info', title: `Compared with ${prevFy}`,
          text: `Income ${ch(s.income, prev.income)}, spending ${ch(s.spending, prev.spending)}, members ${ch(s.members, prev.members)} (${U.fmtNum(prev.members)} → ${U.fmtNum(s.members)}).` +
            (M.fyBounds(model.fy, model.fyStart).end > new Date().toISOString().slice(0, 10) ? ' This year is not finished yet, so compare with care.' : ''),
        });
      }
    }

    // 8. Data gaps
    const noCost = model.events.filter((e) => e.income > 0 && e.costs === 0);
    const noPeople = model.events.filter((e) => e.costs > 0 && e.attendees === 0);
    if (noCost.length || noPeople.length) {
      const parts = [];
      if (noCost.length) parts.push(`${noCost.map((e) => e.name).slice(0, 3).join(', ')} ${noCost.length === 1 ? 'has' : 'have'} income but no costs recorded (missing receipts?)`);
      if (noPeople.length) parts.push(`${noPeople.map((e) => e.name).slice(0, 3).join(', ')} ${noPeople.length === 1 ? 'has' : 'have'} costs but no ticket or attendance numbers`);
      out.push({ tone: 'info', title: 'Gaps in the data', text: parts.join('; ') + '. Filling these in makes the per-person figures more accurate.' });
    }
    return out;
  };

  /** Compact facts for an AI summary (numbers only, no personal data). */
  I.factsForAI = function (model, opts) {
    const s = M.summary(model);
    const ctx = I.context(model, opts.sym);
    const r = (n) => (n == null || !isFinite(n) ? null : Math.round(n * 100) / 100);
    return {
      society: opts.societyName || 'the society',
      currency: opts.sym,
      period: model.fy === 'all' ? 'all years' : `financial year ${model.fy}`,
      totals: {
        income: r(s.income), spending: r(s.spending), surplus: r(s.net),
        income_by_stream: Object.fromEntries(M.STREAMS.filter((x) => x.kind === 'income').map((x) => [x.label, r(s.byStream[x.key])])),
        spending_by_stream: Object.fromEntries(M.STREAMS.filter((x) => x.kind === 'expense').map((x) => [x.label, r(s.byStream[x.key])])),
        members: s.members, average_membership_fee: r(s.avgFee), general_costs_not_tied_to_events: r(s.generalSpend),
      },
      events: model.events.map((e) => {
        const v = I.rateEvent(e, ctx);
        return {
          name: e.name, type: e.kind === 'recurring' ? `${e.frequency} (${e.sessionCount} sessions)` : 'one-off',
          purpose: M.GOALS[e.goal].label, income: r(e.income), costs: r(e.costs), net: r(e.net),
          attendees: e.attendees, avg_per_session: e.kind === 'recurring' ? r(e.perSession.attendees) : undefined,
          average_ticket_price: r(e.avgPrice), ticket_tiers: e.tiers.map((t) => ({ tier: t.name, sold: t.qty, avg_price: r(t.avgPrice) })),
          biggest_costs: e.costLines.slice(0, 3).map((c) => ({ item: c.name, amount: r(c.amount) })),
          attendance_trend: (() => { const t = I.trend(e); return t ? { first_sessions_avg: r(t.first), last_sessions_avg: r(t.last) } : undefined; })(),
          automatic_rating: v.label,
        };
      }),
      automatic_insights: I.society(model, opts).map((x) => `${x.title}: ${x.text}`),
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
