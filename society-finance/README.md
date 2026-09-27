# Society Finance

A browser tool to help a university society committee put its financial reports together with less work: it cleans the spreadsheets you already have, and plans and reviews individual events.

**To use it:** open `index.html` in Chrome, Edge, Firefox or Safari. You don't need to install anything or be online. Your data stays in that browser; use **Settings → Download backup** to keep a copy or hand it to the next committee.

To try it quickly, go to **Settings → Load demo data**, or import the messy example workbooks in [`samples/`](samples/).

## What it does so far

### 1. Clean and store data (Data tab)
Upload an `.xlsx` or `.csv` file. The tool:
- **detects the category**: membership purchases, event costs, external hires (coaches, instructors) or ticket sales
- **finds the heading row**, even under a title or blank rows, and **matches your columns** to the fields it needs (you can change any match)
- **cleans** the data: reads `£1,200.00` / `(20.00)` / `Free` as numbers, converts UK, ISO and text dates (plus Excel date numbers) to one date format, trims extra spaces, merges spelling variants (`standard`, `STANDARD ` → `Standard`), drops total, blank and unreadable rows, and can remove duplicates
- **works out missing values**: amount = price × quantity, or hours × rate
- **tags each record with its financial year** (the start month is set in Settings; August by default)
- shows a **cleaning report** listing every change and every row it left out, with the reason, before you save
- skips rows that are already stored, so uploading the same file twice doesn't double-count
- keeps an import history with **Undo**, and exports any category or year back to Excel

### 2. Event finance: plan and track (Events tab)
For each event:
- **Ticket sales**: one row per price tier, with expected and actual sales, and income worked out from them
- **Planned costs (before the event)** and **Actual costs (after the event)**, each split into
  - **Fixed** costs, which stay the same however many people come (venue, DJ, coach fee)
  - **Variable** costs, which change with the number of attendees (food, wristbands). Leave Qty blank and it uses the attendee count.
- **Fill actual sales from imported data** and **Add costs from imported data** pull in records from the Data tab whose event name matches
- **Analysis**
  - net profit (planned, actual and the difference), margin, cost per attendee
  - planned vs actual for each metric and for each cost line (overspends, savings, unplanned costs)
  - **break-even**: fixed costs ÷ (average ticket price − variable cost per attendee), with margin of safety, the ticket price needed to break even at the expected attendance, and a cost/income chart
  - key findings written in plain English
- **Export to Excel**: summary, ticket sales and cost sheets, with working formulas
- **Duplicate as new plan**: start next year's event from this year's plan

## Planned next
- Annual report: combine the stored data by financial year (income vs spend, membership trends, event performance, charts)
- Pricing and budget recommendations for future membership prices and event budgets

## Development
Plain HTML, CSS and JavaScript with no build step. Everything the app needs to run is in the repo; ExcelJS 4.4.0 (MIT licence) is bundled in `lib/`.

```
index.html          app shell
css/app.css         styles (light + dark)
js/schema.js        data categories and column-name synonyms
js/cleaning.js      header detection, column mapping, cleaning, de-duplication
js/finance.js       net profit, break-even, variance, findings
js/charts.js        SVG charts
js/ui-*.js, app.js  screens
tests/              node --test tests/*.test.js
tools/              make-samples.js regenerates samples/ (needs `npm install exceljs`)
```
