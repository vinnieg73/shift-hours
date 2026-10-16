// Runs the page's own per diem lookup (the pd-core block in index.html) over every ZIP and place.
// Usage: node scripts/check_perdiem.mjs index.html data/perdiem-fy2027.json .perdiem-src/expect.json
import { readFileSync } from 'node:fs';

const [page, dataPath, expPath] = process.argv.slice(2);
const html = readFileSync(page, 'utf8');
const m = /\/\* pd-core:start[^]*?\*\/([^]*?)\/\* pd-core:end \*\//.exec(html);
if (!m) { console.error('pd-core block not found in ' + page); process.exit(2); }
const PD = new Function(m[1] + '\nreturn PDcore;')();
const data = JSON.parse(readFileSync(dataPath, 'utf8'));
const exp = JSON.parse(readFileSync(expPath, 'utf8'));
const t0 = Date.now();
const n = PD.index(data);
console.log(`index: ${n} places in ${Date.now() - t0} ms`);

const fails = {};
const fail = (kind, msg) => { (fails[kind] = fails[kind] || []).push(msg); };
const sig = (a) => { const A = data.areas[a]; return JSON.stringify([a === 0 ? 'standard' : A[0].toLowerCase(), A[4], A[3]]); };

// 1. every ZIP in GSA's file gives exactly GSA's rate area(s)
let zOk = 0, zSplit = 0;
for (const [z, want] of Object.entries(exp.gsa)) {
  const r = PD.zip(z);
  if (!r) { fail('gsa zip missing', z); continue; }
  const got = r.choices.map(c => sig(c.a)).sort(), w = want.map(x => JSON.stringify(x)).sort();
  if (JSON.stringify(got) !== JSON.stringify(w)) fail('gsa zip wrong', `${z}: got ${got} want ${w}`);
  else { zOk++; if (w.length > 1) zSplit++; }
  const s = PD.search(z);
  if (!s.length || s[0].zip !== z) fail('zip search', z);
}
// 2. every GeoNames ZIP resolves (inside CONUS to a rate, outside to the Defense Dept. message)
let gOk = 0, gOut = 0, gInf = 0;
for (const [z, st] of Object.entries(exp.geoZips)) {
  const r = PD.zip(z);
  if (!r) { fail('geonames zip missing', z); continue; }
  const conus = exp.conus.includes(st);
  if (conus ? !r.choices.length : !r.out) { fail('geonames zip unresolved', z + ' ' + st); continue; }
  gOk++; if (!conus) gOut++; if (r.inferred) gInf++;
}
// 3. every GeoNames city and every Census place / town / county is found by "Name, ST", as the first suggestion
function checkName(kind, name, st) {
  const res = PD.search(name + ', ' + st);
  const k = PD.key(name);
  const hit = res.find(x => x.st === st && PD.key(x.n) === k);
  if (!hit) { fail(kind + ' not found', name + ', ' + st); return null; }
  if (res[0] !== hit) fail(kind + ' not first', name + ', ' + st + ' -> ' + res[0].label);
  if (!hit.out && !hit.choices.length) fail(kind + ' no rate', name + ', ' + st);
  return hit;
}
let geoN = 0, cenN = 0;
const multi = new Set();
for (const [name, st] of exp.geoPlaces) { const h = checkName('geonames place', name, st); if (h) { geoN++; if (h.choices.length > 1) multi.add(h.label); } }
for (const [name, st] of exp.census) { const h = checkName('census place', name, st); if (h) { cenN++; if (h.choices.length > 1) multi.add(h.label); } }
// 4. every record in the data is reachable by its own label, and every area index is valid
let recN = 0;
for (const p of PD.places) {
  const res = PD.search(p.n + ', ' + p.st);
  if (!res.length || res[0].n !== p.n || res[0].st !== p.st) fail('record not first', p.n + ', ' + p.st + ' -> ' + (res[0] ? res[0].label : 'nothing'));
  const it = PD.findPlace(p.st, p.n);
  for (const c of it.choices) if (!data.areas[c.a]) fail('bad area index', p.n + ', ' + p.st);
  recN++;
}
// 5. typed variants people use
const variants = [
  ['kansas city mo', 'Kansas City, MO'], ['Kansas City, Missouri', 'Kansas City, MO'], ['kansas city ks', 'Kansas City, KS'],
  ['saint louis', 'St. Louis, MO'], ['St Louis MO', 'St. Louis, MO'], ['washington dc', 'Washington, DC'], ['Washington, D.C.', 'Washington, DC'],
  ['New York City', 'New York City, NY'], ['nyc', 'NYC, NY'], ['Manhattan, NY', 'Manhattan, NY'], ['brooklyn', 'Brooklyn, NY'],
  ['Ft Lauderdale', 'Fort Lauderdale, FL'], ['Mt Pleasant SC', 'Mount Pleasant, SC'], ['Arlington, VA', 'Arlington, VA'], ['arlington tx', 'Arlington, TX'],
  ['Portland', 'Portland, OR'], ['Dayton Ohio', 'Dayton, OH'], ['Queens County, NY', 'Queens County, NY'], ['Lake in the Hills', 'Lake in the Hills, IL'],
  ['Española, NM', 'Española, NM'], ['Espanola NM', 'Española, NM'], ['Coeur d\'Alene', 'Coeur d\'Alene, ID'],
];
for (const [q, want] of variants) { const r = PD.search(q); if (!r.length || r[0].label !== want) fail('variant', `${q} -> ${r[0] ? r[0].label : 'nothing'} (want ${want})`); }
for (const q of ['Daytn, OH', 'Springfeld, ZZ', '00000']) if (PD.search(q).length) fail('junk matched', q + ' -> ' + PD.search(q)[0].label);

console.log(`GSA ZIPs: ${zOk}/${Object.keys(exp.gsa).length} match GSA's file exactly (${zSplit} of them split across 2+ areas, shown as a choice)`);
console.log(`GeoNames ZIPs: ${gOk}/${Object.keys(exp.geoZips).length} resolve (${gOut} outside CONUS -> Defense Dept. note, ${gInf} not in GSA's file -> rate from same-name or nearest ZIP)`);
console.log(`GeoNames places: ${geoN}/${exp.geoPlaces.length} found as first suggestion; Census places/towns/counties: ${cenN}/${exp.census.length}`);
console.log(`Data records: ${recN} reachable; distinct places offering a choice of areas: ${multi.size}`);
const kinds = Object.keys(fails);
if (!kinds.length) { console.log('ALL CHECKS PASSED'); process.exit(0); }
for (const k of kinds) console.log(`FAIL ${k}: ${fails[k].length}\n  ` + fails[k].slice(0, 12).join('\n  '));
process.exit(1);
