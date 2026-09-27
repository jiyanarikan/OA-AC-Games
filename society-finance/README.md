# Society Finance

A tool that saves a university society committee time on its finances. Upload the spreadsheets you already keep; it cleans them into one master dataset and turns that into charts, tables, event reviews, pricing advice, budgets and a ready-made annual report.

It is built for **societies, not businesses**. The goal is the best experience for members with sustainable finances, so every event is judged against its purpose: a fundraiser should make money, a social should roughly pay for itself, and training can be a member benefit the society chooses to fund.

## Using it

- **Easiest:** download [`dist/society-finance.html`](dist/society-finance.html) (one self-contained file) and double-click it. It works in Safari, Chrome, Edge or Firefox, with no install and no internet needed (except for the optional Claude summaries).
- **On a Mac with Safari:** on GitHub open `dist/society-finance.html`, click **Download raw file**, then double-click it in Downloads.
- **iPhone / iPad:** Safari won't run a page opened from the Files app, so the tool needs to be hosted online (e.g. GitHub Pages).
- **Try it first:** Settings → **Load demo data** (two years of a made-up hockey society), or upload the messy example files in [`samples/`](samples/).

Data is saved in the browser you use and never uploaded. Use **Settings → Download backup** to keep a copy, move computers or hand over to next year's committee.

## The five steps

The sidebar walks through the process in order.

1. **Add data.** Drop in any number of `.xlsx` / `.csv` files at once. Each sheet is detected as one of six types and cleaned (title rows, `£1,200.00` text, `(20.00)` negatives, UK/ISO/text/Excel dates, spelling variants such as `J. Morgan` / `J Morgan`, total rows, duplicates). You review each one before it's saved:
   - Memberships
   - Ticket sales
   - Other income (sponsorship, grants)
   - Expenses (event costs, kit, admin)
   - Coaching & hires
   - Attendance / sign-in sheets
2. **Check data.** The **master dataset**: every transaction combined and linked to events. It flags problems, suggests merging duplicate event names, and lets you set each event's **purpose** (fundraiser / break even / member benefit), its type (auto-detected one-off vs weekly/fortnightly/monthly), and its capacity.
3. **Analyse.** Choose an analysis. Every chart can be grouped by **week, month, term, quarter or year**, switches to a table, and downloads as Excel.
   - *Overview*: income vs spending, where money comes from and goes, key findings.
   - *Events*: a timeline of the year (recurring sessions vs one-off events), a reach-vs-value map, and ratings. Each event page adds per-session attendance and results or the ticket sales build-up, ticket tiers, cost breakdown, break-even, and suggestions on **pricing, frequency and costs**.
   - *Income*, *Spending*, *Cash flow & balance* (running bank balance, lowest point), *Memberships* (sign-ups over time, types, what members get back), *Coaching & hires* (per session / hour / person), *Compare years*.
4. **Plan.**
   - *Event budget planner*: planned vs actual, fixed/variable costs, break-even. It can start from a past event's actuals.
   - *Membership price calculator*: break-even fee, a price for each membership type, and a what-if table of members against fee.
   - *Next year's budget*: starts from last year's figures, editable event by event.
5. **Report.** A printable annual report (print or save as PDF) with committee comments, plus an Excel pack of every table.

### AI summaries (optional)
Each summary card offers:
- **Write with Claude:** needs an Anthropic API key, added in Settings. The key is stored in this browser only and is never included in backups.
- **Copy for Claude.ai:** copies the same prompt so you can paste it into claude.ai, with no key needed.

Only totals and per-event figures are sent, never member names. Automatic insights (no AI) are always shown alongside.

## Development
Plain HTML, CSS and JavaScript with no build step needed to run it.

```
index.html              app shell (sidebar + router)
js/schema.js            the six data types and column-name synonyms
js/cleaning.js          header detection, column matching, cleaning, de-duplication
js/master.js            master dataset, event detection (one-off/recurring), periods, aggregation
js/insights.js          society-focused ratings and recommendations
js/finance.js           event planner maths (net profit, break-even, variance)
js/charts.js            SVG charts (bars, lines, ranking, scatter, timeline, break-even)
js/ai.js                Claude summaries (bundled Anthropic SDK) + copy-for-Claude.ai
js/ui/*.js, js/app.js   pages and navigation
lib/                    ExcelJS 4.4.0 and the Anthropic TypeScript SDK (browser bundles, MIT)
tests/                  node --test tests/*.test.js
tools/build-single.js   rebuilds dist/society-finance.html after any change
tools/make-samples.js   regenerates samples/ (needs `npm install exceljs`)
```
