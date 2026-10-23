// Checks for every finding of the 2026-10-23 audit (M1..M7, L1..L8). Each check failed on 2155b07 and passes after the fix.
// usage: node tests/audit-2026-10-23.test.js <base, ignored: this test serves the repo itself> <w> <h> <mobile 0/1> <scheme>
// It runs its own static server over the repo (so it can swap the rate file between visits), with
// GitHub Pages' "Cache-Control: max-age=600". No outside network: the beacon and fonts are stubbed.
process.env.TZ = 'America/New_York'; // the dates below are wall-clock times there, like the browser's timezoneId
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const [, w = '402', h = '874', mobile = '1', scheme = 'light'] = process.argv.slice(2);
const ROOT = path.join(__dirname, '..');
const R = []; const ok = (n, c, i) => R.push((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  [' + i + ']' : ''));
const HK = 'shift-hours-v1', PK = 'shift-hours-perdiem-v1';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const over = {}; // path -> body, served instead of the file
let etagN = 1, down = false; // down: every request fails, as with no signal (setOffline does not reach the service worker)
const server = http.createServer((q, s) => {
  if (down) return q.socket.destroy();
  let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const body = over[p] != null ? over[p] : (() => { try { return fs.readFileSync(path.join(ROOT, p)); } catch (e) { return null; } })();
  if (body == null) { s.writeHead(404, { 'Content-Type': 'text/html' }); return s.end('<!doctype html><title>404</title>Not found'); }
  const tag = '"' + (over[p] != null ? 'o' + etagN : 'f') + '-' + Buffer.byteLength(body) + '"';
  if (q.headers['if-none-match'] === tag) { s.writeHead(304, { ETag: tag, 'Cache-Control': 'max-age=600' }); return s.end(); }
  s.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'max-age=600', ETag: tag });
  s.end(body);
});
// a main-format saved week (exactly what the page on main writes)
const blankBr = () => ({ min: '', s: { v: '', ap: 'pm' }, e: { v: '', ap: 'pm' } });
const blankDay = () => ({ s: { v: '', ap: 'am' }, e: { v: '', ap: 'pm' }, brk: '' });
const hours = (o = {}) => Object.assign({ fmt: '12', nBreaks: 0, breakMode: 'min', round: 0, roundBreaks: 1, start: { v: '', ap: 'am' }, end: { v: '', ap: 'pm' }, liveAt: 0, live: false, br: [blankBr(), blankBr(), blankBr()], week: Array.from({ length: 7 }, blankDay) }, o);
const day = (s, sa, e, ea, brk = '') => ({ s: { v: s, ap: sa }, e: { v: e, ap: ea }, brk });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sha-'));

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const b = await chromium.launch();
  const ctxs = [];
  const mk = async (o = {}) => {
    const ctx = await b.newContext({ viewport: { width: +w, height: +h }, isMobile: mobile === '1', hasTouch: mobile === '1', colorScheme: scheme, acceptDownloads: true, timezoneId: o.tz || 'America/New_York', serviceWorkers: o.sw ? 'allow' : 'block', ...(o.ctx || {}) });
    ctxs.push(ctx);
    await ctx.route('**/beacon.min.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    if (o.seed) await ctx.addInitScript(S => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.clear(); Object.entries(S).forEach(([k, v]) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v))); } }, o.seed);
    if (o.init) await ctx.addInitScript(o.init);
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console ' + m.text()); });
    if (o.clock) await p.clock.install({ time: o.clock });
    return { ctx, p, errs };
  };
  const T = (p, sel) => p.$eval(sel, e => e.textContent.trim());
  const tap = (p, sel) => (mobile === '1' ? p.tap(sel) : p.click(sel));
  const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k)), k);
  const linkFor = (p, bundle) => p.evaluate(async b => '#move=' + await window.__backup.encode(b), bundle);
  const offerShown = p => p.waitForFunction(() => !document.getElementById('inPanel').hidden, null, { timeout: 8000 });
  const replace = async p => { await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), tap(p, '#inYes')]); await p.waitForTimeout(300); };
  const noErr = (tag, x) => ok(tag + ': no page errors', !x.errs.length, x.errs.join(' | '));
  const bundle = (hrs, pd) => ({ app: 'shift-hours', v: 1, saved: '2026-10-22T20:00:00.000Z', hours: hrs, perdiem: pd, view: 'hr' });

  // ---------- M1: Move / Restore says what it replaces, and keeps this device's per diem when the bundle has none ----------
  {
    const liveAt = new Date(2026, 9, 22, 22, 0).getTime();
    const B = await mk({ clock: new Date(2026, 9, 23, 1, 0), seed: {
      [HK]: hours({ start: { v: '1000', ap: 'pm' }, end: { v: '100', ap: 'am' }, live: true, liveAt, week: [day('700', 'am', '330', 'pm'), day('800', 'am', '400', 'pm'), blankDay(), blankDay(), blankDay(), blankDay(), blankDay()] }),
      [PK]: { sel: { t: 'p', st: 'WA', n: 'Seattle' }, ch: null, leave: '2026-11-02', back: '2026-11-05', given: {} } } });
    await B.p.goto(base); await B.p.waitForTimeout(300);
    const fromA = bundle(hours({ week: [day('900', 'am', '500', 'pm'), blankDay(), blankDay(), blankDay(), blankDay(), blankDay(), blankDay()] }), null);
    await B.p.goto(base + await linkFor(B.p, fromA)); await offerShown(B.p);
    const t = await T(B.p, '#inText');
    ok('M1: the question names the running punch it replaces', /running punch/i.test(t), t);
    ok('M1: the question names this device\'s week and calculator shift', /2 days filled in the week/.test(t) && /calculator/.test(t), t);
    ok('M1: the question says this device\'s per diem stays', /per diem for Seattle, WA stays/i.test(t), t);
    ok('M1: still ends with the question', /Replace what is on this device\?$/.test(t), t);
    await replace(B.p);
    const pd = await stored(B.p, PK), hr = await stored(B.p, HK);
    ok('M1: per diem trip kept after a move without per diem', pd && pd.sel && pd.sel.n === 'Seattle' && pd.leave === '2026-11-02', JSON.stringify(pd));
    ok('M1: the week came over', hr.week[0].s.v === '900' && !hr.week[1].s.v && !hr.live, JSON.stringify(hr.week[0]));
    // a backup file that does carry per diem says it replaces this device's trip
    fs.writeFileSync(path.join(tmp, 'denver.json'), JSON.stringify(bundle(hours(), { sel: { t: 'p', st: 'CO', n: 'Denver' }, ch: null, leave: '', back: '', given: {} })));
    await B.p.setInputFiles('#bkFile', path.join(tmp, 'denver.json')); await offerShown(B.p);
    const t2 = await T(B.p, '#inText');
    ok('M1: a file with per diem says it replaces this device\'s per diem', /replaces[^.]*per diem for Seattle, WA/i.test(t2), t2);
    noErr('M1', B);
  }

  // ---------- M2: an empty break row does not come back as a 12:00-12:30 break ----------
  {
    const B = await mk();
    await B.p.goto(base); await B.p.evaluate(() => localStorage.clear()); await B.p.reload(); await B.p.waitForTimeout(200);
    const A = hours({ nBreaks: 1, breakMode: 'time', start: { v: '900', ap: 'am' }, end: { v: '500', ap: 'pm' } });
    await B.p.goto(base + await linkFor(B.p, bundle(A, null))); await offerShown(B.p); await replace(B.p);
    ok('M2: moved shift with an empty break row is 8.00', (await T(B.p, '#hm')).startsWith('8.00'), await T(B.p, '#hm'));
    // a link made by the page on main (empty rows sent as null) also arrives right
    const old = await B.p.evaluate(h => { const c = JSON.parse(JSON.stringify(h)); c.br = [null, null, null]; c.week = c.week.map(() => null); delete c.liveAt;
      const s = JSON.stringify({ app: 'shift-hours', v: 1, saved: new Date().toISOString(), hours: c, perdiem: null, view: 'hr' });
      return '#move=j' + btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }, A);
    await B.p.goto(base + old); await offerShown(B.p); await replace(B.p);
    ok('M2: an old-style link (null rows) is 8.00 too', (await T(B.p, '#hm')).startsWith('8.00'), await T(B.p, '#hm'));
    const n = await B.p.evaluate(() => window.__hours.normalise({ nBreaks: 1, breakMode: 'time', week: [], br: [null, {}] }).br.map(x => x.s.v + '-' + x.e.v).join(','));
    ok('M2: normalise fills missing break rows with blanks', n === '-,-,-', n);
    // saved data written by main reads back exactly the same
    const main = hours({ fmt: '24', nBreaks: 2, breakMode: 'time', round: 15, roundBreaks: 0, start: { v: '0845', ap: 'am' }, end: { v: '1717', ap: 'pm' }, liveAt: 1760000000000,
      br: [{ min: '30', s: { v: '1200', ap: 'pm' }, e: { v: '1230', ap: 'pm' } }, { min: '', s: { v: '1500', ap: 'pm' }, e: { v: '1515', ap: 'pm' } }, blankBr()],
      week: [day('0700', 'am', '1530', 'pm', '30'), blankDay(), day('2200', 'pm', '0600', 'am'), blankDay(), blankDay(), blankDay(), blankDay()] });
    const back = await B.p.evaluate(m => window.__hours.normalise(JSON.parse(JSON.stringify(m))), main);
    const strip = o => { const c = JSON.parse(JSON.stringify(o)); delete c.outAt; c.week.forEach(d => delete d.adj); return c; };
    ok('M2: saved state from main reads back unchanged', JSON.stringify(strip(back)) === JSON.stringify(main), JSON.stringify(back).slice(0, 120));
    noErr('M2', B);
  }

  // ---------- M3 / L6 / L1: offline cache ----------
  {
    const X = await mk({ sw: true });
    await X.p.goto(base + '#perdiem');
    await X.p.evaluate(() => navigator.serviceWorker.ready);
    await X.p.reload(); await X.p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 });
    await X.p.waitForFunction(() => window.__perdiem.core.data, null, { timeout: 15000 });
    await X.p.fill('#pdQ', 'Seattle, WA'); await X.p.waitForTimeout(300); await X.p.keyboard.press('Enter'); await X.p.waitForTimeout(300);
    const L0 = await T(X.p, '#pdL');
    await X.p.reload(); await X.p.waitForFunction(() => window.__perdiem.core.data, null, { timeout: 15000 });
    // a new rate file is deployed: the next visit must show it, not the cached one
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/perdiem-fy2027.json'), 'utf8'));
    const si = data.areas.findIndex(a => a[0] === 'Seattle' && a[1] === 'WA');
    data.areas[si][4] = data.areas[si][4].map(() => 999); over['/data/perdiem-fy2027.json'] = JSON.stringify(data); etagN++;
    await X.p.reload(); await X.p.waitForFunction(() => window.__perdiem.core.data, null, { timeout: 15000 }); await X.p.waitForTimeout(200);
    const L1 = await T(X.p, '#pdL');
    ok('M3: first visit after a rate update shows the new rate', L0 !== '$999' && L1 === '$999', L0 + ' -> ' + L1);
    // offline: the newest rate file is what is cached
    down = true;
    await X.p.reload(); await X.p.waitForFunction(() => window.__perdiem.core.data, null, { timeout: 15000 }).catch(() => {});
    ok('M3: offline still shows rates, the new ones', (await T(X.p, '#pdL')) === '$999', await T(X.p, '#pdL'));
    down = false;
    // L6: a new year's file replaces the old one in the cache
    over['/data/perdiem-fy2028.json'] = JSON.stringify(data);
    await X.p.evaluate(() => fetch('data/perdiem-fy2028.json').then(r => r.text()));
    let urls = [];
    for (let i = 0; i < 20; i++) { urls = await X.p.evaluate(async () => { const out = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname); return out; }); if (urls.includes('/data/perdiem-fy2028.json') && !urls.includes('/data/perdiem-fy2027.json')) break; await X.p.waitForTimeout(150); }
    ok('L6: the old year\'s rate file leaves the cache', urls.includes('/data/perdiem-fy2028.json') && !urls.includes('/data/perdiem-fy2027.json'), urls.filter(u => u.startsWith('/data')).join(' '));
    delete over['/data/perdiem-fy2027.json']; delete over['/data/perdiem-fy2028.json']; etagN++;
    // L1: opening another file of the site does not become the offline page
    await X.p.goto(base + 'qr.js'); await X.p.waitForTimeout(300);
    const cached = await X.p.evaluate(async () => { const out = []; for (const k of await caches.keys()) { const c = await caches.open(k); const r = await c.match('index.html'); out.push(r ? r.headers.get('content-type') : 'none'); } return out.join(','); });
    ok('L1: after opening qr.js the saved page is still HTML', /text\/html/.test(cached), cached);
    await X.p.goto(base + 'og.png'); await X.p.waitForTimeout(300);
    down = true;
    await X.p.goto(base, { waitUntil: 'load' }).catch(() => {});
    const off = await X.p.evaluate(() => !!document.getElementById('hm') && !!document.getElementById('startIn')).catch(() => false);
    ok('L1: offline, the app still opens after visiting qr.js and og.png', off);
    down = false;
    noErr('M3/L1/L6', X);
  }

  // ---------- M4: Add to day stops pointing at the punch-in day once a new shift is typed ----------
  {
    const P = await mk({ clock: new Date(2026, 9, 17, 22, 0) }); // Sat Oct 17, 10 PM
    await P.p.goto(base); await P.p.evaluate(() => localStorage.clear()); await P.p.reload(); await P.p.waitForTimeout(200);
    await tap(P.p, '#punch'); await P.p.clock.runFor(8 * 3600e3); await tap(P.p, '#punch'); await P.p.waitForTimeout(50);
    ok('M4: a night punch is added to the punch-in day', (await T(P.p, '#addWeek')) === 'Add to Sat', await T(P.p, '#addWeek'));
    await tap(P.p, '#addWeek'); await P.p.waitForTimeout(50);
    ok('M4: Saturday filled', (await P.p.$eval('#w5s', e => e.value)) === '1000', await P.p.$eval('#w5s', e => e.value));
    await P.p.clock.runFor(27 * 3600e3); // Mon 9 AM
    await P.p.fill('#startIn', '900'); await tap(P.p, '#startIn-am'); await P.p.fill('#endIn', '500'); await tap(P.p, '#endIn-pm'); await P.p.waitForTimeout(50);
    ok('M4: a typed shift on Monday goes to Mon', (await T(P.p, '#addWeek')) === 'Add to Mon', await T(P.p, '#addWeek'));
    noErr('M4', P);
  }

  // ---------- M5: a punched shift across a clock change counts the real time ----------
  {
    const P = await mk({ clock: new Date('2026-11-01T02:00:00Z') }); // Sat Oct 31, 10 PM EDT
    await P.p.goto(base); await P.p.evaluate(() => localStorage.clear()); await P.p.reload(); await P.p.waitForTimeout(200);
    await tap(P.p, '#punch'); await P.p.clock.runFor(4 * 3600e3); await P.p.waitForTimeout(50);
    ok('M5: live across fall-back counts real time (4.00 at 1:00 AM EST)', (await T(P.p, '#hm')).startsWith('4.00'), (await P.p.$eval('#endIn', e => e.value)) + ' ' + await T(P.p, '#hm'));
    await P.p.clock.runFor(5 * 3600e3); await tap(P.p, '#punch'); await P.p.waitForTimeout(50); // 6 AM EST, 9 real hours
    ok('M5: fall back, 10 PM to 6 AM punched is 9.00', (await P.p.$eval('#endIn', e => e.value)) === '600' && (await T(P.p, '#hm')).startsWith('9.00'), await T(P.p, '#hm'));
    ok('M5: a badge says why', /clock/i.test(await T(P.p, '#badges')), await T(P.p, '#badges'));
    await P.p.clock.runFor(400); await P.p.reload(); await P.p.waitForTimeout(200);
    ok('M5: still 9.00 after a reload', (await T(P.p, '#hm')).startsWith('9.00'), await T(P.p, '#hm'));
    await tap(P.p, '#addWeek'); await P.p.waitForTimeout(50);
    ok('M5: Add to Sat carries 9.00 into the week', (await T(P.p, '#wh5')).startsWith('9.00') && (await T(P.p, '#wDec')) === '9.00', (await T(P.p, '#wh5')) + ' / ' + (await T(P.p, '#wDec')));
    await P.p.clock.runFor(400); await P.p.reload(); await P.p.waitForTimeout(200);
    ok('M5: the week still says 9.00 after a reload', (await T(P.p, '#wDec')) === '9.00', await T(P.p, '#wDec'));
    // editing that day's times by hand makes it a typed shift again (wall clock)
    await tap(P.p, '#wd5'); await P.p.fill('#w5e', '700'); await P.p.waitForTimeout(50);
    ok('M5: a hand edit of the day drops the correction', (await T(P.p, '#wDec')) === '9.00', await T(P.p, '#wDec')); // 10 PM to 7 AM typed = 9.00
    // the same times typed by hand stay wall-clock (by design: typed times have no date)
    await tap(P.p, '#clear'); await P.p.fill('#startIn', '1000'); await tap(P.p, '#startIn-pm'); await P.p.fill('#endIn', '600'); await tap(P.p, '#endIn-am'); await P.p.waitForTimeout(50);
    ok('M5: typed 10 PM to 6 AM stays 8.00', (await T(P.p, '#hm')).startsWith('8.00'), await T(P.p, '#hm'));
    noErr('M5 fall', P);
    const Q = await mk({ clock: new Date('2027-03-14T03:00:00Z') }); // Sat Mar 13 2027, 10 PM EST
    await Q.p.goto(base); await Q.p.evaluate(() => localStorage.clear()); await Q.p.reload(); await Q.p.waitForTimeout(200);
    await tap(Q.p, '#punch'); await Q.p.clock.runFor(7 * 3600e3); await tap(Q.p, '#punch'); await Q.p.waitForTimeout(50);
    ok('M5: spring forward, 10 PM to 6 AM punched is 7.00', (await Q.p.$eval('#endIn', e => e.value)) === '600' && (await T(Q.p, '#hm')).startsWith('7.00'), await T(Q.p, '#hm'));
    noErr('M5 spring', Q);
    // saved by main: an old punch time left behind under a typed shift is not used
    const O = await mk({ clock: new Date('2026-11-01T12:00:00Z'), seed: { [HK]: hours({ start: { v: '900', ap: 'pm' }, end: { v: '600', ap: 'am' }, liveAt: new Date('2026-11-01T02:00:00Z').getTime() }) } });
    await O.p.goto(base); await O.p.waitForTimeout(200);
    ok('M5: typed shift under an old punch time from main is wall clock (9.00)', (await T(O.p, '#hm')).startsWith('9.00'), await T(O.p, '#hm'));
    noErr('M5 main data', O);
  }

  // ---------- M6: Save backup downloads on a computer; a closed share sheet says nothing was saved ----------
  {
    const share = () => { navigator.canShare = () => true; navigator.share = (d) => { window.__shared = (window.__shared || 0) + 1; return Promise.reject(new DOMException('closed', 'AbortError')); }; };
    const D = await mk({ init: share, ctx: { isMobile: false, hasTouch: false } });
    await D.p.goto(base); await D.p.waitForTimeout(200);
    const dl = await Promise.all([D.p.waitForEvent('download', { timeout: 4000 }).catch(() => null), D.p.click('#bkSave')]).then(x => x[0]);
    ok('M6: on a computer Save backup is a download, not the share menu', !!dl && !(await D.p.evaluate(() => window.__shared)), dl ? dl.suggestedFilename() : 'no download');
    noErr('M6 desktop', D);
    const M = await mk({ init: share, ctx: { isMobile: true, hasTouch: true } });
    await M.p.goto(base); await M.p.waitForTimeout(200);
    const coarse = await M.p.evaluate(() => matchMedia('(hover: none) and (pointer: coarse)').matches);
    await M.p.tap('#bkSave'); await M.p.waitForTimeout(200);
    const mm = await M.p.$eval('#dataMsg', e => e.hidden ? '' : e.textContent);
    ok('M6: on a phone a closed share sheet says the backup was not saved', coarse && (await M.p.evaluate(() => window.__shared)) === 1 && /not saved/i.test(mm), coarse + ' ' + mm);
    noErr('M6 phone', M);
  }

  // ---------- M7: Move tells iPhone home-screen users to use a backup file ----------
  {
    const X = await mk();
    await X.p.goto(base); await X.p.waitForTimeout(200);
    await tap(X.p, '#bkMove'); await X.p.waitForTimeout(300);
    const t = await T(X.p, '#movePanel');
    ok('M7: the move panel names the home-screen limit and the way round it', /home screen/i.test(t) && /Save backup/.test(t) && /Restore/.test(t), t);
    noErr('M7', X);
  }

  // ---------- L2: on a season-change day the big lodging number is that day's rate ----------
  for (const [when, want, wantLabel] of [[new Date(2027, 3, 20, 10), '$279', /today/i], [new Date(2027, 3, 10, 10), '$199', /today/i], [new Date(2027, 1, 10, 10), '$199', /Feb/]]) {
    const X = await mk({ clock: when, seed: { [PK]: { sel: { t: 'p', st: 'AK', n: 'Fairbanks' }, ch: null, leave: '', back: '', given: {} }, 'shift-hours-view': 'pd' } });
    await X.p.goto(base); await X.p.waitForFunction(() => window.__perdiem.core.data && !document.getElementById('pdRates').hidden, null, { timeout: 15000 });
    const L = await T(X.p, '#pdL'), k = await T(X.p, '#pdLk');
    ok('L2: Fairbanks on ' + when.toDateString() + ' shows ' + want, L === want && wantLabel.test(k), k + ' ' + L);
    noErr('L2', X);
  }

  // ---------- L3: a damaged move link leaves the address bar ----------
  {
    const X = await mk();
    await X.p.goto(base + '#move=zabc'); await X.p.waitForFunction(() => !document.getElementById('dataMsg').hidden, null, { timeout: 5000 });
    ok('L3: damaged link message shown and hash removed', /damaged/.test(await T(X.p, '#dataMsg')) && (await X.p.evaluate(() => location.hash)) === '', await X.p.evaluate(() => location.href));
    await X.p.reload(); await X.p.waitForTimeout(300);
    ok('L3: a reload does not bring the error back', await X.p.$eval('#dataMsg', e => e.hidden));
    noErr('L3', X);
  }

  // ---------- L4: a per diem removal in another tab reaches this tab ----------
  {
    const X = await mk({ seed: { [PK]: { sel: { t: 'p', st: 'WA', n: 'Seattle' }, ch: null, leave: '2026-11-02', back: '2026-11-05', given: {} } } });
    await X.p.goto(base + '#perdiem'); await X.p.waitForFunction(() => window.__perdiem.core.data, null, { timeout: 15000 });
    const p2 = await X.ctx.newPage(); await p2.goto(base); await p2.evaluate(k => localStorage.removeItem(k), PK); await X.p.waitForTimeout(300);
    ok('L4: the other tab dropped its per diem state', (await X.p.evaluate(() => window.__perdiem.S.sel)) === null && (await X.p.evaluate(() => window.__perdiem.S.leave)) === '');
    noErr('L4', X);
  }

  // ---------- L5: meal marks belong to a trip ----------
  {
    const X = await mk({ clock: new Date(2026, 9, 20, 10), seed: { [PK]: { sel: { t: 'p', st: 'WA', n: 'Seattle' }, ch: null, leave: '2026-11-02', back: '2026-11-05', given: { '2026-11-03': [true, false, false], '2026-10-05': [false, true, false] } } } });
    await X.p.goto(base + '#perdiem'); await X.p.waitForFunction(() => window.__perdiem.core.data && !document.getElementById('pdRates').hidden, null, { timeout: 15000 });
    await X.p.$eval('#pdBack', e => { e.value = '2026-11-04'; e.dispatchEvent(new Event('change', { bubbles: true })); }); await X.p.waitForTimeout(50);
    const g1 = await X.p.evaluate(() => Object.keys(window.__perdiem.S.given).join(','));
    ok('L5: changing the dates drops marks outside the trip', g1 === '2026-11-03', g1);
    await X.p.fill('#pdQ', 'Denver, CO'); await X.p.waitForTimeout(300); await X.p.keyboard.press('Enter'); await X.p.waitForTimeout(100);
    const g2 = await X.p.evaluate(() => ({ g: Object.keys(window.__perdiem.S.given).length, n: window.__perdiem.S.sel.n }));
    ok('L5: a trip to another place starts with no meals taken off', g2.n === 'Denver' && g2.g === 0, JSON.stringify(g2));
    noErr('L5', X);
  }

  // ---------- L7: storage that will not save is said out loud; an empty backup cannot wipe a device ----------
  {
    const block = () => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (/^shift-hours/.test(k)) throw new DOMException('full', 'QuotaExceededError'); return set.call(this, k, v); }; };
    const X = await mk({ init: block });
    await X.p.goto(base); await X.p.waitForTimeout(200);
    await X.p.fill('#startIn', '900'); await X.p.waitForTimeout(400);
    const m1 = await X.p.$eval('#dataMsg', e => e.hidden ? '' : e.textContent);
    ok('L7: a failed save is shown', /not sav/i.test(m1), m1);
    const dl = await Promise.all([X.p.waitForEvent('download', { timeout: 1500 }).catch(() => null), X.p.click('#bkSave')]).then(x => x[0]);
    const m2 = await X.p.$eval('#dataMsg', e => e.hidden ? '' : e.textContent);
    ok('L7: Save backup refuses to write an empty file when storage is not saving', !dl && /not sav|could not/i.test(m2), m2);
    noErr('L7 blocked', X);
    const Y = await mk({ seed: { [HK]: hours({ week: [day('700', 'am', '330', 'pm'), blankDay(), blankDay(), blankDay(), blankDay(), blankDay(), blankDay()] }) } });
    await Y.p.goto(base); await Y.p.waitForTimeout(200);
    fs.writeFileSync(path.join(tmp, 'empty.json'), JSON.stringify(bundle(null, null)));
    await Y.p.setInputFiles('#bkFile', path.join(tmp, 'empty.json')); await Y.p.waitForTimeout(300);
    const m3 = await Y.p.$eval('#dataMsg', e => e.hidden ? '' : e.textContent), shown = await Y.p.$eval('#inPanel', e => !e.hidden);
    ok('L7: a backup with nothing in it is refused, the week stays', !shown && /nothing/i.test(m3) && (await stored(Y.p, HK)).week[0].s.v === '700', m3);
    noErr('L7 empty', Y);
  }

  // ---------- L8: a punch clock that stops itself after 24 hours leaves no made-up end ----------
  {
    const T0 = new Date(2026, 9, 16, 8, 45);
    const P = await mk({ clock: T0 });
    await P.p.goto(base); await P.p.evaluate(() => localStorage.clear()); await P.p.reload(); await P.p.waitForTimeout(200);
    await tap(P.p, '#punch'); await P.p.clock.runFor(2 * 3600e3); await P.p.waitForTimeout(400); // end stamped 10:45
    await P.p.close();
    const P2 = await P.ctx.newPage(); P2.on('pageerror', e => P.errs.push('pageerror ' + e.message));
    await P2.clock.setSystemTime(new Date(T0.getTime() + 30 * 3600e3)); // page closed, opened 30 h after punching in
    await P2.goto(base); await P2.waitForTimeout(300);
    const s1 = { end: await P2.$eval('#endIn', e => e.value), hm: await T(P2, '#hm'), badges: await T(P2, '#badges'), key: await T(P2, '#punch') };
    ok('L8: after 24 h the end time is cleared, not left at the last stamp', s1.end === '' && !/^\d/.test(s1.hm) && s1.key === 'Punch in', JSON.stringify(s1));
    ok('L8: the note says what happened', /more than a day/i.test(s1.badges), s1.badges);
    await P2.clock.runFor(400); await P2.reload(); await P2.waitForTimeout(300);
    const s2 = { end: await P2.$eval('#endIn', e => e.value), hm: await T(P2, '#hm'), badges: await T(P2, '#badges') };
    ok('L8: after a reload there is still no short total', s2.end === '' && !/^\d/.test(s2.hm), JSON.stringify(s2));
    noErr('L8', P);
  }

  for (const c of ctxs) await c.close().catch(() => {});
  await b.close(); server.close();
  console.log(R.join('\n'));
  const fails = R.filter(r => r.startsWith('FAIL')).length;
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log(R.join('\n')); console.error(e); process.exit(2); });
