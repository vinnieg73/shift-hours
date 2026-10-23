// Save backup, Restore, Move link + QR. usage: node backup.test.js <base> <w> <h> <mobile 0/1> <scheme>
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');
const [base = 'http://127.0.0.1:8832/', w = '402', h = '874', mobile = '1', scheme = 'light'] = process.argv.slice(2);
const R = []; const ok = (n, c, i) => R.push((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  [' + i + ']' : ''));
const HOURS = { fmt: '12', nBreaks: 0, breakMode: 'min', round: 0, roundBreaks: 1, start: { v: '845', ap: 'am' }, end: { v: '517', ap: 'pm' }, live: false, liveAt: 0,
  br: [{ min: '30', s: { v: '', ap: 'pm' }, e: { v: '', ap: 'pm' } }, { min: '', s: { v: '', ap: 'pm' }, e: { v: '', ap: 'pm' } }, { min: '', s: { v: '', ap: 'pm' }, e: { v: '', ap: 'pm' } }],
  week: [{ s: { v: '700', ap: 'am' }, e: { v: '330', ap: 'pm' }, brk: '30' }, { s: { v: '845', ap: 'am' }, e: { v: '517', ap: 'pm' }, brk: '' }, { s: { v: '630', ap: 'am' }, e: { v: '400', ap: 'pm' }, brk: '45' }, { s: { v: '900', ap: 'am' }, e: { v: '115', ap: 'pm' }, brk: '' },
    { s: { v: '', ap: 'am' }, e: { v: '', ap: 'pm' }, brk: '' }, { s: { v: '', ap: 'am' }, e: { v: '', ap: 'pm' }, brk: '' }, { s: { v: '', ap: 'am' }, e: { v: '', ap: 'pm' }, brk: '' }] };
const PD = { sel: { t: 'p', st: 'WA', n: 'Seattle' }, ch: null, leave: '2026-11-09', back: '2026-11-12', given: {} };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shb-'));
(async () => {
  const b = await chromium.launch();
  const mk = async (seed) => {
    const ctx = await b.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2, isMobile: mobile === '1', hasTouch: mobile === '1', colorScheme: scheme, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
    if (seed) await ctx.addInitScript(([H, P]) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('shift-hours-v1', JSON.stringify(H)); localStorage.setItem('shift-hours-perdiem-v1', JSON.stringify(P)); } }, [HOURS, PD]);
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
    await p.route('**/beacon.min.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    return { ctx, p, errs };
  };
  const tap = async (p, sel) => (mobile === '1' ? p.tap(sel) : p.click(sel));
  const T = (p, sel) => p.$eval(sel, e => e.textContent.trim());
  const overflow = async (p, tag) => { const [sw, iw] = await p.evaluate(() => [document.scrollingElement.scrollWidth, innerWidth]); ok('no horizontal overflow (' + tag + ')', sw <= iw, sw + '/' + iw); };

  // ---- A: seeded device: save a backup, make a move link ----
  const A = await mk(true);
  await A.p.goto(base); await A.p.waitForTimeout(400);
  ok('data card present with three keys', await A.p.$eval('.card.data', c => c.querySelectorAll('#bkSave,#bkRestore,#bkMove').length === 3));
  await overflow(A.p, 'card');
  const [dl] = await Promise.all([A.p.waitForEvent('download', { timeout: 8000 }), tap(A.p, '#bkSave')]);
  const file = path.join(tmp, dl.suggestedFilename()); await dl.saveAs(file);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  ok('backup file name', /^shift-hours-backup-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  ok('backup holds hours, per diem and view', saved.app === 'shift-hours' && saved.hours.week.length === 7 && saved.hours.week[0].s.v === '700' && saved.perdiem.sel.n === 'Seattle', JSON.stringify(Object.keys(saved)));
  ok('save message', /Backup saved as/.test(await T(A.p, '#dataMsg')), await T(A.p, '#dataMsg'));
  // move link
  await tap(A.p, '#bkMove'); await A.p.waitForFunction(() => document.querySelector('#qrBox svg') || !document.getElementById('dataMsg').hidden, null, { timeout: 8000 });
  const qr = await A.p.evaluate(() => { const s = document.querySelector('#qrBox svg'); return s ? { vb: s.getAttribute('viewBox'), len: s.querySelector('path').getAttribute('d').length } : null; });
  ok('QR drawn', qr && /^0 0 \d+ \d+$/.test(qr.vb) && qr.len > 1000, JSON.stringify(qr));
  await A.p.screenshot({ path: require('path').join(process.env.SHOTS || require('os').tmpdir(), `move-${w}-${scheme}.png`), fullPage: true });
  await tap(A.p, '#bkCopy'); await A.p.waitForTimeout(100);
  const link = await A.p.evaluate(() => navigator.clipboard.readText());
  ok('copied link is a move link', link.startsWith(new URL(base).origin + '/#move=z'), link.slice(0, 60) + '… (' + link.length + ' chars)');
  ok('copy key flashed Copied', (await T(A.p, '#bkCopy')) === 'Copied');
  const rt = await A.p.evaluate(async l => { const b = window.__backup; const p = l.split('#move=')[1]; const d = await b.decode(p); return { ok: d.app === 'shift-hours' && d.hours.week[2].brk === '45', desc: b.describe(d) }; }, link);
  ok('link decodes back to the same week', rt.ok, rt.desc);
  ok('describe reads well', /^4 days filled in the week, a shift in the calculator, per diem for Seattle, WA, saved /.test(rt.desc), rt.desc);
  await overflow(A.p, 'move panel');
  await tap(A.p, '#bkClose'); ok('close hides the panel', await A.p.$eval('#movePanel', e => e.hidden));
  ok('A: no page errors', !A.errs.length, A.errs.join(' | '));
  await A.ctx.close();

  // ---- B: a fresh device opens the link ----
  const B = await mk(false);
  await B.p.goto(base); await B.p.evaluate(() => localStorage.clear());
  await B.p.goto(link); await B.p.waitForTimeout(300);
  await B.p.waitForFunction(() => !document.getElementById('inPanel').hidden, null, { timeout: 8000 }).catch(() => {});
  const inTxt = await T(B.p, '#inText');
  ok('B: asked before replacing', /A week from another device is ready:.*4 days filled.*Replace what is on this device\?/.test(inTxt), inTxt);
  await B.p.screenshot({ path: require('path').join(process.env.SHOTS || require('os').tmpdir(), `incoming-${w}-${scheme}.png`), fullPage: true });
  // keep mine first
  await tap(B.p, '#inNo'); await B.p.waitForTimeout(100);
  ok('B: Keep mine hides and clears the hash', await B.p.evaluate(() => document.getElementById('inPanel').hidden && !location.hash && document.getElementById('w0s').value === ''));
  // now accept
  await B.p.goto(link); await B.p.waitForFunction(() => !document.getElementById('inPanel').hidden, null, { timeout: 8000 });
  await Promise.all([B.p.waitForNavigation({ waitUntil: 'load' }), tap(B.p, '#inYes')]); await B.p.waitForTimeout(400);
  const got = await B.p.evaluate(() => ({ w0: document.getElementById('w0s').value, hm: document.getElementById('hm').textContent, hash: location.hash, pd: JSON.parse(localStorage.getItem('shift-hours-perdiem-v1')).sel.n, wk: document.getElementById('wDec').textContent }));
  ok('B: Replace brought the week over', got.w0 === '700' && got.hm.startsWith('8.53') && got.wk === '29.53' && got.pd === 'Seattle' && !got.hash, JSON.stringify(got));
  // bad link
  await B.p.goto(base + '#move=zabc'); await B.p.waitForTimeout(400);
  ok('B: damaged link says so', /damaged/.test(await T(B.p, '#dataMsg')) && await B.p.$eval('#inPanel', e => e.hidden), await T(B.p, '#dataMsg'));
  ok('B: no page errors', !B.errs.length, B.errs.join(' | '));
  await B.ctx.close();

  // ---- C: restore from the file on an empty device ----
  const C = await mk(false);
  await C.p.goto(base); await C.p.evaluate(() => localStorage.clear()); await C.p.reload(); await C.p.waitForTimeout(300);
  await C.p.setInputFiles('#bkFile', file); await C.p.waitForFunction(() => !document.getElementById('inPanel').hidden, null, { timeout: 8000 });
  ok('C: file offer text', /A backup file is ready:.*4 days filled/.test(await T(C.p, '#inText')), await T(C.p, '#inText'));
  await Promise.all([C.p.waitForNavigation({ waitUntil: 'load' }), tap(C.p, '#inYes')]); await C.p.waitForTimeout(400);
  ok('C: restored', (await C.p.$eval('#w2b', e => e.value)) === '45' && (await T(C.p, '#wDec')) === '29.53');
  fs.writeFileSync(path.join(tmp, 'junk.json'), '{"hello":1}');
  await C.p.setInputFiles('#bkFile', path.join(tmp, 'junk.json')); await C.p.waitForTimeout(300);
  ok('C: wrong file refused', /not a Shift Hours backup/.test(await T(C.p, '#dataMsg')));
  ok('C: no page errors', !C.errs.length, C.errs.join(' | '));
  await C.ctx.close();
  await b.close();
  console.log(R.join('\n'));
  const fails = R.filter(r => r.startsWith('FAIL')).length;
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
