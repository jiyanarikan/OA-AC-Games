/*
 * Demo data: two academic years of a made-up hockey society, as deliberately
 * messy spreadsheets (title rows, £ text, mixed date formats, inconsistent
 * spellings, total rows, a duplicate). Used by "Load demo data" and by
 * tools/make-samples.js to write the files in /samples.
 */
(function (root) {
  const SF = (root.SF = root.SF || {});

  function rng(seed) {
    let s = seed;
    return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  }

  const FIRST = ['Ava', 'Ben', 'Chloe', 'Dev', 'Ella', 'Finn', 'Grace', 'Hari', 'Isla', 'Jack', 'Kai', 'Lily', 'Max', 'Nina', 'Omar', 'Priya', 'Quinn', 'Rosa', 'Sam', 'Tom', 'Uma', 'Vik', 'Wren', 'Yusuf', 'Zara', 'Leo', 'Mia', 'Noah', 'Ivy', 'Theo'];
  const LAST = ['Smith', 'Patel', 'Jones', 'Chen', 'Brown', 'Khan', 'Taylor', 'Wilson', 'Evans', 'Ahmed', 'Walker', 'Wright', 'Hughes', 'Green', 'Hall'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAY = 86400000;

  const iso = (d) => new Date(d).toISOString().slice(0, 10);
  const addDays = (s, n) => iso(Date.parse(s) + n * DAY);
  function messyDate(s, style) {
    const [y, m, d] = s.split('-').map(Number);
    if (style === 0) return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
    if (style === 1) return `${d} ${MON[m - 1]} ${y}`;
    return s;
  }
  /** Weekly dates from start for n weeks, skipping given ISO dates. */
  function weekly(start, n, skip) {
    const out = [];
    for (let i = 0; out.length < n && i < n + 10; i++) {
      const d = addDays(start, i * 7);
      if (!(skip || []).includes(d)) out.push(d);
    }
    return out;
  }

  SF.demo = {
    sheets() {
      const r = rng(11);
      const pick = (arr) => arr[Math.floor(r() * arr.length)];
      const person = () => `${pick(FIRST)} ${pick(LAST)}`;
      const between = (a, b) => addDays(a, Math.floor(r() * (1 + (Date.parse(b) - Date.parse(a)) / DAY)));
      const YEARS = [
        { y: 2024, label: '2024-25', members: 96, types: [['Full', 35, 0.6], ['Social', 15, 0.4]] },
        { y: 2025, label: '2025-26', members: 112, types: [['Full', 38, 0.55], ['Social', 15, 0.3], ['Semester 2', 20, 0.15]] },
      ];

      // ---------- memberships: one sheet per year ----------
      const memSheets = YEARS.map((Y, yi) => {
        const rows = [[`Hockey Society – membership sign-ups ${Y.label}`], [], ['Timestamp', 'Full Name', 'Student ID', 'Membership Type', 'Amount (£)', 'Payment type']];
        for (let i = 0; i < Y.members; i++) {
          const x = r();
          let acc = 0, type = Y.types[0];
          for (const t of Y.types) { acc += t[2]; if (x <= acc) { type = t; break; } }
          const sem2 = type[0] === 'Semester 2';
          const when = sem2 ? between(`${Y.y + 1}-01-12`, `${Y.y + 1}-02-10`)
            : i < Y.members * 0.78 ? between(`${Y.y}-09-15`, `${Y.y}-10-12`) : between(`${Y.y}-10-13`, `${Y.y + 1}-02-20`);
          const spell = pick([type[0], type[0], type[0], type[0].toLowerCase(), type[0].toUpperCase() + ' ']);
          rows.push([messyDate(when, i % 3), person(), String(2400000 + yi * 100000 + Math.floor(r() * 99999)), spell,
            i % 4 === 0 ? `£${type[1]}.00` : type[1], pick(['Card', 'card', 'SU shop', 'SU Shop', 'Cash'])]);
        }
        rows.push(rows[12].slice()); // someone submitted twice
        rows.push([], ['Total', null, null, null, `=SUM(E4:E${rows.length})`, null]);
        return { file: 'memberships.xlsx', sheet: `${Y.label} sign-ups`, rows, category: 'memberships' };
      });

      // ---------- ticket sales ----------
      const tix = [['Order date', 'Event', 'Ticket type', 'Buyer', 'Price', 'Qty', 'Total paid']];
      const sale = (date, event, tier, price, qty) => tix.push([messyDate(date, tix.length % 3), event, tier, person(), `£${price.toFixed(2)}`, qty, null]);
      const sellOver = (event, tiers, from, to) => {
        for (const [tier, price, count] of tiers) {
          let left = count;
          while (left > 0) {
            const q = Math.min(left, 1 + Math.floor(r() * 2));
            left -= q;
            // skew sales toward the end of the window
            const f = Math.pow(r(), 0.55);
            const d = addDays(from, Math.floor(f * (Date.parse(to) - Date.parse(from)) / DAY));
            sale(d, event, tier, price, q);
          }
        }
      };

      // ---------- expenses ----------
      const exp = [['Receipts log'], ['Date', 'Event', 'Item', 'Fixed/Variable', 'Supplier', 'Cost']];
      const cost = (date, event, item, type, supplier, amount) => exp.push([messyDate(date, exp.length % 2), event, item, type, supplier, typeof amount === 'number' && exp.length % 3 === 0 ? `£${amount.toLocaleString('en-GB', { minimumFractionDigits: 2 })}` : amount]);

      // ---------- coaching / hires ----------
      const hires = [['Invoice date', 'Coach', 'Service', 'Activity', 'Hours', 'Rate per hour', 'Total']];

      // ---------- other income ----------
      const other = [['Date', 'From', 'Description', 'Event', 'Amount received']];

      // ---------- attendance (sign-in sheet) ----------
      const att = [['Date', 'Session', 'Name', 'Member?']];

      YEARS.forEach((Y, yi) => {
        const y = Y.y;
        // Wednesday training: 10 weeks each term, coach 2h + pitch hire. 2024/25 attendance fades; 2025/26 holds.
        const firstWed = (s) => { let d = s; while (new Date(d).getUTCDay() !== 3) d = addDays(d, 1); return d; };
        const autumn = weekly(firstWed(`${y}-10-01`), 10);
        const spring = weekly(firstWed(`${y + 1}-01-14`), 10);
        const sessions = autumn.concat(spring);
        sessions.forEach((d, i) => {
          hires.push([messyDate(d, i % 2), pick(['J. Morgan', 'J Morgan', 'J. Morgan']), 'Coaching', 'Wednesday Training', 2, i % 5 === 0 ? '£35.00' : 35, null]);
          cost(d, i % 4 === 0 ? 'wednesday training' : 'Wednesday Training', 'Pitch hire', 'Fixed', 'Sports Centre', 45);
          const base = yi === 0 ? 25 - i * 0.65 : 22 + Math.sin(i) * 2;
          const exam = (d.slice(5, 7) === '12' || (d.slice(5, 7) === '03' && +d.slice(8) > 12)) ? 0.6 : 1;
          const n = Math.max(5, Math.round(base * exam + (r() - 0.5) * 3));
          for (let k = 0; k < n; k++) att.push([messyDate(d, 0), 'Wednesday Training', person(), r() < 0.9 ? 'Member' : 'Guest']);
        });

        // Thursday social: £3 on the door, snacks, a DJ once a month.
        const thurs = weekly(addDays(autumn[0], 1), 10).concat(weekly(addDays(spring[0], 1), 10));
        thurs.forEach((d, i) => {
          const people = Math.round((yi === 0 ? 28 : 34) + i * 0.6 + (r() - 0.5) * 8);
          tix.push([messyDate(d, 2), 'Thursday Social', 'Door entry', 'Door sales', '£3.00', people, null]);
          cost(d, 'Thursday Social', 'Snacks', 'variable', 'Tesco', Math.round(people * 0.8 * 100) / 100);
          if (i % 4 === 0) cost(d, 'Thursday Social', 'DJ', 'Fixed', 'Beats Ltd', 60);
        });

        // Freshers Social (Sept, one-off)
        sellOver('Freshers Social', [['Entry', 5, yi === 0 ? 74 : 92]], `${y}-09-16`, `${y}-09-25`);
        cost(`${y}-09-26`, 'Freshers Social', 'Bar tab deposit', 'Fixed', 'Union Bar', 250);
        cost(`${y}-09-26`, 'Freshers Social', 'Wristbands', 'Variable', 'Print Hub', yi === 0 ? 37 : 46);

        // Winter Ball (Dec, one-off)
        const ball = `${y}-12-12`;
        const mem = yi === 0 ? 70 : 80, non = yi === 0 ? 26 : 31;
        sellOver('Winter Ball', [['Member', yi === 0 ? 30 : 32, mem], ['Non-member', yi === 0 ? 36 : 40, non]], `${y}-11-01`, `${y}-12-10`);
        cost(`${y}-10-20`, 'Winter Ball', 'Venue hire', 'Fixed', 'Grand Hotel', 400);
        cost(ball, 'Winter Ball', 'Venue hire', 'Fixed', 'Grand Hotel', 800);
        cost(ball, 'Winter Ball', 'Three-course dinner', 'per head', 'Grand Hotel', (mem + non) * (yi === 0 ? 18 : 19));
        cost(ball, 'Winter Ball', 'DJ', 'F', 'Beats Ltd', 350);
        cost(`${y}-12-01`, 'Winter Ball', 'Decorations', 'fixed', 'Party Co', 185.4);
        if (yi === 1) cost(`${y}-12-05`, 'Winter Ball', 'Photographer', 'Fixed', 'Snap Studio', 220);
        cost(ball, 'Winter Ball', 'Welcome drink', 'Variable', 'Grand Hotel', (mem + non) * 3);

        // Spring Tour (March, one-off, members only)
        const tourN = yi === 0 ? 26 : 22;
        sellOver('Spring Tour', [['Member', 120, tourN]], `${y + 1}-01-20`, `${y + 1}-02-28`);
        cost(`${y + 1}-03-14`, 'Spring Tour', 'Coach travel', 'Fixed', 'Smiths Coaches', 1650);
        cost(`${y + 1}-03-14`, 'Spring Tour', 'Hostel', 'Variable', 'City Hostel', tourN * 38);
        cost(`${y + 1}-03-02`, 'Spring Tour', 'Tournament entry', 'Fixed', 'Hockey Festival', 250);

        // Charity quiz (Feb 2026 only) - a fundraiser
        if (yi === 1) {
          sellOver('Charity Quiz', [['Team ticket', 4, 64]], '2026-02-02', '2026-02-18');
          cost('2026-02-19', 'Charity Quiz', 'Prizes', 'Fixed', 'Amazon', 40);
        }

        // League matches: umpires fortnightly on Saturdays
        const sat = weekly(addDays(autumn[0], 3), 8).filter((_, i) => i % 2 === 0).concat(weekly(addDays(spring[0], 3), 8).filter((_, i) => i % 2 === 0));
        sat.forEach((d) => hires.push([messyDate(d, 1), 'Sarah Lee', 'Umpiring', 'League Matches', 3, 30, null]));

        // General running costs (no event)
        cost(`${y}-09-05`, '', 'League affiliation fees', 'Fixed', 'England Hockey', 320);
        cost(`${y}-09-10`, '', 'Insurance', 'Fixed', 'Sports Cover', 150);
        cost(`${y}-10-02`, '', yi === 0 ? 'First aid kit' : 'New team kit', 'Fixed', yi === 0 ? 'St John' : 'KitCo', yi === 0 ? 45 : 850);

        // Sponsorship & grants
        other.push([messyDate(`${y}-10-15`, 0), 'The Red Lion', 'Shirt sponsorship', '', '£600.00']);
        other.push([messyDate(`${y}-11-20`, 1), "Students' Union", 'Club development grant', '', yi === 0 ? 400 : 450]);
        if (yi === 1) other.push([messyDate('2026-03-01', 0), 'Hockey Festival', 'Tour travel bursary', 'Spring Tour', 300]);
      });

      exp.push([], ['TOTAL', null, null, null, null, 'see above']);

      return [
        ...memSheets,
        { file: 'ticket-sales.xlsx', sheet: 'Orders', rows: tix, category: 'ticketSales' },
        { file: 'expenses.xlsx', sheet: 'Receipts', rows: exp, category: 'eventCosts' },
        { file: 'coach-invoices.xlsx', sheet: 'Invoices', rows: hires, category: 'externalHires' },
        { file: 'sponsorship-and-grants.xlsx', sheet: 'Income', rows: other, category: 'otherIncome' },
        { file: 'training-register.csv', sheet: 'Register', rows: att, category: 'attendance' },
      ];
    },

    /** Purposes/capacities a committee would set in "Check data". */
    meta() {
      return {
        'charity quiz': { goal: 'fundraiser' },
        'winter ball': { capacity: 120 },
        'thursday social': { capacity: 60 },
      };
    },

    /** A planned event for the budget planner (Winter Ball 2025). */
    event(uid) {
      return {
        id: uid(), name: 'Winter Ball 2025', date: '2025-12-12', linkName: 'Winter Ball',
        notes: 'Demo plan made in October; actuals pulled in after the ball.',
        tickets: [
          { id: uid(), name: 'Member', price: 32, expectedQty: 90, actualQty: '' },
          { id: uid(), name: 'Non-member', price: 40, expectedQty: 30, actualQty: '' },
        ],
        plannedCosts: [
          { id: uid(), description: 'Venue hire', type: 'fixed', unitCost: 1200, qty: '', notes: 'Quote from Grand Hotel' },
          { id: uid(), description: 'DJ', type: 'fixed', unitCost: 300, qty: '', notes: '' },
          { id: uid(), description: 'Decorations', type: 'fixed', unitCost: 150, qty: '', notes: '' },
          { id: uid(), description: 'Three-course dinner', type: 'variable', unitCost: 18, qty: '', notes: '£18 per head' },
          { id: uid(), description: 'Welcome drink', type: 'variable', unitCost: 3, qty: '', notes: '' },
        ],
        actualCosts: [],
      };
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
