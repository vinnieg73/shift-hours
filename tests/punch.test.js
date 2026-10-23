// Punch in / out, Add to day and the offline cache. usage: node punch.test.js <base> <w> <h> <mobile 0/1> <scheme>
const { chromium } = require('playwright');
const [base = 'http://127.0.0.1:8832/', w = '402', h = '874', mobile = '1', scheme = 'light'] = process.argv.slice(2);
const R = [];
const ok = (n, c, i) => R.push((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  [' + i + ']' : ''));
const T0 = new Date(2026, 9, 16, 8, 45, 0); // Fri Oct 16 2026, 8:45 local
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2, isMobile: mobile === '1', hasTouch: mobile === '1', colorScheme: scheme });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
  await p.route('**/beacon.min.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await p.clock.install({ time: T0 });
  await p.goto(base); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(300);
  const T = sel => p.$eval(sel, e => e.textContent.trim());
  const V = sel => p.$eval(sel, e => e.value);
  const tap = async sel => (mobile === '1' ? p.tap(sel) : p.click(sel));
  const overflow = async tag => { const [sw, iw] = await p.evaluate(() => [document.scrollingElement.scrollWidth, innerWidth]); ok('no horizontal overflow (' + tag + ')', sw <= iw, sw + '/' + iw); };

  ok('fresh: Punch in key', (await T('#punch')) === 'Punch in');
  ok('fresh: Add to Fri, disabled', (await T('#addWeek')) === 'Add to Fri' && await p.$eval('#addWeek', e => e.disabled), await T('#addWeek'));
  await overflow('fresh');

  // punch in at 8:45
  await tap('#punch'); await p.waitForTimeout(50);
  ok('punch in: start 845 AM', (await V('#startIn')) === '845' && (await p.$eval('#startIn-am', e => e.getAttribute('aria-pressed'))) === 'true', await V('#startIn'));
  ok('punch in: end follows (845)', (await V('#endIn')) === '845');
  ok('punch in: key reads Punch out, pressed', (await T('#punch')) === 'Punch out' && (await p.$eval('#punch', e => e.classList.contains('on') && e.getAttribute('aria-pressed') === 'true')));
  ok('punch in: status line', (await T('#punchStat')) === 'Since 8:45 AM', await T('#punchStat'));
  ok('punch in: end echo says now', (await T('#endInEcho')) === 'now' && await p.$eval('#endIn', e => e.closest('.well').classList.contains('live')));
  ok('punch in: 0.00 with a same-time note', (await T('#hm')).startsWith('0.00'));
  ok('punch in: Add to day off while live', await p.$eval('#addWeek', e => e.disabled));
  await overflow('live');
  await p.screenshot({ path: require('path').join(process.env.SHOTS || require('os').tmpdir(), `live-${w}-${scheme}.png`), fullPage: false });

  // 1h30 later the readout has ticked on its own
  await p.clock.runFor(90 * 60 * 1000); await p.waitForTimeout(50);
  ok('90 min later: end 1015, 1.50 hrs', (await V('#endIn')) === '1015' && (await T('#hm')).startsWith('1.50'), (await V('#endIn')) + ' ' + (await T('#hm')));

  // reload: still on the clock, catches up at once
  await p.clock.runFor(15 * 60 * 1000);
  await p.reload(); await p.waitForTimeout(300);
  ok('reload: still live, end 1030, 1.75', (await T('#punch')) === 'Punch out' && (await V('#endIn')) === '1030' && (await T('#hm')).startsWith('1.75'), (await V('#endIn')) + ' ' + (await T('#hm')));

  // typing an end by hand lets go of the clock
  await p.fill('#endIn', '1200'); await p.waitForTimeout(50);
  ok('hand-typed end ends live', (await T('#punch')) === 'Punch in' && !(await p.$eval('#endIn', e => e.closest('.well').classList.contains('live'))) && (await T('#endInEcho')) === '12:00');
  // punch in again (8:45 stays because start is re-stamped with the clock: now 10:30)
  await tap('#punch'); await p.waitForTimeout(50);
  ok('punch in again stamps start 1030', (await V('#startIn')) === '1030' && (await T('#punchStat')) === 'Since 10:30 AM', await V('#startIn'));
  await p.clock.runFor(8 * 60 * 60 * 1000 + 17 * 60 * 1000); await p.waitForTimeout(50);
  // punch out at 6:47 PM
  await tap('#punch'); await p.waitForTimeout(50);
  ok('punch out: end 647 PM, key back to Punch in', (await V('#endIn')) === '647' && (await p.$eval('#endIn-pm', e => e.getAttribute('aria-pressed'))) === 'true' && (await T('#punch')) === 'Punch in' && (await T('#punchStat')) === '');
  ok('punch out: 8.28 hrs', (await T('#hm')).startsWith('8.28'), await T('#hm'));
  ok('punch out: Add to Fri on', !(await p.$eval('#addWeek', e => e.disabled)));
  await p.screenshot({ path: require('path').join(process.env.SHOTS || require('os').tmpdir(), `out-${w}-${scheme}.png`), fullPage: false });

  // add a 30 min break, then Add to day
  await tap('#breakCount button[data-n="1"]'); await p.fill('#bmin0', '30'); await p.waitForTimeout(50);
  ok('with break: 7.78', (await T('#hm')).startsWith('7.78'), await T('#hm'));
  await tap('#addWeek'); await p.waitForTimeout(50);
  const fri = await p.evaluate(() => ({ s: document.getElementById('w4s').value, e: document.getElementById('w4e').value, b: document.getElementById('w4b').value, h: document.getElementById('wh4').textContent, mode: document.getElementById('wr4').className, key: document.getElementById('addWeek').textContent, ok: document.getElementById('addWeek').classList.contains('ok'), just: document.getElementById('wr4').classList.contains('just') }));
  ok('Add to Fri: row 1030-647, 30 min, 7.78, folded', fri.s === '1030' && fri.e === '647' && fri.b === '30' && fri.h.startsWith('7.78') && /m-fold/.test(fri.mode) && fri.just, JSON.stringify(fri));
  ok('Add to Fri: key says Added', fri.key === 'Added to Fri · 7.78' && fri.ok, fri.key);
  ok('week total 7.78', (await T('#wDec')) === '7.78', await T('#wDec'));
  await p.screenshot({ path: require('path').join(process.env.SHOTS || require('os').tmpdir(), `added-${w}-${scheme}.png`), fullPage: true });
  await p.clock.runFor(2000); await p.waitForTimeout(50);
  ok('key back to Add to Fri', (await T('#addWeek')) === 'Add to Fri', await T('#addWeek'));
  // a filled day asks twice
  await tap('#addWeek'); await p.waitForTimeout(50);
  ok('filled day: Replace Fri?', (await T('#addWeek')) === 'Replace Fri?' && await p.$eval('#addWeek', e => !!e.dataset.arm), await T('#addWeek'));
  await p.clock.runFor(3500); await p.waitForTimeout(50);
  ok('arm times out', (await T('#addWeek')) === 'Add to Fri', await T('#addWeek'));
  await tap('#addWeek'); await tap('#addWeek'); await p.waitForTimeout(50);
  ok('second tap replaces', (await T('#addWeek')) === 'Added to Fri · 7.78' && (await T('#wDec')) === '7.78');
  // Clear resets the clock state
  await tap('#clear'); await p.waitForTimeout(50);
  const st = await p.evaluate(() => { const S = window.__hours.S; return { live: S.live, at: S.liveAt, key: document.getElementById('punch').textContent }; });
  ok('Clear: not live, no punch time', !st.live && st.at === 0 && st.key === 'Punch in', JSON.stringify(st));
  // 24-hour format stamps 0845-style
  await tap('#fmt24'); await p.clock.runFor(24 * 3600 * 1000 - (18 * 60 + 47 - 8 * 60 - 45) * 60 * 1000); // back to 8:45 next day
  await tap('#punch'); await p.waitForTimeout(50);
  ok('24h: start 0845, status 08:45', (await V('#startIn')) === '0845' && (await T('#punchStat')) === 'Since 08:45', (await V('#startIn')) + ' ' + (await T('#punchStat')));
  await tap('#punch'); await tap('#fmt12');
  // saved state round-trips
  await p.clock.runFor(400);
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('shift-hours-v1')));
  ok('state has live/liveAt', saved.live === false && saved.liveAt > 0, JSON.stringify([saved.live, saved.liveAt]));
  await overflow('end');
  ok('no page errors', !errs.length, errs.join(' | '));
  await ctx.close();

  // ---- offline: a second context with a real clock ----
  const c2 = await b.newContext({ viewport: { width: +w, height: +h }, isMobile: mobile === '1', hasTouch: mobile === '1', colorScheme: scheme });
  const q = await c2.newPage();
  const e2 = []; q.on('pageerror', e => e2.push('pageerror ' + e.message));
  await q.route('**/beacon.min.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await q.goto(base + '#perdiem');
  await q.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller || (navigator.serviceWorker.ready && false), null, { timeout: 10000 }).catch(() => {});
  await q.waitForTimeout(800);
  await q.evaluate(() => navigator.serviceWorker.ready);
  await q.waitForFunction(() => !document.getElementById('pdRates').hidden || document.getElementById('pdEmpty'), null, { timeout: 15000 }).catch(() => {});
  await q.fill('#pdQ', 'Seattle, WA'); await q.waitForTimeout(600);
  await q.keyboard.press('Enter'); await q.waitForTimeout(600);
  const online = await q.evaluate(() => ({ ctrl: !!navigator.serviceWorker.controller, rates: !document.getElementById('pdRates').hidden }));
  // second load so the page is served under the worker and the rate file is in the cache
  await q.reload(); await q.waitForTimeout(800);
  const keys = await q.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks[0]); return { names: ks, urls: (await c.keys()).map(r => r.url.replace(location.origin, '')) }; });
  ok('worker installed and controlling', online.ctrl || (await q.evaluate(() => !!navigator.serviceWorker.controller)), JSON.stringify(online));
  ok('cache holds page, manifest, icons, rates', ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/data/perdiem-fy2027.json'].every(u => keys.urls.includes(u)), keys.urls.filter(u => !u.startsWith('https')).join(' '));
  await c2.setOffline(true);
  await q.goto(base, { waitUntil: 'load' }).catch(e => e2.push('offline goto ' + e.message));
  await q.waitForTimeout(500);
  const off = await q.evaluate(() => ({ hm: !!document.getElementById('hm'), start: !!document.getElementById('startIn'), title: document.title })).catch(() => null);
  ok('offline: page opens from the cache', off && off.hm && off.start, JSON.stringify(off));
  await q.$eval('#viewSeg [data-v="pd"]', e => e.click()); await q.waitForTimeout(800);
  const offPd = await q.evaluate(() => ({ rates: !document.getElementById('pdRates').hidden, lodging: (document.getElementById('pdRates').textContent.match(/\$\d+/) || [''])[0] }));
  ok('offline: per diem rates from the cache', offPd.rates && offPd.lodging, JSON.stringify(offPd));
  await c2.setOffline(false);
  ok('offline run: no page errors', !e2.length, e2.join(' | '));
  await c2.close();
  await b.close();
  console.log(R.join('\n'));
  const fails = R.filter(r => r.startsWith('FAIL')).length;
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
