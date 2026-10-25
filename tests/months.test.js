// Months tab: working hours in each month (8 per Monday to Friday, federal holidays marked and still counted).
// usage: node months.test.js <base> <w> <h> <mobile 0/1> <scheme>
const { chromium } = require('playwright');
const [base = 'http://127.0.0.1:8832/', w = '402', h = '874', mobile = '1', scheme = 'light'] = process.argv.slice(2);
const results = [];
const ok = (name, cond, info) => results.push((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  [' + info + ']' : ''));

// OPM's published observed federal holidays (opm.gov/policy-data-oversight/pay-leave/federal-holidays), month/day
const OPM = {
  2021: '1/1 1/18 2/15 5/31 6/18 7/5 9/6 10/11 11/11 11/25 12/24 12/31',
  2022: '1/17 2/21 5/30 6/20 7/4 9/5 10/10 11/11 11/24 12/26',
  2023: '1/2 1/16 2/20 5/29 6/19 7/4 9/4 10/9 11/10 11/23 12/25',
  2024: '1/1 1/15 2/19 5/27 6/19 7/4 9/2 10/14 11/11 11/28 12/25',
  2025: '1/1 1/20 2/17 5/26 6/19 7/4 9/1 10/13 11/11 11/27 12/25',
  2026: '1/1 1/19 2/16 5/25 6/19 7/3 9/7 10/12 11/11 11/26 12/25',
  2027: '1/1 1/18 2/15 5/31 6/18 7/5 9/6 10/11 11/11 11/25 12/24 12/31',
  2028: '1/17 2/21 5/29 6/19 7/4 9/4 10/9 11/10 11/23 12/25',
};

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, isMobile: mobile === '1', hasTouch: mobile === '1', colorScheme: scheme, permissions: ['clipboard-read', 'clipboard-write'], serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console ' + m.text()); });
  await p.route(/beacon\.min\.js|fonts\.googleapis|fonts\.gstatic/, r => r.abort());
  await p.clock.setFixedTime(new Date('2026-10-25T09:00:00'));
  await p.goto(base); await p.evaluate(() => localStorage.clear());
  await p.goto(base + '#months'); await p.waitForTimeout(400);
  const T = sel => p.$eval(sel, e => e.textContent.trim());
  const tap = async sel => { await p.waitForTimeout(150); return mobile === '1' ? p.tap(sel) : p.click(sel); };
  const vis = sel => p.$eval(sel, e => !e.hidden && e.offsetParent !== null);

  // opening on #months
  ok('#months opens the Months view', await vis('#moView') && !(await vis('#hrView')) && !(await vis('#pdView')));
  ok('Months tab pressed', (await p.$eval('#viewSeg [data-v="mo"]', e => e.getAttribute('aria-pressed'))) === 'true');
  ok('clock format hidden on Months', await p.$eval('.fmtbox', e => getComputedStyle(e).visibility === 'hidden' || getComputedStyle(e).display === 'none'));
  ok('opens on this month', (await T('#moName')) === 'October 2026', await T('#moName'));
  ok('October 2026 = 176 hrs', (await T('#moHrs')).startsWith('176'), await T('#moHrs'));
  ok('22 workdays line', (await T('#moDays')) === '22 workdays × 8 hrs', await T('#moDays'));
  ok('1 holiday line', (await T('#moHol')) === 'includes 1 holiday', await T('#moHol'));
  ok('This month key hidden on this month', !(await vis('#moToday')));
  const cal = await p.$$eval('#moCal .d', ds => ({ blanks: ds.filter(d => !d.textContent).length, days: ds.filter(d => d.textContent).length, work: ds.filter(d => d.classList.contains('w')).length, hol: ds.filter(d => d.classList.contains('h')).map(d => d.textContent), now: ds.filter(d => d.classList.contains('now')).map(d => d.textContent) }));
  ok('calendar: Monday first (Oct 1 is a Thursday, 3 blanks)', cal.blanks === 3, cal.blanks);
  ok('calendar: 31 days, 22 in boxes', cal.days === 31 && cal.work === 22, cal.days + '/' + cal.work);
  ok('calendar: Columbus Day dot on 12', cal.hol.join() === '12', cal.hol.join());
  ok('calendar: today is 25', cal.now.join() === '25', cal.now.join());
  ok('holiday list: Mon Oct 12 Columbus Day 8 hrs', (await T('#moHols')).replace(/\s+/g, ' ') === 'Mon Oct 12Columbus Day8 hrs', await T('#moHols'));

  // next month, back
  await tap('#moNext');
  ok('next: November 2026 = 168, 2 holidays', (await T('#moName')) === 'November 2026' && (await T('#moHrs')).startsWith('168') && (await T('#moHol')) === 'includes 2 holidays', (await T('#moName')) + ' ' + (await T('#moHrs')));
  ok('next: no today mark', (await p.$$('#moCal .d.now')).length === 0);
  ok('next: This month key shown', await vis('#moToday'));
  await tap('#moToday');
  ok('This month returns to October', (await T('#moName')) === 'October 2026' && !(await vis('#moToday')));
  await tap('#moPrev'); await tap('#moPrev'); await tap('#moPrev'); await tap('#moPrev'); await tap('#moPrev'); await tap('#moPrev'); await tap('#moPrev'); await tap('#moPrev'); await tap('#moPrev'); await tap('#moPrev');
  ok('back 10 months: December 2025', (await T('#moName')) === 'December 2025', await T('#moName'));
  ok('year grid follows: 2025 by month', (await T('#moYearTitle')) === '2025 by month', await T('#moYearTitle'));
  await tap('#moToday');

  // the year
  ok('2026 total 2,088 hrs', (await T('#moYTot')) === '2,088 hrs', await T('#moYTot'));
  ok('2026: 261 workdays, 11 holidays', (await T('#moYSub')) === '261 workdays, 11 of them federal holidays', await T('#moYSub'));
  const tiles = await p.$$eval('#moMonths .mo b', bs => bs.map(x => x.textContent).join(' '));
  ok('2026 tiles', tiles === '176 160 176 176 168 176 184 168 176 176 168 184', tiles);
  ok('this month tile has the now mark and is current', await p.$eval('#moMonths .mo[data-m="9"]', e => e.classList.contains('now') && e.getAttribute('aria-current') === 'true'));
  await tap('#moMonths .mo[data-m="1"]');
  ok('tap Feb: February 2026 = 160, no holidays shown as 1 (Washington)', (await T('#moName')) === 'February 2026' && (await T('#moHrs')).startsWith('160') && (await T('#moHol')) === 'includes 1 holiday', await T('#moHol'));
  ok('Feb tile now current', await p.$eval('#moMonths .mo[data-m="1"]', e => e.getAttribute('aria-current') === 'true'));
  await tap('#moMonths .mo[data-m="6"]');
  ok('July 2026: Independence Day observed Fri Jul 3', (await T('#moHols')).includes('Fri Jul 3') && (await T('#moHols')).includes('(observed)'), await T('#moHols'));

  // holidays and totals against OPM and an independent weekday count
  const calc = await p.evaluate((OPM) => {
    const M = window.__months, out = [];
    for (const y of Object.keys(OPM)) {
      const got = M.holidays(+y).map(x => (x.m + 1) + '/' + x.d).join(' ');
      if (got !== OPM[y]) out.push(y + ': ' + got);
    }
    for (let y = 1990; y <= 2060; y++) for (let m = 0; m < 12; m++) {
      let wd = 0; const n = new Date(y, m + 1, 0).getDate();
      for (let d = 1; d <= n; d++) { const k = new Date(y, m, d).getDay(); if (k > 0 && k < 6) wd++; }
      const r = M.month(y, m);
      if (r.hrs !== wd * 8 || r.hol.some(x => { const k = new Date(x.y, x.m, x.d).getDay(); return k === 0 || k === 6; })) out.push(y + '-' + (m + 1));
    }
    return out;
  }, OPM);
  ok('holidays match OPM 2021-2028', !calc.some(x => x.includes(':')), calc.filter(x => x.includes(':')).join(' | '));
  ok('1990-2060: every month = weekdays x 8, no holiday on a weekend', !calc.some(x => !x.includes(':')), calc.filter(x => !x.includes(':')).slice(0, 5).join(' '));

  // copy
  await tap('#moToday');
  await tap('#moCopy'); await p.waitForTimeout(150);
  const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => 'n/a'));
  ok('Copy puts 176 on the clipboard', clip === '176', clip);
  ok('Copy shows Copied', (await T('#moCopy')) === 'Copied', await T('#moCopy'));

  // layout
  const [sw, iw] = await p.evaluate(() => [document.scrollingElement.scrollWidth, innerWidth]);
  ok('no horizontal overflow', sw <= iw, sw + '/' + iw);
  const holOv = await p.$$eval('#moView .hol b, #moView .hol span', es => es.filter(e => e.scrollWidth > e.clientWidth + 1).length);
  ok('holiday rows not clipped', holOv === 0, holOv);
  const yh = await vis('#moYHols');
  ok('year holiday list only on a wide screen', +w >= 900 ? yh : !yh, String(yh));

  // tabs and remembered view
  await p.evaluate(() => history.replaceState(null, '', location.pathname));
  await tap('#viewSeg [data-v="hr"]');
  ok('Hours tab shows the calculator', await vis('#hrView') && !(await vis('#moView')));
  await tap('#viewSeg [data-v="mo"]');
  ok('Months tab remembered', (await p.evaluate(() => localStorage.getItem('shift-hours-view'))) === 'mo');
  await p.reload(); await p.waitForTimeout(400);
  ok('reload opens Months', await vis('#moView'));
  await p.goto(base + '#perdiem'); await p.waitForTimeout(300);
  ok('#perdiem still opens Per diem', await vis('#pdView') && !(await vis('#moView')));

  ok('no page errors', errs.length === 0, errs.join(' | '));
  console.log(results.join('\n'));
  await b.close();
  process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
})().catch(e => { console.log('CRASH ' + e.stack); process.exit(2); });
