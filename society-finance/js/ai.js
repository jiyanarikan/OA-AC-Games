/*
 * AI summaries with Claude. Two routes:
 *  1. "Write with Claude": calls the Claude API from the browser with the
 *     committee's own API key (kept in this browser only, never in backups).
 *  2. "Copy for Claude.ai": copies the same prompt so it can be pasted into
 *     claude.ai with no API key.
 * Only aggregated figures are sent (totals, events, ticket tiers) - never
 * member names or individual transactions.
 */
(function (root) {
  const SF = (root.SF = root.SF || {});
  const U = SF.util, S = SF.store, K = SF.kit, I = SF.insights;
  const el = U.el;
  const A = (SF.ai = {});

  const KEY_STORE = 'society-finance-claude-key';
  const MODEL = 'claude-opus-5';

  A.getKey = () => { try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; } };
  A.setKey = (k) => { try { if (k) localStorage.setItem(KEY_STORE, k.trim()); else localStorage.removeItem(KEY_STORE); } catch (e) { /* private mode */ } };

  const SYSTEM = [
    'You help the committee of a UK university student society understand its finances.',
    'A society is not a business: its main goal is the best possible experience for members, with finances that are sustainable (roughly breaking even while keeping a modest reserve). Money-making events are welcome, but subsidising member activities on purpose is legitimate.',
    'Judge each event against its stated purpose: a fundraiser should make money, a break-even event should roughly pay for itself, and a member benefit (e.g. training) is judged on value per person and whether attendance holds up.',
    'Use only the figures provided. Do not invent numbers. Quote amounts with the currency symbol given. Be specific and practical: name the event, the number, and the change you suggest.',
    'Write in plain British English for students who are not finance experts. Use short "## " headings and "- " bullet points. No tables.',
  ].join(' ');

  function taskFor(scope, event) {
    if (scope === 'event') {
      return `Write a short review of the event "${event.name}" for the committee (under 250 words):
## Verdict
Is it good or bad for the society financially, judged against its purpose? One or two sentences.
## Why
The 2-4 numbers that matter most.
## What to change
Concrete suggestions on pricing strategy (use the ticket tiers), how often to run it (use the session and attendance trend if it is recurring), and costs (use the biggest cost items). Say which change would matter most.`;
    }
    return `Write a financial summary for the committee (under 450 words):
## Headline
Three sentences on how the year went for the society.
## Events
For each event, one bullet: good or bad for the society financially (judged against its purpose), and the single most useful change (frequency, pricing, or costs).
## Membership price
Is the membership fee about right given what members get back? Suggest a figure if it should change.
## Top three actions for next year
The three changes that would do the most for members and the society's finances.
## Risks
Anything the committee should watch (dependence on one event, cash, falling attendance).`;
  }

  A.buildPrompt = function (scope, model, event) {
    const facts = I.factsForAI(model, { sym: K.sym(), societyName: S.data.settings.societyName, openingBalance: S.data.settings.openingBalance, allModel: SF.app.model('all'), data: S.data });
    if (scope === 'event' && event) {
      const ev = facts.events.find((x) => x.name === event.name);
      const extra = {
        per_session: event.kind === 'recurring' ? event.sessions.map((s) => ({ date: s.date, people: s.attendees, income: Math.round(s.income), costs: Math.round(s.costs) })) : undefined,
        ticket_sales_timeline: event.kind === 'oneoff' && event.salesCurve ? event.salesCurve.map((p) => ({ days_before_event: p.daysBefore, sold_so_far: p.cumulative })) : undefined,
        capacity: event.capacity || undefined,
        automatic_suggestions: I.rateEvent(event, I.context(model, K.sym())).recs.map((r) => `${r.area}: ${r.text}`),
      };
      return `${taskFor('event', event)}\n\nEvent data (JSON):\n${JSON.stringify({ ...ev, ...extra }, null, 1)}\n\nSociety context (JSON):\n${JSON.stringify({ society: facts.society, currency: facts.currency, period: facts.period, totals: facts.totals }, null, 1)}`;
    }
    return `${taskFor(scope)}\n\nData for ${facts.period} (JSON):\n${JSON.stringify(facts, null, 1)}`;
  };

  const storeKey = (scope, model, event) => `${scope}|${model.fy}${event ? '|' + event.key : ''}`;

  /** Minimal, safe markdown: ## headings, - bullets, **bold**. */
  A.render = function (text) {
    const out = el('div', { class: 'ai-text' });
    let list = null;
    const inline = (line) => {
      const frag = document.createDocumentFragment();
      line.split(/(\*\*[^*]+\*\*)/g).forEach((part) => {
        if (/^\*\*[^*]+\*\*$/.test(part)) frag.appendChild(el('strong', null, part.slice(2, -2)));
        else if (part) frag.appendChild(document.createTextNode(part));
      });
      return frag;
    };
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line) { list = null; continue; }
      if (/^#{1,4}\s/.test(line)) { list = null; out.appendChild(el('h3', null, line.replace(/^#+\s*/, ''))); continue; }
      if (/^[-*•]\s/.test(line)) {
        if (!list) { list = el('ul'); out.appendChild(list); }
        list.appendChild(el('li', null, inline(line.replace(/^[-*•]\s*/, ''))));
        continue;
      }
      list = null;
      out.appendChild(el('p', null, inline(line)));
    }
    return out;
  };

  async function generate(scope, model, event, outHost, statusEl, btn) {
    const key = A.getKey();
    if (!key) return;
    if (!root.Anthropic) { statusEl.textContent = 'The Claude library did not load (lib/anthropic-sdk.min.js is missing).'; return; }
    const Anthropic = root.Anthropic;
    const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
    btn.disabled = true;
    statusEl.textContent = 'Claude is reading your figures…';
    let text = '';
    try {
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: SYSTEM,
        messages: [{ role: 'user', content: A.buildPrompt(scope, model, event) }],
      });
      for await (const ev of stream) {
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
          text += ev.delta.text;
          U.clear(outHost).appendChild(A.render(text));
          statusEl.textContent = 'Writing…';
        }
      }
      const msg = await stream.finalMessage();
      if (msg.stop_reason === 'refusal') {
        statusEl.textContent = 'Claude declined this request. Try the “Copy for Claude.ai” option instead.';
        return;
      }
      text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim() || text;
      S.data.aiSummaries[storeKey(scope, model, event)] = { text, at: new Date().toISOString() };
      S.save();
      U.clear(outHost).appendChild(A.render(text));
      statusEl.textContent = `Written by Claude just now. Check the figures before sharing.`;
    } catch (err) {
      console.error(err);
      if (err instanceof Anthropic.AuthenticationError) statusEl.textContent = 'That API key was not accepted. Check it in Settings.';
      else if (err instanceof Anthropic.RateLimitError) statusEl.textContent = 'Claude is busy or your account hit its limit. Try again in a minute.';
      else if (err instanceof Anthropic.APIConnectionError) statusEl.textContent = 'Couldn’t reach Claude. Check you are online, or use “Copy for Claude.ai”.';
      else if (err instanceof Anthropic.APIError) statusEl.textContent = `Claude returned an error (${err.status || 'unknown'}): ${err.message}`;
      else statusEl.textContent = 'Something went wrong: ' + (err.message || err);
    } finally {
      btn.disabled = false;
    }
  }

  async function copyPrompt(scope, model, event, statusEl, fallbackHost) {
    const prompt = `${SYSTEM}\n\n${A.buildPrompt(scope, model, event)}`;
    try {
      await navigator.clipboard.writeText(prompt);
      statusEl.textContent = 'Copied. Open claude.ai, paste it into a new chat, and send.';
    } catch (e) {
      U.clear(fallbackHost).appendChild(el('textarea', { class: 'prompt-box', rows: 8, readonly: true, 'aria-label': 'Prompt to copy' }, prompt));
      fallbackHost.querySelector('textarea').select();
      statusEl.textContent = 'Your browser blocked copying. Select all the text below and copy it.';
    }
  }

  /** The AI summary card used on Overview, event pages and the report. */
  A.card = function ({ scope, model, event, compact }) {
    const saved = S.data.aiSummaries[storeKey(scope, model, event)];
    const c = K.card({
      cls: 'ai-card', title: event ? 'AI review of this event' : 'AI summary',
      desc: 'A written summary from Claude: whether events are good or bad for the society, and what to change about frequency, pricing and costs. Only totals and event figures are shared, never member names.',
    });
    const outHost = el('div', { class: 'ai-out' });
    const status = el('p', { class: 'status', role: 'status' });
    const fallback = el('div');
    if (saved) {
      outHost.appendChild(A.render(saved.text));
      status.textContent = `Written by Claude on ${new Date(saved.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}. Figures may have changed since.`;
    }
    const hasKey = !!A.getKey();
    const writeBtn = el('button', { class: 'btn primary', disabled: !hasKey || null, onclick: () => generate(scope, model, event, outHost, status, writeBtn) }, K.icon('sparkle'), saved ? 'Rewrite with Claude' : 'Write with Claude');
    const copyBtn = el('button', { class: 'btn', onclick: () => copyPrompt(scope, model, event, status, fallback) }, 'Copy for Claude.ai');
    c.body.append(
      el('div', { class: 'row wrap ai-actions' }, writeBtn, copyBtn,
        hasKey ? null : el('span', { class: 'hint' }, 'To write it here, add an Anthropic API key in ', el('a', { href: '#/settings' }, 'Settings'), '. Or copy the prompt into claude.ai for free.')),
      status, fallback, outHost);
    if (compact && !saved) outHost.hidden = true;
    return c.el;
  };
})(typeof window !== 'undefined' ? window : globalThis);
