// Checks for the fixes of the 2026-11-19 sweep. Blocks 1 to 5 each have a check that fails on fa7e695 (the page before the sweep).
// usage: node tests/sweep-2026-11-19.test.js <base> <w> <h> <mobile 0/1> <scheme>
process.env.TZ = 'America/New_York'; // the date below is a wall-clock time there, like the browser's timezoneId
const { chromium } = require('playwright');
const [base = 'http://127.0.0.1:8832/', w = '402', h = '874', mobile = '1', scheme = 'light'] = process.argv.slice(2);
const R = []; const ok = (n, c, i) => R.push((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  [' + i + ']' : ''));
const HK = 'shift-hours-v1';
const blank = () => ({ s: { v: '', ap: 'am' }, e: { v: '', ap: 'pm' }, brk: '', adj: 0 });
const br = () => ({ min: '', s: { v: '', ap: 'pm' }, e: { v: '', ap: 'pm' } });
const hours = (start) => ({ fmt: '12', nBreaks: 0, breakMode: 'min', round: 0, roundBreaks: 1, start: { v: start, ap: 'am' }, end: { v: '500', ap: 'pm' }, liveAt: 0, live: false, outAt: 0, br: [br(), br(), br()], week: Array.from({ length: 7 }, blank) });

(async () => {
  const b = await chromium.launch();
  const mk = async (seed, o = {}) => {
    const ctx = await b.newContext({ viewport: { width: o.w || +w, height: +h }, isMobile: mobile === '1', hasTouch: mobile === '1', colorScheme: scheme, serviceWorkers: 'block', timezoneId: 'America/New_York' });
    await ctx.route('**/beacon.min.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    if (seed) await ctx.addInitScript(S => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.clear(); Object.entries(S).forEach(([k, v]) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v))); } }, seed);
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console ' + m.text()); });
    if (o.clock) await p.clock.install({ time: o.clock });
    return { ctx, p, errs };
  };
  const T = (p, sel) => p.$eval(sel, e => e.textContent.trim());
  const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k)), k);

  // ---- 1: a page left open past midnight: the Add key names the day it will really add to ----
  {
    const A = await mk({ [HK]: hours('900') }, { clock: new Date('2026-11-18T23:50:00') }); // a Wednesday night
    await A.p.goto(base); await A.p.waitForTimeout(200);
    ok('before midnight the key says Add to Wed', (await T(A.p, '#addWeek')) === 'Add to Wed', await T(A.p, '#addWeek'));
    await A.p.clock.runFor(15 * 60e3); await A.p.waitForTimeout(100);
    ok('after midnight the key says Add to Thu', (await T(A.p, '#addWeek')) === 'Add to Thu', await T(A.p, '#addWeek'));
    ok('and its spoken label says Thursday', /Thursday/.test(await A.p.getAttribute('#addWeek', 'aria-label')), await A.p.getAttribute('#addWeek', 'aria-label'));
    await A.p.evaluate(() => document.getElementById('addWeek').click()); await A.p.clock.runFor(400);
    const s = await stored(A.p, HK);
    ok('the shift lands on Thursday, the day the key named', s.week[3].s.v === '900' && !s.week[2].s.v, JSON.stringify(s.week.map(d => d.s.v)));
    ok('1: no page errors', !A.errs.length, A.errs.join(' | ')); await A.ctx.close();
  }

  // ---- 2: two saves from another tab a moment apart: this tab shows the second one too ----
  {
    const A = await mk({ [HK]: hours('800') });
    await A.p.goto(base); await A.p.waitForTimeout(400);
    const B = await A.ctx.newPage(); await B.goto(base); await B.waitForTimeout(400);
    await B.evaluate(([k, one, two]) => new Promise(res => { localStorage.setItem(k, one); setTimeout(() => { localStorage.setItem(k, two); res(); }, 60); }), [HK, JSON.stringify(hours('915')), JSON.stringify(hours('1030'))]);
    await A.p.waitForTimeout(500);
    ok('the first tab shows the other tab\'s second save', (await A.p.inputValue('#startIn')) === '1030', await A.p.inputValue('#startIn'));
    ok('and nothing was written back over it', (await stored(A.p, HK)).start.v === '1030', (await stored(A.p, HK)).start.v);
    // this tab's own unsaved edit still wins over a save that arrives while it waits to be written
    await A.p.evaluate(() => { const i = document.getElementById('startIn'); i.value = '745'; i.dispatchEvent(new Event('input', { bubbles: true })); });
    await B.evaluate(([k, v]) => localStorage.setItem(k, v), [HK, JSON.stringify(hours('1200'))]);
    await A.p.waitForTimeout(500);
    ok('an edit waiting to be saved still wins', (await A.p.inputValue('#startIn')) === '745' && (await stored(A.p, HK)).start.v === '745', (await A.p.inputValue('#startIn')) + ' / ' + (await stored(A.p, HK)).start.v);
    ok('2: no page errors', !A.errs.length, A.errs.join(' | ')); await A.ctx.close();
  }

  // ---- 3: the three tabs show their whole names on the narrowest phones (320px) ----
  {
    const A = await mk(null, { w: 320 });
    await A.p.goto(base); await A.p.waitForTimeout(300);
    const cut = await A.p.$$eval('#viewSeg button', l => l.filter(x => x.scrollWidth > x.clientWidth).map(x => x.textContent + ' ' + x.scrollWidth + '>' + x.clientWidth));
    ok('Hours, Per diem and Months are not cut off at 320px', !cut.length, cut.join(', '));
    ok('and the page does not scroll sideways', await A.p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    ok('3: no page errors', !A.errs.length, A.errs.join(' | ')); await A.ctx.close();
  }

  // ---- 4: the help calls the week what the page calls it ----
  {
    const A = await mk();
    await A.p.goto(base); await A.p.waitForTimeout(200);
    const help = await T(A.p, '#howDisc'), title = await T(A.p, '#weekTitle');
    ok('the card is the Weekly timecard and the help says timecard too', title === 'Weekly timecard' && /weekly timecard/.test(help) && !/timesheet/i.test(help), title);
    // names with no style and no reader were removed; the page still draws the same parts
    ok('leftover names are gone', await A.p.evaluate(() => !document.querySelector('.brkx, .mmonth, .pv, li.src, #pdTripOut')));
    ok('4: no page errors', !A.errs.length, A.errs.join(' | ')); await A.ctx.close();
  }

  // ---- 5: a first visit is blank all the way: picking a break shows an empty box, not a made-up 30 minutes ----
  {
    const A = await mk();
    await A.p.goto(base); await A.p.evaluate(() => localStorage.clear()); await A.p.reload(); await A.p.waitForTimeout(200);
    await A.p.evaluate(() => { const i = document.getElementById('startIn'), o = document.getElementById('endIn'); i.value = '900'; i.dispatchEvent(new Event('input', { bubbles: true })); o.value = '500'; o.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#breakCount button[data-n="1"]').click(); });
    ok('first visit, one break: the minutes box is empty', (await A.p.inputValue('#bmin0')) === '' && (await A.p.getAttribute('#bmin0', 'placeholder')) === '30', await A.p.inputValue('#bmin0'));
    ok('and nothing is taken off the shift', (await T(A.p, '#hm')).startsWith('8.00'), await T(A.p, '#hm'));
    await A.p.evaluate(() => document.querySelector('#breakMode button[data-m="time"]').click());
    ok('as start and end, both break times are empty too', (await A.p.inputValue('#bs0')) === '' && (await A.p.inputValue('#be0')) === '', (await A.p.inputValue('#bs0')) + '/' + (await A.p.inputValue('#be0')));
    ok('5: no page errors', !A.errs.length, A.errs.join(' | ')); await A.ctx.close();
  }

  await b.close();
  console.log(R.join('\n'));
  process.exit(R.some(x => x.startsWith('FAIL')) ? 1 : 0);
})().catch(e => { console.log(R.join('\n')); console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
