// usage: node smoke.js <base> <w> <h> <mobile 0/1> <scheme>
const { chromium } = require('playwright');
const [base = 'http://127.0.0.1:8831/', w = '402', h = '874', mobile = '1', scheme = 'light'] = process.argv.slice(2);
const results = [];
const ok = (name, cond, info) => results.push((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  [' + info + ']' : ''));
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2, isMobile: mobile === '1', hasTouch: mobile === '1', colorScheme: scheme, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
  await p.route('**/beacon.min.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await p.goto(base); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(500);
  const T = sel => p.$eval(sel, e => e.textContent.trim());
  const overflow = async tag => { const [sw, iw] = await p.evaluate(() => [document.scrollingElement.scrollWidth, innerWidth]); ok('no horizontal overflow (' + tag + ')', sw <= iw, sw + '/' + iw); };
  const tap = async sel => { await p.waitForTimeout(350); return mobile === '1' ? p.tap(sel) : p.click(sel); };
  const type = async (sel, v) => { await p.fill(sel, ''); await p.type(sel, v); await p.$eval(sel, e => e.blur()); };
  const hasStrip = await p.$('#strip');
  // days fold: open a day (tap its line or its add key) before typing into it
  const openDay = async i => { if (await p.$('#wd' + i)) await tap('#wd' + i); };

  // first visit (empty storage): a finished-looking empty state, not real-looking data
  const fv = await p.evaluate(() => { const h = document.getElementById('hm'); return { idle: h.classList.contains('idle'), ghost: getComputedStyle(h, '::before').content, start: document.getElementById('startIn').value, end: document.getElementById('endIn').value, ph: document.getElementById('startIn').placeholder, hint: getComputedStyle(document.getElementById('hint')).display !== 'none', copyOff: document.getElementById('copyDec').disabled, adds: document.querySelectorAll('#wrows .wrow.m-add').length }; });
  ok('first visit: hero shows faint 0.00 empty state', fv.idle && fv.ghost.includes('0.00') && fv.copyOff, JSON.stringify(fv));
  ok('first visit: blank boxes with example placeholders', fv.start === '' && fv.end === '' && !!fv.ph);
  ok('first visit: typing hint shown', fv.hint);
  ok('first visit: every day is an add key', fv.adds === 7, fv.adds);

  // calculator
  await type('#startIn', '845'); await tap('#startIn-am'); await type('#endIn', '517'); await tap('#endIn-pm');
  ok('845 AM -> 517 PM = 8.53', (await T('#hm')).startsWith('8.53'), await T('#hm'));
  ok('h:mm 8:32', (await T('#hm2')) === '8:32', await T('#hm2'));
  ok('512 min', (await T('#mins')) === '512');
  if (await p.$('#startInEcho')) ok('echo 8:45 / 5:17', (await T('#startInEcho')) === '8:45' && (await T('#endInEcho')) === '5:17', (await T('#startInEcho')) + ' ' + (await T('#endInEcho')));
  if (hasStrip) {
    const cells = await p.$$eval('#strip .cell', cs => cs.map(c => c.classList.contains('on') ? 1 : 0).join(''));
    ok('strip worked cells 8..17', cells === '000000001111111111000000', cells);
    const part = await p.$$eval('#strip .cell', cs => [cs[8].querySelector('i').style.left, cs[17].querySelector('i').style.width]);
    ok('strip partial fills 75% start / 28.33% end', parseFloat(part[0]) === 75 && parseFloat(part[1]) === 28.33, part.join(' '));
    ok('scale 12-hour', (await T('#hlabels')) === '12a6a12p6p12a', await T('#hlabels'));
    ok('now label', /^Now \d{1,2}:\d\d [AP]M$/.test(await T('#nowTxt')), await T('#nowTxt'));
    ok('legend span', (await T('#spanText')) === '8:45 AM → 5:17 PM', await T('#spanText'));
  }
  await overflow('hours');
  await tap('#breakCount [data-n="1"]'); await type('#bmin0', '30');
  ok('30-min break -> 8.03', (await T('#hm')).startsWith('8.03'), await T('#hm'));
  ok('break shown in h:mm line', (await T('#brk')).includes('30'), await T('#brk'));
  // 24-hour
  await tap('#fmt24');
  ok('24h converts start/end', (await p.inputValue('#startIn')) === '0845' && (await p.inputValue('#endIn')) === '1717', (await p.inputValue('#startIn')) + ' ' + (await p.inputValue('#endIn')));
  ok('24h total unchanged 8.03', (await T('#hm')).startsWith('8.03'));
  ok('24h has no AM/PM', !(await p.$('#startIn-am')));
  if (hasStrip) { ok('scale 24-hour', (await T('#hlabels')) === '0006121824', await T('#hlabels')); ok('echo 24h 08:45', (await T('#startInEcho')) === '08:45', await T('#startInEcho')); }
  await overflow('24h');
  await tap('#fmt12');
  ok('back to 12h', (await p.inputValue('#startIn')) === '845' && await p.$eval('#endIn-pm', e => e.getAttribute('aria-pressed')) === 'true');
  // overnight
  await tap('#breakCount [data-n="0"]');
  await type('#startIn', '1000'); await tap('#startIn-pm'); await type('#endIn', '600'); await tap('#endIn-am');
  ok('overnight 10 PM -> 6 AM = 8.00', (await T('#hm')).startsWith('8.00'), await T('#hm'));
  ok('Ends next day badge', (await T('#badges')).includes('Ends next day'), await T('#badges'));
  if (hasStrip) { const cells = await p.$$eval('#strip .cell', cs => cs.map(c => c.classList.contains('on') ? 1 : 0).join('')); ok('overnight strip wraps', cells === '111111000000000000000011', cells); }
  // rounding 15
  if (!(await p.$eval('#settingsDisc', d => d.open))) await tap('#settingsDisc > summary');
  await tap('#roundSeg [data-r="15"]');
  await type('#startIn', '907'); await tap('#startIn-am'); await type('#endIn', '508'); await tap('#endIn-pm');
  ok('rounding 15: 9:07-5:08 -> 9:00-5:15 = 8.25', (await T('#hm')).startsWith('8.25'), await T('#hm'));
  ok('rounding badge', (await T('#badges')).includes('Rounded to'), await T('#badges'));
  ok('settings value shows 15', (await T('#roundVal')).includes('15'), await T('#roundVal'));
  await overflow('settings open');
  await tap('#roundSeg [data-r="0"]');
  // copy
  for (const id of ['#copyDec', '#copyHm']) { await tap(id); await p.waitForTimeout(150); ok('copy ' + id + ' flips', /Copied|Select/.test(await T(id)), await T(id)); }
  const clip = await p.evaluate(() => navigator.clipboard.readText().catch(e => 'ERR ' + e.message));
  ok('clipboard has h:mm', clip === '8:01', clip);
  // clear
  await tap('#clear');
  ok('Clear empties fields', (await p.inputValue('#startIn')) === '' && (await p.inputValue('#endIn')) === '');
  ok('Clear -> dash', (await T('#hm')) === '—', await T('#hm'));
  ok('Clear: copy disabled', await p.$eval('#copyDec', e => e.disabled));

  // week
  await openDay(0); await type('#w0s', '700'); await type('#w0e', '330'); await type('#w0b', '30');
  await openDay(1); await type('#w1s', '845'); await type('#w1e', '517');
  ok('Mon 7:00-3:30 brk 30 = 8.00', (await T('#wh0')).startsWith('8.00'), await T('#wh0'));
  ok('Tue 8:45-5:17 = 8.53', (await T('#wh1')).startsWith('8.53'), await T('#wh1'));
  ok('week total 16.53 copy enabled', (await T('#wDec')) === '16.53' && !(await p.$eval('#copyWeek', e => e.disabled)), await T('#wDec'));
  await tap('#copyWeek'); await p.waitForTimeout(100);
  ok('week copy', (await p.evaluate(() => navigator.clipboard.readText())) === '16.53');
  await openDay(4); await type('#w4s', '800');
  if (await p.$('#wd0')) {
    const fold = await p.evaluate(() => { const r = document.getElementById('wr0'), b = document.getElementById('wd0'); return [r.classList.contains('m-fold'), b.offsetWidth > 0, b.getAttribute('aria-expanded'), b.textContent, document.getElementById('w0s').offsetWidth]; });
    ok('complete day folds to one line with its hours', fold[0] && fold[1] && fold[2] === 'false' && fold[3].includes('8.00') && fold[3].includes('7:00a') && fold[4] === 0, JSON.stringify(fold));
    const add = await p.evaluate(() => { const r = document.getElementById('wr5'), b = document.getElementById('wd5'); return [r.classList.contains('m-add'), b.offsetWidth > 0, b.textContent.trim(), document.getElementById('w5s').offsetWidth]; });
    ok('empty day shows an add key', add[0] && add[1] && add[2].includes('Sat') && add[3] === 0, JSON.stringify(add));
    ok('unfinished Fri stays open', await p.$eval('#wr4', e => e.classList.contains('m-edit')) && await p.$eval('#wd4', e => e.getAttribute('aria-expanded')) === 'true');
  }
  ok('Fri missing end message', (await T('#wmsg4')) === 'Add an end time', await T('#wmsg4'));
  const need = await p.$eval('#w4e', e => e.classList.contains('need') + ' ' + getComputedStyle(e).borderTopColor);
  ok('Fri end outlined (need)', !hasStrip || need.startsWith('true'), need);
  ok('Fri msg red', await p.$eval('#wmsg4', e => e.classList.contains('bad') || !document.getElementById('strip')));
  ok('not counted line', !(await p.$eval('#wWarn', e => e.hidden)) && (await T('#wWarn')).startsWith('Fri not counted'), await T('#wWarn'));
  ok('total still 16.53 and copy off', (await T('#wDec')) === '16.53' && await p.$eval('#copyWeek', e => e.disabled));
  ok('days count', (await T('#wDays')).includes('2 days'), await T('#wDays'));
  await overflow('week');
  // week fit on phone: no cell overflow
  const clipped = await p.evaluate(() => [...document.querySelectorAll('#wrows .tin, #wrows .wh b, #wrows .wh span, .wcols span, #wrows .wday')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.id || e.textContent).join(','));
  ok('no clipped week cells', !clipped, clipped);
  if (mobile === '1') {
    await openDay(0);
    const visibleBtns = await p.$$eval('#wrows .wrow:first-child .seg.ap button', bs => bs.filter(b => b.offsetWidth).length);
    ok('phone: one AM/PM chip per field', visibleBtns === 2, visibleBtns);
    await tap('#w0s-am'); ok('chip flips to PM', await p.$eval('#w0s-pm', e => e.getAttribute('aria-pressed')) === 'true');
    await tap('#w0s-pm'); ok('chip flips back to AM', await p.$eval('#w0s-am', e => e.getAttribute('aria-pressed')) === 'true');
    ok('Mon back to 8.00', (await T('#wh0')).startsWith('8.00'));
  }
  // persistence
  await p.waitForTimeout(400);
  await p.reload(); await p.waitForTimeout(600);
  ok('reload keeps week', (await p.inputValue('#w1s')) === '845' && (await T('#wh1')).startsWith('8.53'));
  ok('reload keeps stored key', await p.evaluate(() => !!JSON.parse(localStorage.getItem('shift-hours-v1')).week));
  ok('reload: Fri still missing', (await T('#wmsg4')) === 'Add an end time');
  // clear week (two taps)
  // per diem
  await tap('#viewSeg [data-v="pd"]');
  await p.waitForFunction(() => window.__perdiem && window.__perdiem.core.data, null, { timeout: 10000 });
  await p.fill('#pdQ', ''); await p.type('#pdQ', 'Seattle, WA');
  await p.waitForSelector('#pdSug li[data-i]');
  ok('suggestion Seattle first', (await T('#pdSug li[data-i="0"] b')) === 'Seattle, WA', await T('#pdSug li[data-i="0"] b'));
  await tap('#pdSug li[data-i="0"]');
  await p.waitForTimeout(200);
  const nov = await p.$$eval('#pdMonths .mo', ms => ms.map(m => m.textContent));
  ok('Nov lodging $188', nov[1] === 'Nov$188', nov.join(' '));
  ok('M&IE $92', (await T('#pdM')) === '$92', await T('#pdM'));
  ok('current month marked', await p.$eval('#pdMonths .mo.now', e => { const c = getComputedStyle(e); return c.outlineStyle === 'solid' && c.backgroundColor !== 'rgba(0, 0, 0, 0)' && getComputedStyle(e.querySelector('b')).fontWeight === '600'; }));
  for (const [id, v] of [['#pdLeave', '2026-11-09'], ['#pdBack', '2026-11-12']]) { await p.$eval(id, (e, v) => { e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }, v); }
  ok('trip total $886.00', (await T('#pdTotal')) === '$886.00', await T('#pdTotal'));
  await tap('#pdRows .mchip[data-j="0"]');
  ok('B off -> $863.00', (await T('#pdTotal')) === '$863.00', await T('#pdTotal'));
  const chipStyle = await p.$eval('#pdRows .mchip[aria-pressed="true"]', e => getComputedStyle(e).color + ' ' + getComputedStyle(e).textDecorationLine);
  ok('given chip struck through, not red', chipStyle.includes('line-through') && !/rgb\((179|255), (38|123)/.test(chipStyle), chipStyle);
  await tap('#pdCopy'); await p.waitForTimeout(100);
  ok('trip copy', (await p.evaluate(() => navigator.clipboard.readText())) === '863.00');
  await tap('#pdRows .mchip[data-j="0"]');
  ok('B back -> $886.00', (await T('#pdTotal')) === '$886.00');
  await overflow('per diem');
  const clippedPd = await p.evaluate(() => [...document.querySelectorAll('#pdView .dday b, #pdView .dmie b, #pdView .dmie span, #pdView .mo b, #pdView .stat .k, #pdView .bd dd, #pdView .mie dt')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent).join(','));
  ok('no clipped per diem text', !clippedPd, clippedPd);
  // Austin choices
  await p.fill('#pdQ', ''); await p.type('#pdQ', 'Austin, TX');
  await p.waitForSelector('#pdSug li[data-i]');
  await tap('#pdSug li[data-i="0"]'); await p.waitForTimeout(200);
  const nch = await p.$$eval('#pdChoices .choice', c => c.length);
  ok('Austin, TX offers choices', nch > 1 && await p.$eval('#pdNums', e => e.hidden), nch + ' choices');
  if (nch > 1) { await tap('#pdChoices .choice'); await p.waitForTimeout(100); ok('pick a choice shows rates', !(await p.$eval('#pdNums', e => e.hidden)) && await p.$eval('#pdChoices .choice', e => e.getAttribute('aria-pressed')) === 'true'); }
  await overflow('choices');
  // hashes
  await p.goto(base + '#hours'); await p.waitForTimeout(500);
  ok('#hours shows hours', !(await p.$eval('#hrView', e => e.hidden)) && await p.$eval('#pdView', e => e.hidden));
  await p.goto(base + '#perdiem'); await p.reload(); await p.waitForTimeout(800);
  ok('#perdiem shows per diem', await p.$eval('#hrView', e => e.hidden) && !(await p.$eval('#pdView', e => e.hidden)));
  await p.evaluate(() => { location.hash = 'hours'; }); await p.waitForTimeout(300);
  ok('hashchange to #hours', !(await p.$eval('#hrView', e => e.hidden)));
  // clear week two taps
  await tap('#clearWeek'); ok('clear week arms', (await T('#clearWeek')) === 'Tap again to clear');
  await tap('#clearWeek'); ok('clear week clears', (await p.inputValue('#w0s')) === '' && (await T('#wDec')) === '0.00');
  ok('no console errors', !errs.length, errs.join(' | '));
  console.log(results.join('\n'));
  console.log('FAILS:', results.filter(r => r.startsWith('FAIL')).length, '/', results.length);
  await b.close();
})().catch(e => { console.log(results.join('\n')); console.error('CRASH', e); process.exit(1); });
