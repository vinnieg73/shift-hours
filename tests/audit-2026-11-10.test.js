// Checks for the fixes of the 2026-11-10 review. Each one fails on 08276da (the page before the review).
// usage: node tests/audit-2026-11-10.test.js <base> <w> <h> <mobile 0/1> <scheme>
const { chromium } = require('playwright');
const [base = 'http://127.0.0.1:8832/', w = '402', h = '874', mobile = '1', scheme = 'light'] = process.argv.slice(2);
const R = []; const ok = (n, c, i) => R.push((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  [' + i + ']' : ''));
const HK = 'shift-hours-v1', PK = 'shift-hours-perdiem-v1';
const day = (s, e, brk = '') => ({ s: { v: s, ap: 'am' }, e: { v: e, ap: 'pm' }, brk, adj: 0 });
const blank = () => ({ s: { v: '', ap: 'am' }, e: { v: '', ap: 'pm' }, brk: '', adj: 0 });
const br = () => ({ min: '', s: { v: '', ap: 'pm' }, e: { v: '', ap: 'pm' } });
const hours = (start, week) => ({ fmt: '12', nBreaks: 0, breakMode: 'min', round: 0, roundBreaks: 1, start: { v: start, ap: 'am' }, end: { v: '500', ap: 'pm' }, liveAt: 0, live: false, outAt: 0, br: [br(), br(), br()], week });
const MINE = hours('800', [day('800', '400'), blank(), blank(), blank(), blank(), blank(), blank()]);
const THEIRS = hours('700', [day('700', '330', '30'), day('700', '330', '30'), day('700', '330', '30'), blank(), blank(), blank(), blank()]);
// Seattle, four days: every meal given on the day out, two on a full day, two on the day back
const TRIP = { sel: { t: 'p', st: 'WA', n: 'Seattle' }, ch: null, leave: '2027-04-12', back: '2027-04-15',
  given: { '2027-04-12': [true, true, true], '2027-04-13': [true, false, true], '2027-04-15': [false, true, true] } };

(async () => {
  const b = await chromium.launch();
  const mk = async (seed) => {
    const ctx = await b.newContext({ viewport: { width: +w, height: +h }, isMobile: mobile === '1', hasTouch: mobile === '1', colorScheme: scheme, serviceWorkers: 'block' });
    await ctx.route('**/beacon.min.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    if (seed) await ctx.addInitScript(S => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.clear(); Object.entries(S).forEach(([k, v]) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v))); } }, seed);
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console ' + m.text()); });
    return { ctx, p, errs };
  };
  const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k)), k);
  const typeNow = (p, v) => p.evaluate(v => { const i = document.getElementById('startIn'); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }, v);

  // ---- 1: a backup or move link made right after typing carries what was typed (the page saves on a short delay) ----
  {
    const A = await mk({ [HK]: MINE });
    await A.p.goto(base); await A.p.waitForTimeout(300);
    const got = await A.p.evaluate(() => { const i = document.getElementById('startIn'); i.value = '915'; i.dispatchEvent(new Event('input', { bubbles: true })); return window.__backup.bundle().hours.start.v; });
    ok('backup made straight after typing holds the new start time', got === '915', got);
    ok('and the typed time is already saved', (await stored(A.p, HK)).start.v === '915');
    ok('1: no page errors', !A.errs.length, A.errs.join(' | ')); await A.ctx.close();
  }

  // ---- 2: Replace wins over an edit still waiting to be saved (it used to be written back over the restored week on reload) ----
  {
    const A = await mk({ [HK]: MINE });
    await A.p.goto(base); await A.p.waitForTimeout(300);
    const link = await A.p.evaluate(async b => '#move=' + await window.__backup.encode(b), { app: 'shift-hours', v: 1, saved: '2026-11-09T20:00:00.000Z', hours: THEIRS, perdiem: null, view: 'hr' });
    await A.p.goto(base + link); await A.p.waitForFunction(() => !document.getElementById('inPanel').hidden, null, { timeout: 8000 });
    await typeNow(A.p, '1111'); // an edit with its save still pending
    await Promise.all([A.p.waitForNavigation({ waitUntil: 'load' }), A.p.evaluate(() => document.getElementById('inYes').click())]);
    await A.p.waitForTimeout(400);
    const s = await stored(A.p, HK);
    ok('Replace keeps the incoming week', s.week[1] && s.week[1].s.v === '700' && s.week[2].brk === '30', JSON.stringify(s.week.slice(0, 3).map(d => d && d.s.v)));
    ok('Replace keeps the incoming calculator shift', s.start.v === '700', s.start.v);
    ok('the page shows the incoming shift', (await A.p.inputValue('#startIn')) === '700', await A.p.inputValue('#startIn'));
    ok('2: no page errors', !A.errs.length, A.errs.join(' | ')); await A.ctx.close();
  }

  // ---- 3: meals given never take a day below its incidentals, and each day shows what really came off ----
  {
    const A = await mk({ [PK]: TRIP, 'shift-hours-view': 'pd' });
    await A.p.goto(base); await A.p.waitForFunction(() => window.__perdiem && window.__perdiem.core.data, null, { timeout: 20000 }); await A.p.waitForTimeout(300);
    const r = await A.p.evaluate(() => {
      const P = window.__perdiem, D = P.core.data, c = P.compute();
      return { err: c.err || '', total: c.total, hotel: c.hotel, off: c.off,
        days: c.days.map(x => ({ base: x.base, mie: x.mie, off: x.off, split: D.mie[x.m], given: x.given })),
        rows: [...document.querySelectorAll('#pdRows .drow')].map(e => ({ amt: e.querySelector('.dmie b').textContent, note: [...e.querySelectorAll('.dmie span')].map(s => s.textContent).join(' ') })),
        bd: document.getElementById('pdBreak').textContent, shown: document.getElementById('pdTotal').textContent };
    });
    ok('trip computed', !r.err && r.days.length === 4, r.err);
    const d = r.days, inc = d[0].split[3], usd = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const meals = x => x.given.reduce((s, g, j) => s + (g ? x.split[j] : 0), 0);
    ok('day out, every meal given: the incidentals are kept', inc > 0 && d[0].mie === inc && r.rows[0].amt === usd(inc), d[0].mie + ' / ' + r.rows[0].amt);
    ok('its row shows what really came off, not more than the day had', d[0].off === d[0].base - inc && r.rows[0].note.includes('−' + usd(d[0].off).replace(/\.00$/, '') + ' given'), r.rows[0].note);
    ok('a full day with two meals given is unchanged', d[1].mie === d[1].base - meals(d[1]) && d[1].off === meals(d[1]), d[1].mie);
    ok('a day with no meals given is unchanged', d[2].mie === d[2].base && d[2].off === 0 && !/given/.test(r.rows[2].note), r.rows[2].note);
    ok('day back, lunch and dinner given: never under the incidentals', d[3].mie >= inc && d[3].mie === Math.max(inc, d[3].base - meals(d[3])), d[3].mie);
    ok('every day keeps at least its incidentals', d.every(x => x.mie >= x.split[3]), d.map(x => x.mie).join(' '));
    const sumMie = d.reduce((s, x) => s + x.mie, 0), sumOff = d.reduce((s, x) => s + x.off, 0);
    ok('total = lodging + each day\'s M&IE', Math.abs(r.total - (r.hotel + sumMie)) < 1e-9 && r.shown.replace(/\s/g, '') === usd(r.total), r.shown);
    ok('the Meals given line matches the days', r.off === sumOff && r.bd.includes('−' + usd(sumOff)), r.bd);
    // ---- 4: a long line in the trip breakdown wraps; nothing is cut off with "…" ----
    const cut = await A.p.evaluate(() => [...document.querySelectorAll('#pdBreak dd:not(.amt)')].filter(e => e.scrollWidth > e.clientWidth + 1 || getComputedStyle(e).textOverflow === 'ellipsis').map(e => e.textContent));
    ok('no trip breakdown line is cut off', !cut.length, cut.join(' | '));
    const [sw, iw] = await A.p.evaluate(() => [document.scrollingElement.scrollWidth, innerWidth]);
    ok('no horizontal overflow (trip with meals given)', sw <= iw, sw + '/' + iw);
    ok('help says the incidentals are kept', await A.p.evaluate(() => /always keep that day's incidentals/.test(document.querySelector('#pdView details.help').textContent)));
    ok('3: no page errors', !A.errs.length, A.errs.join(' | ')); await A.ctx.close();
  }

  // ---- 5: leftovers are gone: the hidden week column header ----
  {
    const A = await mk(null);
    await A.p.goto(base); await A.p.waitForTimeout(200);
    ok('no hidden leftover week header', await A.p.evaluate(() => !document.querySelector('.wcols')));
    await A.ctx.close();
  }

  await b.close();
  console.log(R.join('\n'));
  process.exit(R.some(x => x.startsWith('FAIL')) ? 1 : 0);
})().catch(e => { console.log(R.join('\n')); console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
