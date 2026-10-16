<script>
(() => {
  // SAMPLE rates for the mockup only (not the official GSA table). Lodging by month, Jan..Dec.
  const STD = { l: 113, m: 68 };
  const fill = (a) => a.length === 1 ? Array(12).fill(a[0]) : a;
  const PLACES = [
    { st: 'MA', name: 'Boston / Cambridge', cty: 'Suffolk and Middlesex counties', cities: ['Boston', 'Cambridge', 'Somerville', 'Newton'], zips: ['02108', '02139'], m: 92, l: fill([239,239,239,319,319,319,299,299,339,349,239,239]) },
    { st: 'IL', name: 'Chicago', cty: 'Cook and Lake counties', cities: ['Chicago', 'Evanston', 'Oak Park'], zips: ['60601', '60614'], m: 92, l: fill([159,159,159,219,219,219,229,229,239,229,159,159]) },
    { st: 'NY', name: 'New York City', cty: 'Bronx, Kings, New York, Queens and Richmond counties', cities: ['New York', 'Brooklyn', 'Manhattan', 'Queens', 'Bronx'], zips: ['10001', '11201'], m: 92, l: fill([226,226,226,290,290,290,276,276,316,316,316,316]) },
    { st: 'DC', name: 'Washington DC', cty: 'Also Arlington, Fairfax and Alexandria, VA', cities: ['Washington', 'Arlington, VA', 'Alexandria, VA', 'Fairfax, VA'], zips: ['20001', '22201'], m: 92, l: fill([183,183,258,258,258,258,192,192,258,276,183,183]) },
    { st: 'CO', name: 'Denver / Aurora', cty: 'Denver, Adams, Arapahoe and Jefferson counties', cities: ['Denver', 'Aurora', 'Lakewood'], zips: ['80202'], m: 92, l: fill([199,199,209,209,229,239,239,239,229,219,199,199]) },
    { st: 'FL', name: 'Orlando', cty: 'Orange County', cities: ['Orlando', 'Kissimmee'], zips: ['32801'], m: 74, l: fill([175,175,175,155,155,130,130,130,130,140,140,140]) },
    { st: 'FL', name: 'Miami', cty: 'Miami-Dade County', cities: ['Miami', 'Miami Beach', 'Hialeah'], zips: ['33130'], m: 86, l: fill([259,259,259,209,179,169,169,169,169,189,219,239]) },
    { st: 'GA', name: 'Atlanta', cty: 'Fulton, DeKalb and Cobb counties', cities: ['Atlanta', 'Marietta', 'Decatur'], zips: ['30303'], m: 86, l: fill([179]) },
    { st: 'OH', name: 'Columbus', cty: 'Franklin County', cities: ['Columbus', 'Dublin'], zips: ['43215'], m: 74, l: fill([150]) },
    { st: 'TX', name: 'Austin', cty: 'Travis County', cities: ['Austin'], zips: ['78701'], m: 80, l: fill([199,199,229,199,199,169,169,169,179,199,189,169]) },
    { st: 'WA', name: 'Seattle', cty: 'King County', cities: ['Seattle', 'Bellevue', 'Redmond'], zips: ['98101'], m: 92, l: fill([199,199,199,219,252,252,252,252,252,219,199,199]) }
  ];
  const STATES = 'AL AZ AR CA CO CT DE DC FL GA ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
  // M&IE split by tier: breakfast, lunch, dinner, incidentals
  const SPLIT = { 68: [16,19,28,5], 74: [18,20,31,5], 80: [20,22,33,5], 86: [22,23,36,5], 92: [23,26,38,5] };
  const MEALS = ['B', 'L', 'D'], MEALN = ['breakfast', 'lunch', 'dinner'];
  const KEY = 'shift-hours-perdiem-mock2';
  const DEF = { sel: { p: 'Boston / Cambridge', city: 'Boston', st: 'MA' }, leave: '2026-10-19', back: '2026-10-22', given: { '2026-10-20': [false, true, false] } };
  let P; try { P = JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { P = null; }
  if (!P || typeof P !== 'object' || !P.sel) P = JSON.parse(JSON.stringify(DEF));
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {} };
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const money = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const usd = (n) => '$' + money(n), whole = (n) => '$' + money(n).replace(/\.00$/, '');
  const parseD = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const FY_START = parseD('2026-10-01'), FY_END = parseD('2027-09-30');
  const cityOf = (c, pl) => c.includes(',') ? c.split(',')[0].trim() : c;
  const stOf = (c, pl) => c.includes(',') ? c.split(',')[1].trim() : pl.st;

  function pill(seg) { const b = seg.querySelector('button[aria-pressed="true"]'); if (!b || !b.offsetWidth) return; seg.style.setProperty('--px', b.offsetLeft + 'px'); seg.style.setProperty('--pw', b.offsetWidth + 'px'); seg.style.setProperty('--po', '1'); }
  function press(seg, btn) { seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === btn))); pill(seg); }

  // ---- view switch ----
  const viewSeg = $('viewSeg');
  function setView(v, keep) {
    document.body.dataset.view = v;
    $('hrView').hidden = v !== 'hr'; $('pdView').hidden = v !== 'pd';
    press(viewSeg, viewSeg.querySelector('[data-v="' + v + '"]'));
    document.querySelector('.sub').textContent = v === 'pd' ? 'GSA lodging and meal rates for any U.S. city.' : 'Hours and minutes between two times, minus breaks.';
    if (!keep) { try { localStorage.setItem(KEY + '-view', v); } catch (e) {} }
    requestAnimationFrame(() => document.querySelectorAll('.seg.slide').forEach(pill));
  }
  viewSeg.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setView(b.dataset.v); });

  // ---- search ----
  const norm = (t) => t.toLowerCase().replace(/[^a-z0-9, ]/g, '').replace(/\s+/g, ' ').trim();
  function search(q) {
    const n = norm(q); if (!n) return [];
    const out = [];
    if (/^\d{3,5}$/.test(n)) {
      PLACES.forEach(pl => pl.zips.forEach(z => { if (z.startsWith(n)) out.push({ p: pl.name, city: cityOf(pl.cities[0]), st: pl.st, zip: z }); }));
      return out.slice(0, 6);
    }
    const [cq, sq] = n.split(',').map(x => (x || '').trim());
    PLACES.forEach(pl => pl.cities.forEach(c => {
      const cn = norm(cityOf(c)), st = stOf(c, pl);
      if (cn.startsWith(cq) && (!sq || st.toLowerCase().startsWith(sq))) out.push({ p: pl.name, city: cityOf(c), st });
    }));
    if (sq && STATES.includes(sq.toUpperCase()) && cq.length > 1 && !out.some(o => norm(o.city) === cq))
      out.push({ p: null, city: q.split(',')[0].trim().replace(/\b\w/g, ch => ch.toUpperCase()), st: sq.toUpperCase() });
    return out.slice(0, 6);
  }
  const q = $('pdQ'), sug = $('pdSug'); let hits = [], act = 0;
  function showSug() {
    hits = search(q.value); act = 0;
    const err = $('pdErr');
    if (!hits.length && q.value.trim().length > 2) {
      err.hidden = false; err.textContent = /^\d+$/.test(q.value.trim()) ? 'That ZIP isn\'t in this mockup\'s sample data. Try 02108, 10001 or 60601.' : 'Add the state to look up any city, like "Dayton, OH". Places not on GSA\'s list get the standard rate.';
    } else err.hidden = true;
    sug.innerHTML = hits.map((h, i) => '<li role="option" id="sg' + i + '" data-i="' + i + '" aria-selected="' + (i === act) + '"' + (h.p ? '' : ' class="std"') + '><b>' + esc(h.city) + ', ' + h.st + (h.zip ? ' ' + h.zip : '') + '</b><span>' + (h.p ? esc(h.p) + ' rate' : 'Standard rate') + '</span></li>').join('');
    sug.hidden = !hits.length; q.setAttribute('aria-expanded', String(!!hits.length));
  }
  function choose(h) { if (!h) return; P.sel = h; q.value = ''; sug.hidden = true; $('pdErr').hidden = true; q.setAttribute('aria-expanded', 'false'); save(); render(); q.blur(); }
  q.addEventListener('input', showSug);
  q.addEventListener('focus', () => { if (q.value) showSug(); });
  q.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!hits.length) return; e.preventDefault(); act = (act + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length; [...sug.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === act))); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(hits[act]); }
    else if (e.key === 'Escape') { sug.hidden = true; }
  });
  sug.addEventListener('mousedown', e => { const li = e.target.closest('li'); if (li) { e.preventDefault(); choose(hits[+li.dataset.i]); } });
  q.addEventListener('blur', () => setTimeout(() => { sug.hidden = true; }, 120));
  document.querySelectorAll('.try').forEach(b => b.addEventListener('click', () => { const h = search(b.dataset.q)[0]; choose(h); }));

  const place = () => P.sel && P.sel.p ? PLACES.find(p => p.name === P.sel.p) || null : null;

  function renderRates() {
    const pl = place(), now = new Date(), mNow = now.getMonth();
    const L = pl ? pl.l : Array(12).fill(STD.l), m = pl ? pl.m : STD.m, sp = SPLIT[m];
    $('pdPlace').textContent = P.sel.city + ', ' + P.sel.st + (P.sel.zip ? ' ' + P.sel.zip : '');
    $('pdCty').textContent = pl ? 'Rate area: ' + pl.name + ' · ' + pl.cty : 'Not on GSA\'s list, so the standard rate applies';
    $('pdLk').textContent = 'Lodging in ' + MON[mNow];
    $('pdL').innerHTML = '<span class="cur">$</span>' + L[mNow];
    $('pdM').innerHTML = '<span class="cur">$</span>' + m;
    const order = [9,10,11,0,1,2,3,4,5,6,7,8], hi = Math.max(...L), lo = Math.min(...L);
    $('pdMonths').innerHTML = order.map(i => '<div class="mo' + (i === mNow ? ' now' : '') + (hi !== lo && L[i] === hi ? ' hi' : '') + (hi !== lo && L[i] === lo ? ' lo' : '') + '"><span>' + MON[i] + '</span><b>$' + L[i] + '</b></div>').join('');
    $('pdLnote').textContent = hi === lo ? 'Same all year' : 'Changes by season';
    $('pdMie').innerHTML = ['Breakfast', 'Lunch', 'Dinner', 'Incidentals'].map((k, i) => '<div><dt>' + k + '</dt><dd>$' + sp[i] + '</dd></div>').join('') +
      '<div class="wide"><dt>Full day</dt><dd>$' + m + '</dd></div><div class="wide travel"><dt>First &amp; last day</dt><dd>' + whole(m * .75) + '</dd></div>';
    $('pdBadges').innerHTML = pl ? '' : '<span class="badge">Standard rate</span>';
    $('pdStatus').textContent = P.sel.city + ': lodging $' + L[mNow] + ' a night, M&IE $' + m + ' a day';
  }

  function compute() {
    const a = parseD(P.leave), b = parseD(P.back);
    if (!a || !b) return { err: 'Add the day you leave and the day you return to see a trip total.' };
    if (b < a) return { err: 'The return day is before the day you leave.' };
    if (a < FY_START || b > FY_END) return { err: 'This mockup only has FY 2027 rates (Oct 1, 2026 to Sep 30, 2027).' };
    const n = Math.round((b - a) / 864e5) + 1;
    if (n > 30) return { err: 'Trips longer than 30 days use different rules. Try a shorter trip.' };
    const pl = place(), m = pl ? pl.m : STD.m, split = SPLIT[m];
    const days = [];
    for (let i = 0; i < n; i++) {
      const d = new Date(a.getFullYear(), a.getMonth(), a.getDate() + i), k = iso(d);
      const night = i < n - 1, hotel = night ? (pl ? pl.l[d.getMonth()] : STD.l) : 0;
      const travel = n === 1 || i === 0 || i === n - 1, base = travel ? m * 0.75 : m;
      const given = (P.given[k] || [false, false, false]);
      const off = given.reduce((s, g, j) => s + (g ? split[j] : 0), 0);
      days.push({ d, k, night, hotel, travel, base, given, off, mie: Math.max(0, base - off) });
    }
    const sum = (f) => days.reduce((s, x) => s + f(x), 0);
    return { n, nights: n - 1, m, pl, days,
      hotel: sum(x => x.hotel), full: days.filter(x => !x.travel).length, travelN: days.filter(x => x.travel).length,
      fullAmt: sum(x => x.travel ? 0 : x.base), travelAmt: sum(x => x.travel ? x.base : 0), off: sum(x => Math.min(x.off, x.base)),
      total: sum(x => x.hotel + x.mie) };
  }

  function renderTrip() {
    $('pdLeave').value = P.leave || ''; $('pdBack').value = P.back || '';
    const r = compute();
    $('pdBack').classList.toggle('bad', !!r.err && /before/.test(r.err));
    const out = $('pdTripOut');
    if (r.err) { $('pdTotal').innerHTML = '<span class="cur">$</span>0<span class="cts">.00</span>'; $('pdTotal').classList.add('err'); $('pdCopy').disabled = true; $('pdBreak').innerHTML = ''; $('pdRows').innerHTML = ''; $('pdNote').textContent = r.err; $('pdDaysDisc').hidden = true; return; }
    $('pdDaysDisc').hidden = false; $('pdTotal').classList.remove('err'); $('pdCopy').disabled = false;
    const t = money(r.total).split('.');
    $('pdTotal').innerHTML = '<span class="cur">$</span>' + t[0] + '<span class="cts">.' + t[1] + '</span>';
    const rows = [];
    if (r.nights) { const c = [...new Set(r.days.filter(x => x.night).map(x => x.hotel))]; rows.push(['Lodging', r.nights + ' night' + (r.nights > 1 ? 's' : '') + (c.length === 1 ? ' × $' + c[0] : ', by month'), usd(r.hotel)]); }
    if (r.full) rows.push(['M&IE', r.full + ' full day' + (r.full > 1 ? 's' : '') + ' × $' + r.m, usd(r.fullAmt)]);
    rows.push(['Travel days', r.travelN + ' × ' + whole(r.m * .75) + ' (75%)', usd(r.travelAmt)]);
    const gl = {}; r.days.forEach(x => x.given.forEach((g, j) => { if (g) gl[MEALN[j]] = (gl[MEALN[j]] || 0) + 1; }));
    if (Object.keys(gl).length) rows.push(['Meals given', Object.keys(gl).map(k => gl[k] + ' ' + k).join(', '), '−' + usd(r.off), 'minus']);
    $('pdBreak').innerHTML = rows.map(x => '<dt>' + x[0] + '</dt><dd>' + x[1] + '</dd><dd class="amt' + (x[3] ? ' ' + x[3] : '') + '">' + x[2] + '</dd>').join('');
    const fmtD = (d) => DOW[d.getDay()] + ' ' + MON[d.getMonth()] + ' ' + d.getDate();
    $('pdNote').innerHTML = r.n === 1 ? 'Same-day trip: no lodging, and M&amp;IE only if it ran over 12 hours.' : '<b>' + r.nights + ' night' + (r.nights > 1 ? 's' : '') + '</b> in ' + esc(P.sel.city) + ', ' + fmtD(r.days[0].d) + ' to ' + fmtD(r.days[r.n - 1].d) + '.';
    $('pdRows').innerHTML = r.days.map((x, i) => '<div class="drow">' +
      '<div class="dday"><b>' + fmtD(x.d) + '</b><span>' + (r.n === 1 ? 'Same day' : i === 0 ? 'Leave' : i === r.n - 1 ? 'Return' : 'Day ' + (i + 1)) + '</span></div>' +
      (x.night ? '<div class="dhotel">$' + x.hotel + '</div>' : '<div class="dhotel none">No hotel</div>') +
      '<div class="dmeals">' + MEALS.map((mm, j) => '<button type="button" class="mchip" data-k="' + x.k + '" data-j="' + j + '" aria-pressed="' + x.given[j] + '" aria-label="' + MEALN[j] + ' given ' + fmtD(x.d) + '">' + mm + '</button>').join('') + '</div>' +
      '<div class="dmie"><b>' + usd(x.mie) + '</b><span class="' + (x.travel ? 'travel' : '') + '">' + (x.travel ? '75% day' : 'Full day') + (x.off ? ' · −$' + x.off : '') + '</span></div></div>').join('');
  }
  function render() { renderRates(); renderTrip(); }
  const set = (fn) => { fn(); save(); render(); };
  $('pdLeave').addEventListener('change', e => set(() => { P.leave = e.target.value; if (P.back && P.back < P.leave) P.back = P.leave; }));
  $('pdBack').addEventListener('change', e => set(() => { P.back = e.target.value; }));
  $('pdRows').addEventListener('click', e => { const b = e.target.closest('.mchip'); if (!b) return; set(() => { const g = (P.given[b.dataset.k] || [false, false, false]).slice(); g[+b.dataset.j] = !g[+b.dataset.j]; P.given[b.dataset.k] = g; }); });
  $('pdClear').addEventListener('click', () => set(() => { P.leave = ''; P.back = ''; P.given = {}; }));
  $('pdCopy').addEventListener('click', () => {
    const r = compute(); if (r.err) return; const btn = $('pdCopy');
    const done = () => { btn.classList.add('ok'); btn.textContent = 'Copied'; setTimeout(() => { btn.classList.remove('ok'); btn.textContent = 'Copy'; }, 1400); };
    try { navigator.clipboard.writeText(money(r.total)).then(done, done); } catch (e) { done(); }
  });
  $('pdForm').addEventListener('submit', e => e.preventDefault());

  render();
  let v = location.hash === '#perdiem' ? 'pd' : location.hash === '#hours' ? 'hr' : null;
  if (!v) { try { v = localStorage.getItem(KEY + '-view'); } catch (e) {} }
  setView(v === 'hr' ? 'hr' : 'pd', true);
})();
</script>
