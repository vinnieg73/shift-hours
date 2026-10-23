// usage: node oconus.test.js <base> <dataFile> <w> <h> <mobile> <scheme> [shotDir]
// Runs the per diem view against a data file (fake or real) and checks DoD areas: rates, seasons, trip total.
const { chromium } = require('playwright'); const fs = require('fs');
const [base = 'http://127.0.0.1:8832/', dataFile, w = '402', h = '874', mobile = '1', scheme = 'light', shotDir = ''] = process.argv.slice(2);
const R = []; const ok = (n, c, i) => R.push((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  [' + i + ']' : ''));
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2, isMobile: mobile === '1', hasTouch: mobile === '1', colorScheme: scheme });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
  await p.route('**/beacon.min.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  if (dataFile) await p.route('**/data/perdiem-fy*.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(dataFile, 'utf8') }));
  await p.clock.install({ time: new Date('2026-10-20T10:00:00') });
  await p.goto(base + '#perdiem'); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.waitForFunction(() => window.__perdiem && window.__perdiem.core.data);
  const T = async sel => (await p.$(sel)) ? p.$eval(sel, e => e.textContent.trim()) : null;
  const pick = async (q, nth = 0) => { await p.waitForTimeout(350); await p.fill('#pdQ', ''); await p.type('#pdQ', q); await p.waitForTimeout(150); const n = await p.$eval('#pdSug', s => s.hidden ? [] : [...s.querySelectorAll('li[data-i]')].map(x => x.textContent.trim())); if (!n.length) return n; await p.$eval('#pdSug li[data-i]:nth-child(' + (nth + 1) + ')', e => e.click()); await p.waitForTimeout(100); return n; };
  const state = async () => ({ place: await T('#pdPlace'), cty: await T('#pdCty'), L: await T('#pdL'), M: await T('#pdM'), badges: await T('#pdBadges'), status: await T('#pdStatus'), ch: await T('#pdChoices'), mie: await p.$$eval('#pdMie dd', l => l.map(x => x.textContent)), months: await p.$$eval('#pdMonths b', l => l.map(x => x.textContent)), nums: await p.$eval('#pdNums', e => e.hidden) });
  const D = await p.evaluate(() => window.__perdiem.core.data);
  ok('data has oconus block', !!D.oconus, JSON.stringify(D.oconus));

  let s = await pick('Anchorage, AK'); let st = await state();
  ok('Anchorage: suggestion names the area', s[0] && /Anchorage, AK/.test(s[0]) && !/Not in this lookup|Standard/.test(s[0]), s[0]);
  ok('Anchorage: Defense Department rate area', /Defense Department rate area: Anchorage, AK/.test(st.cty), st.cty);
  ok('Anchorage: numbers shown', !st.nums && /^\$\d+$/.test(st.L) && /^\$\d+$/.test(st.M), st.L + ' ' + st.M);
  ok('Anchorage: DoD badge', /Defense Department rate/.test(st.badges), st.badges);
  ok('Anchorage: 12 months', st.months.length === 12, st.months.join(' '));
  const anc = D.areas.find(a => a[0] === 'Anchorage' && a[1] === 'AK');
  if (anc && anc[5] && anc[5].seasons) ok('Anchorage: mid-month season badge', /Changes mid-month on/.test(st.badges), st.badges);
  ok('M&IE breakdown adds up', st.mie.length === 6 && st.mie.slice(0, 4).reduce((a, x) => a + +x.replace('$', ''), 0) === +st.M.replace('$', ''), st.mie.join(' ') + ' = ' + st.M);
  // trip total across a season change (fake data: 289 until Sep 15, 229 from Sep 16; real data: whatever the file says)
  await p.fill('#pdLeave', '2027-09-14'); await p.$eval('#pdLeave', e => e.dispatchEvent(new Event('change')));
  await p.fill('#pdBack', '2027-09-17'); await p.$eval('#pdBack', e => e.dispatchEvent(new Event('change'))); await p.waitForTimeout(100);
  const trip = await p.evaluate(() => { const r = window.__perdiem.compute(); return { total: r.total, hotels: r.days.map(d => d.hotel), ms: r.days.map(d => d.m), rows: document.getElementById('pdBreak').textContent, note: document.getElementById('pdNote').textContent }; });
  const exp = (() => { let t = 0; for (let i = 0; i < 4; i++) { const d = new Date(2027, 8, 14 + i); const rt = { }; const md = (d.getMonth() + 1) * 100 + d.getDate(); const X = anc[5]; let lodging = anc[4][(d.getMonth() + 3) % 12], mie = X && X.mie ? X.mie[(d.getMonth() + 3) % 12] : anc[3]; if (X && X.seasons) for (const sn of X.seasons) { const a1 = +sn[0].replace('/', ''), b1 = +sn[1].replace('/', ''); if (a1 <= b1 ? md >= a1 && md <= b1 : md >= a1 || md <= b1) { lodging = sn[2]; mie = sn[3]; break; } } t += (i < 3 ? lodging : 0) + (i === 0 || i === 3 ? mie * .75 : mie); } return t; })();
  ok('Anchorage trip total follows the seasons day by day', Math.abs(trip.total - exp) < 0.005, trip.total + ' vs ' + exp + ' hotels ' + trip.hotels.join('/') + ' rows: ' + trip.rows);
  if (shotDir) { fs.mkdirSync(shotDir, { recursive: true }); await p.screenshot({ path: shotDir + '/anchorage-' + w + '-' + scheme + '.png', fullPage: true }); }
  await p.click('#pdClear');

  s = await pick('Honolulu'); st = await state();
  ok('Honolulu: Oahu area', /Defense Department rate area: (Honolulu|Oahu), HI/.test(st.cty), st.cty);
  s = await pick('96766'); st = await state();
  ok('ZIP 96766 (Lihue): Kauai', /(Lihue|Kauai), HI/.test(st.cty) && /96766/.test(st.place), st.place + ' | ' + st.cty);
  s = await pick('San Juan, PR'); st = await state();
  ok('San Juan: DoD area', /Defense Department rate area: San Juan, PR/.test(st.cty), st.cty);
  s = await pick('Guam'); st = await state();
  ok('Guam: an area, not "not in this lookup"', st.cty && /Defense Department rate area/.test(st.cty), st.cty + ' | ' + (s[0] || ''));
  s = await pick('Saipan'); st = await state();
  ok('Saipan: DoD area', /Saipan, MP/.test(st.cty), st.cty);
  s = await pick('Pago Pago'); st = await state();
  ok('Pago Pago: American Samoa area', /, AS$/.test(st.cty), st.cty);
  s = await pick('Kenai, AK'); st = await state();
  ok('Kenai: Kenai-Soldotna (or Rest of Alaska on sample data)', /(Kenai-Soldotna|Rest of Alaska), AK/.test(st.cty), st.cty);
  s = await pick('Akiachak'); st = await state(); ok('Akiachak: Rest of Alaska', /Rest of Alaska, AK/.test(st.cty), st.cty);
  s = await pick('Christiansted'); st = await state();
  ok('Christiansted: a VI area', /, VI$/.test(st.cty), st.cty);
  s = await pick('Tokyo'); ok('Tokyo: no such place', !s.some(x => /^Tokyo/.test(x)), JSON.stringify(s));
  s = await pick('Oahu'); st = await state(); ok('Oahu: island name is searchable', /Oahu, HI/.test(st.cty), st.cty + ' | ' + (s[0] || ''));
  s = await pick('Apo Ae'); if (s.length) { st = await state(); ok('APO: still outside, no numbers', st.nums && /isn’t in this lookup/.test(st.ch), st.ch); } else ok('APO: no military mail place to test', true);
  s = await pick('Seattle, WA'); st = await state();
  ok('Seattle still GSA', /^Rate area: Seattle, WA/.test(st.cty) && !/Defense/.test(st.badges), st.cty);
  s = await pick('Monowi, NE'); st = await state();
  ok('Standard rate still works', /Standard rate/.test(st.cty), st.cty);
  const help = await p.$eval('#pdView .help ul', e => e.textContent);
  ok('help names all the DoD places', /Alaska, Hawaii, Puerto Rico, Guam/.test(help) && !/Covers the 48/.test(help));
  const [sw, iw] = await p.evaluate(() => [document.scrollingElement.scrollWidth, innerWidth]); ok('no horizontal overflow', sw <= iw, sw + '/' + iw);
  ok('no page errors', errs.length === 0, JSON.stringify(errs));
  await b.close();
  console.log(R.join('\n')); const f = R.filter(x => x.startsWith('FAIL')).length; console.log(f ? 'FAILS: ' + f : 'ALL PASSED'); process.exit(f ? 1 : 0);
})().catch(e => { console.log('CRASH', e); process.exit(2); });
