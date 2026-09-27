/*
 * Deliberately messy demo spreadsheets (title rows, £ text, mixed date
 * formats, inconsistent spellings, total rows, a duplicate) plus a demo event.
 * Used by "Load demo data" and by tools/make-samples.js.
 */
(function (root) {
  const SF = (root.SF = root.SF || {});

  function rng(seed) {
    let s = seed;
    return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  }

  const FIRST = ['Ava', 'Ben', 'Chloe', 'Dev', 'Ella', 'Finn', 'Grace', 'Hari', 'Isla', 'Jack', 'Kai', 'Lily', 'Max', 'Nina', 'Omar', 'Priya', 'Quinn', 'Rosa', 'Sam', 'Tom', 'Uma', 'Vik', 'Wren', 'Yusuf', 'Zara'];
  const LAST = ['Smith', 'Patel', 'Jones', 'Chen', 'Brown', 'Khan', 'Taylor', 'Wilson', 'Evans', 'Ahmed', 'Walker', 'Wright'];

  function ukDate(y, m, d, style) {
    const dd = String(d).padStart(2, '0'), mm = String(m).padStart(2, '0');
    const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
    if (style === 0) return `${dd}/${mm}/${y}`;
    if (style === 1) return `${d} ${mon} ${y}`;
    return `${y}-${mm}-${dd}`;
  }

  SF.demo = {
    sheets() {
      const r = rng(7);
      const pick = (arr) => arr[Math.floor(r() * arr.length)];

      // Memberships
      const types = [['Standard', 25], ['standard', 25], ['Social', 15], ['social ', 15], ['Competitive', 40], ['STANDARD', 25]];
      const mem = [['Hockey Society – membership sign-ups 2025/26'], [], ['Timestamp', 'Full Name', 'Student ID', 'Membership Type', 'Amount (£)', 'Payment type']];
      for (let i = 0; i < 64; i++) {
        const [t, price] = pick(types);
        const month = i < 40 ? 9 : i < 52 ? 10 : i < 58 ? 1 : 2;
        const y = month >= 8 ? 2025 : 2026;
        const d = 1 + Math.floor(r() * 27);
        mem.push([ukDate(y, month, d, i % 3), `${pick(FIRST)}  ${pick(LAST)}`, String(2400000 + Math.floor(r() * 99999)),
          t, i % 4 === 0 ? `£${price}.00` : price, pick(['Card', 'card', 'SU shop', 'Cash'])]);
      }
      mem.push(mem[10].slice()); // duplicate sign-up
      mem.push([], ['Total', null, null, null, '=SUM(E4:E68)', null]);

      // Ticket sales for two events
      const tix = [['Date', 'Event', 'Ticket type', 'Buyer', 'Price', 'Qty', 'Total paid']];
      const addSales = (event, tiers, month, y) => {
        for (const [tier, price, count] of tiers) {
          let left = count;
          while (left > 0) {
            const q = Math.min(left, 1 + Math.floor(r() * 3));
            left -= q;
            tix.push([ukDate(y, month, 1 + Math.floor(r() * 25), 0), event, tier, `${pick(FIRST)} ${pick(LAST)}`, `£${price.toFixed(2)}`, q, null]);
          }
        }
      };
      addSales('Winter Ball', [['Member', 32, 74], ['Non-member', 40, 31], ['member', 32, 4]], 11, 2025);
      addSales('Freshers Social', [['Entry', 5, 88]], 9, 2025);

      // Event costs
      const costs = [
        ['Winter Ball – receipts'],
        ['Date', 'Event', 'Item', 'Fixed/Variable', 'Supplier', 'Cost'],
        ['12/12/2025', 'Winter Ball', 'Venue hire', 'Fixed', 'Grand Hotel', '£1,200.00'],
        ['12/12/2025', 'Winter Ball', 'Three-course dinner', 'per head', 'Grand Hotel', '£2,071.00'],
        ['12/12/2025', 'Winter Ball', 'DJ', 'F', 'Beats Ltd', 350],
        ['01/12/2025', 'Winter Ball', 'Decorations', 'fixed', 'Party Co', '£185.40'],
        ['05/12/2025', 'Winter Ball', 'Photographer', 'Fixed', 'Snap Studio', '£220'],
        ['12/12/2025', 'Winter Ball', 'Welcome drink', 'Variable', 'Grand Hotel', '£327.00'],
        ['20/09/2025', 'Freshers Social', 'Bar tab deposit', 'Fixed', 'Union Bar', 150],
        ['20/09/2025', 'Freshers Social', 'Wristbands', 'Variable', 'Print Hub', '£44.00'],
        [],
        ['TOTAL', null, null, null, null, '£4,547.40'],
      ];

      // External hires
      const hires = [['Date', 'Coach', 'Service', 'Activity', 'Hours', 'Rate per hour', 'Total']];
      for (let w = 0; w < 18; w++) {
        const m = 9 + Math.floor(w / 4);
        const month = m > 12 ? m - 12 : m, y = m > 12 ? 2026 : 2025;
        hires.push([ukDate(y, month, 1 + (w % 4) * 7, 0), pick(['J. Morgan', 'J Morgan', 'Sarah Lee']), 'Training session', 'Weekly training', 2, '£35.00', null]);
      }
      hires.push(['10/12/2025', 'Sarah Lee', 'Umpiring', 'Winter Cup', 3, 30, null]);

      return [
        { file: 'memberships-2025-26.xlsx', sheet: 'Form responses', rows: mem, category: 'memberships' },
        { file: 'ticket-sales.xlsx', sheet: 'Orders', rows: tix, category: 'ticketSales' },
        { file: 'event-costs.xlsx', sheet: 'Receipts', rows: costs, category: 'eventCosts' },
        { file: 'coach-hires.xlsx', sheet: 'Invoices', rows: hires, category: 'externalHires' },
      ];
    },

    event(uid) {
      return {
        id: uid(), name: 'Winter Ball', date: '2025-12-12', linkName: 'Winter Ball',
        notes: 'Demo event. Planned in October, actuals filled in after the ball.',
        tickets: [
          { id: uid(), name: 'Member', price: 32, expectedQty: 90, actualQty: 78 },
          { id: uid(), name: 'Non-member', price: 40, expectedQty: 30, actualQty: 31 },
        ],
        plannedCosts: [
          { id: uid(), description: 'Venue hire', type: 'fixed', unitCost: 1200, qty: '', notes: 'Quote from Grand Hotel' },
          { id: uid(), description: 'DJ', type: 'fixed', unitCost: 300, qty: '', notes: '' },
          { id: uid(), description: 'Decorations', type: 'fixed', unitCost: 150, qty: '', notes: '' },
          { id: uid(), description: 'Three-course dinner', type: 'variable', unitCost: 18, qty: '', notes: '£18 per head' },
          { id: uid(), description: 'Welcome drink', type: 'variable', unitCost: 3, qty: '', notes: '' },
        ],
        actualCosts: [
          { id: uid(), description: 'Venue hire', type: 'fixed', unitCost: 1200, qty: '', notes: '' },
          { id: uid(), description: 'DJ', type: 'fixed', unitCost: 350, qty: '', notes: 'Extra hour booked on the night' },
          { id: uid(), description: 'Decorations', type: 'fixed', unitCost: 185.4, qty: '', notes: '' },
          { id: uid(), description: 'Photographer', type: 'fixed', unitCost: 220, qty: '', notes: 'Not in original plan' },
          { id: uid(), description: 'Three-course dinner', type: 'variable', unitCost: 19, qty: '', notes: 'Price rose to £19' },
          { id: uid(), description: 'Welcome drink', type: 'variable', unitCost: 3, qty: '', notes: '' },
        ],
      };
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
