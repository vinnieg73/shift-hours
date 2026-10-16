// Spot-check the page's lookup against GSA's official per diem API (api.gsa.gov/travel/perdiem/v2).
// Usage: node scripts/spotcheck_perdiem.mjs index.html data/perdiem-fy2027.json <cache dir> [api key]
// DEMO_KEY allows about 30 calls an hour, so answers are cached in <cache dir> and reruns are free.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [page, dataPath, cache, apiKey = 'DEMO_KEY'] = process.argv.slice(2);
const html = readFileSync(page, 'utf8');
const PD = new Function(/\/\* pd-core:start[^]*?\*\/([^]*?)\/\* pd-core:end \*\//.exec(html)[1] + '\nreturn PDcore;')();
const data = JSON.parse(readFileSync(dataPath, 'utf8'));
PD.index(data);
mkdirSync(cache, { recursive: true });

// [what a person types, a ZIP in that place to ask GSA about]
const CASES = [
  ['New York, NY', '10001'], ['Brooklyn, NY', '11201'], ['Queens, NY', '11354'], ['Bronx, NY', '10451'], ['Staten Island, NY', '10301'],
  ['Kansas City, MO', '64106'], ['Kansas City, KS', '66101'], ['Arlington, VA', '22201'], ['Arlington, TX', '76010'],
  ['Sedona, AZ', '86336'], ['Flagstaff, AZ', '86001'], ['Santa Monica, CA', '90401'], ['Los Angeles, CA', '90012'],
  ['Falmouth, MA', '02540'], ['Hyannis, MA', '02601'], ['Boston, MA', '02108'], ['Cambridge, MA', '02139'], ['Somerville, MA', '02143'],
  ['Chicago, IL', '60601'], ['Seattle, WA', '98101'], ['Denver, CO', '80202'], ['Miami, FL', '33130'], ['Austin, TX', '78701'],
  ['Gulf Shores, AL', '36542'], ['Jackson, WY', '83001'], ['Grapevine, TX', '76051'], ['Monowi, NE', '68746'],
];
const CITY_CASES = [['Somerville', 'MA'], ['Kansas City', 'MO']]; // how GSA's own city search answers

async function get(path) {
  const f = join(cache, path.replace(/[^a-z0-9]+/gi, '_') + '.json');
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  let r;
  for (let tries = 0; ; tries++) {
    r = await fetch('https://api.gsa.gov/travel/perdiem/v2/' + path, { headers: { 'X-API-KEY': apiKey } });
    if (r.status !== 429 || tries > 40) break;
    console.log(`  (rate limit hit at ${new Date().toTimeString().slice(0, 8)}; waiting 7 minutes)`);
    await new Promise(res => setTimeout(res, 7 * 60e3));
  }
  if (!r.ok) throw new Error(path + ': HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const j = await r.json();
  writeFileSync(f, JSON.stringify(j));
  return j;
}
// GSA answer -> list of {city, county, lodging Oct..Sep, meals}
function gsaRates(j) {
  const out = [];
  for (const blk of j.rates || []) for (const r of blk.rate || []) {
    const m = {}; for (const x of r.months.month) m[x.number] = x.value;
    out.push({ city: r.city, county: r.county, std: r.standardRate, l: [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => m[k]), meals: r.meals });
  }
  return out;
}
const same = (a, g) => JSON.stringify(data.areas[a][4]) === JSON.stringify(g.l) && data.areas[a][3] === g.meals;

let pass = 0, fail = 0;
for (const [q, zip] of CASES) {
  const ours = PD.search(q)[0];
  const g = gsaRates(await get(`rates/zip/${zip}/year/${data.fy}`));
  const ourNames = ours ? ours.choices.map(c => data.areas[c.a][0] + ' $' + data.areas[c.a][4][0] + '/$' + data.areas[c.a][3]) : ['nothing'];
  const gNames = g.map(x => (x.city || '?') + ' $' + x.l[0] + '/$' + x.meals);
  // pass: the ZIP gives GSA's exact set, and the city's answer is one of GSA's answers for that ZIP
  // (a ZIP can run past the city limits into another rate area, e.g. Sedona's 86336)
  // (a city with a choice of areas passes when GSA's answer for this ZIP is one of its choices)
  const cityOk = ours && g.length && ours.choices.some(c => g.some(x => same(c.a, x))) &&
    (ours.choices.length > 1 || g.some(x => same(ours.choices[0].a, x)));
  const z = PD.zip(zip), zipOk = z && z.choices.length === g.length && g.every(x => z.choices.some(c => same(c.a, x)));
  const ok = cityOk && zipOk;
  ok ? pass++ : fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${q.padEnd(18)} ZIP ${zip}  ours: ${ourNames.join(' | ')}  GSA: ${gNames.join(' | ')}`);
}
for (const [c, st] of CITY_CASES) {
  const g = gsaRates(await get(`rates/city/${encodeURIComponent(c)}/state/${st}/year/${data.fy}`));
  const ours = PD.search(c + ', ' + st)[0];
  console.log(`info GSA city search "${c}, ${st}": ${g.map(x => (x.city || '?') + ' $' + x.l[0] + '/$' + x.meals + (x.std === 'true' ? ' (standard)' : '')).join(' | ')}; ours: ${ours.choices.map(x => data.areas[x.a][0]).join(' | ')}`);
}
console.log(`spot check: ${pass} OK, ${fail} FAIL of ${CASES.length}`);
process.exit(fail ? 1 : 0);
